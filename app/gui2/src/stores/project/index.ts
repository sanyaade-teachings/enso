import { injectGuiConfig, type GuiConfig } from '@/providers/guiConfig'
import { Awareness } from '@/stores/awareness'
import { ComputedValueRegistry } from '@/stores/project/computedValueRegistry'
import { VisualizationDataRegistry } from '@/stores/project/visualizationDataRegistry'
import { attachProvider, useObserveYjs } from '@/util/crdt'
import { nextEvent } from '@/util/data/observable'
import { isSome, type Opt } from '@/util/data/opt'
import { Err, Ok, type Result } from '@/util/data/result'
import { ReactiveMapping } from '@/util/database/reactiveDb'
import {
  AsyncQueue,
  createRpcTransport,
  createWebsocketClient,
  rpcWithRetries as lsRpcWithRetries,
  useAbortScope,
} from '@/util/net'
import { tryQualifiedName } from '@/util/qualifiedName'
import { Client, RequestManager } from '@open-rpc/client-js'
import { computedAsync } from '@vueuse/core'
import * as array from 'lib0/array'
import * as object from 'lib0/object'
import { ObservableV2 } from 'lib0/observable'
import * as random from 'lib0/random'
import { defineStore } from 'pinia'
import { OutboundPayload, VisualizationUpdate } from 'shared/binaryProtocol'
import { DataServer } from 'shared/dataServer'
import { LanguageServer } from 'shared/languageServer'
import type {
  ContentRoot,
  ContextId,
  Diagnostic,
  ExecutionEnvironment,
  ExplicitCall,
  ExpressionId,
  ExpressionUpdate,
  MethodPointer,
  StackItem,
  VisualizationConfiguration,
} from 'shared/languageServerTypes'
import type { AbortScope } from 'shared/util/net'
import {
  DistributedProject,
  localUserActionOrigins,
  type ExternalId,
  type Uuid,
} from 'shared/yjsModel'
import {
  computed,
  markRaw,
  onScopeDispose,
  reactive,
  ref,
  shallowRef,
  watch,
  watchEffect,
  type WatchSource,
  type WritableComputedRef,
} from 'vue'
import * as Y from 'yjs'

interface LsUrls {
  rpcUrl: string
  dataUrl: string
}

function resolveLsUrl(config: GuiConfig): LsUrls {
  const engine = config.engine
  if (engine == null) throw new Error('Missing engine configuration')
  if (engine.rpcUrl != null && engine.dataUrl != null) {
    return {
      rpcUrl: engine.rpcUrl,
      dataUrl: engine.dataUrl,
    }
  }
  throw new Error('Incomplete engine configuration')
}

async function initializeLsRpcConnection(
  clientId: Uuid,
  url: string,
  abort: AbortScope,
): Promise<{
  connection: LanguageServer
  contentRoots: ContentRoot[]
}> {
  const transport = createRpcTransport(url)
  const requestManager = new RequestManager([transport])
  const client = new Client(requestManager)
  const connection = new LanguageServer(client)
  abort.onAbort(() => connection.release())
  const initialization = await lsRpcWithRetries(() => connection.initProtocolConnection(clientId), {
    onBeforeRetry: (error, _, delay) => {
      console.warn(
        `Failed to initialize language server connection, retrying after ${delay}ms...\n`,
        error,
      )
    },
  }).catch((error) => {
    console.error('Error initializing Language Server RPC:', error)
    throw error
  })
  const contentRoots = initialization.contentRoots
  return { connection, contentRoots }
}

async function initializeDataConnection(clientId: Uuid, url: string, abort: AbortScope) {
  const client = createWebsocketClient(url, abort, { binaryType: 'arraybuffer', sendPings: false })
  const connection = new DataServer(client, abort)
  onScopeDispose(() => connection.dispose())
  await connection.initialize(clientId).catch((error) => {
    console.error('Error initializing data connection:', error)
    throw error
  })
  return connection
}

export type NodeVisualizationConfiguration = Omit<
  VisualizationConfiguration,
  'executionContextId'
> & {
  expressionId: ExternalId
}

interface ExecutionContextState {
  lsRpc: LanguageServer
  created: boolean
  visualizations: Map<Uuid, NodeVisualizationConfiguration>
  stack: StackItem[]
}

function visualizationConfigEqual(
  a: NodeVisualizationConfiguration,
  b: NodeVisualizationConfiguration,
): boolean {
  return (
    a === b ||
    (a.visualizationModule === b.visualizationModule &&
      (a.positionalArgumentsExpressions === b.positionalArgumentsExpressions ||
        (Array.isArray(a.positionalArgumentsExpressions) &&
          Array.isArray(b.positionalArgumentsExpressions) &&
          array.equalFlat(a.positionalArgumentsExpressions, b.positionalArgumentsExpressions))) &&
      (a.expression === b.expression ||
        (typeof a.expression === 'object' &&
          typeof b.expression === 'object' &&
          object.equalFlat(a.expression, b.expression))))
  )
}

type EntryPoint = Omit<ExplicitCall, 'type'>

type ExecutionContextNotification = {
  'expressionUpdates'(updates: ExpressionUpdate[]): void
  'visualizationEvaluationFailed'(
    visualizationId: Uuid,
    expressionId: ExpressionId,
    message: string,
    diagnostic: Diagnostic | undefined,
  ): void
  'executionFailed'(message: string): void
  'executionComplete'(): void
  'executionStatus'(diagnostics: Diagnostic[]): void
  'newVisualizationConfiguration'(configs: Set<Uuid>): void
  'visualizationsConfigured'(configs: Set<Uuid>): void
}

/**
 * Execution Context
 *
 * This class represent an execution context created in the Language Server. It creates
 * it and pushes the initial frame upon construction.
 *
 * It hides the asynchronous nature of the language server. Each call is scheduled and
 * run only when the previous call is done.
 */
export class ExecutionContext extends ObservableV2<ExecutionContextNotification> {
  id: ContextId = random.uuidv4() as ContextId
  queue: AsyncQueue<ExecutionContextState>
  taskRunning = false
  visSyncScheduled = false
  desiredStack: StackItem[] = reactive([])
  visualizationConfigs: Map<Uuid, NodeVisualizationConfiguration> = new Map()

  constructor(
    lsRpc: Promise<LanguageServer>,
    entryPoint: EntryPoint,
    private abort: AbortScope,
  ) {
    super()
    this.abort.handleDispose(this)

    this.queue = new AsyncQueue(
      lsRpc.then((lsRpc) => ({
        lsRpc,
        created: false,
        visualizations: new Map(),
        stack: [],
      })),
    )
    this.registerHandlers()
    this.create()
    this.pushItem({ type: 'ExplicitCall', ...entryPoint })
    this.recompute()
  }

  private withBackoff<T>(f: () => Promise<T>, message: string): Promise<T> {
    return lsRpcWithRetries(f, {
      onBeforeRetry: (error, _, delay) => {
        if (this.abort.signal.aborted) return false
        console.warn(
          `${message}: ${error.payload.cause.message}. Retrying after ${delay}ms...\n`,
          error,
        )
      },
    })
  }

  private syncVisualizations() {
    if (this.visSyncScheduled || this.abort.signal.aborted) return
    this.visSyncScheduled = true
    this.queue.pushTask(async (state) => {
      this.visSyncScheduled = false
      if (!state.created || this.abort.signal.aborted) return state
      this.emit('newVisualizationConfiguration', [new Set(this.visualizationConfigs.keys())])
      const promises: Promise<void>[] = []

      const attach = (id: Uuid, config: NodeVisualizationConfiguration) => {
        return this.withBackoff(
          () =>
            state.lsRpc.attachVisualization(id, config.expressionId, {
              executionContextId: this.id,
              expression: config.expression,
              visualizationModule: config.visualizationModule,
              ...(config.positionalArgumentsExpressions ?
                { positionalArgumentsExpressions: config.positionalArgumentsExpressions }
              : {}),
            }),
          'Failed to attach visualization',
        ).then(() => {
          state.visualizations.set(id, config)
        })
      }

      const modify = (id: Uuid, config: NodeVisualizationConfiguration) => {
        return this.withBackoff(
          () =>
            state.lsRpc.modifyVisualization(id, {
              executionContextId: this.id,
              expression: config.expression,
              visualizationModule: config.visualizationModule,
              ...(config.positionalArgumentsExpressions ?
                { positionalArgumentsExpressions: config.positionalArgumentsExpressions }
              : {}),
            }),
          'Failed to modify visualization',
        ).then(() => {
          state.visualizations.set(id, config)
        })
      }

      const detach = (id: Uuid, config: NodeVisualizationConfiguration) => {
        return this.withBackoff(
          () => state.lsRpc.detachVisualization(id, config.expressionId, this.id),
          'Failed to detach visualization',
        ).then(() => {
          state.visualizations.delete(id)
        })
      }

      // Attach new and update existing visualizations.
      for (const [id, config] of this.visualizationConfigs) {
        const previousConfig = state.visualizations.get(id)
        if (previousConfig == null) {
          promises.push(attach(id, config))
        } else if (!visualizationConfigEqual(previousConfig, config)) {
          if (previousConfig.expressionId === config.expressionId) {
            promises.push(modify(id, config))
          } else {
            promises.push(detach(id, previousConfig).then(() => attach(id, config)))
          }
        }
      }

      // Detach removed visualizations.
      for (const [id, config] of state.visualizations) {
        if (!this.visualizationConfigs.get(id)) {
          promises.push(detach(id, config))
        }
      }
      const settled = await Promise.allSettled(promises)

      // Emit errors for failed requests.
      const errors = settled
        .map((result) => (result.status === 'rejected' ? result.reason : null))
        .filter(isSome)
      if (errors.length > 0) {
        console.error('Failed to synchronize visualizations:', errors)
      }

      this.emit('visualizationsConfigured', [new Set(this.visualizationConfigs.keys())])

      // State object was updated in-place in each successful promise.
      return state
    })
  }

  private pushItem(item: StackItem) {
    this.desiredStack.push(item)
    this.queue.pushTask(async (state) => {
      if (!state.created) return state
      await this.withBackoff(
        () => state.lsRpc.pushExecutionContextItem(this.id, item),
        'Failed to push item to execution context stack',
      )
      state.stack.push(item)
      return state
    })
  }

  push(expressionId: ExpressionId) {
    this.pushItem({ type: 'LocalCall', expressionId })
  }

  pop() {
    if (this.desiredStack.length === 1) {
      console.debug('Cannot pop last item from execution context stack')
      return
    }
    this.desiredStack.pop()
    this.queue.pushTask(async (state) => {
      if (!state.created) return state
      if (state.stack.length === 1) {
        console.debug('Cannot pop last item from execution context stack')
        return state
      }
      await this.withBackoff(
        () => state.lsRpc.popExecutionContextItem(this.id),
        'Failed to pop item from execution context stack',
      )
      state.stack.pop()
      return state
    })
  }

  async setVisualization(id: Uuid, configuration: Opt<NodeVisualizationConfiguration>) {
    if (configuration == null) {
      this.visualizationConfigs.delete(id)
    } else {
      this.visualizationConfigs.set(id, configuration)
    }
    this.syncVisualizations()
  }

  private create() {
    this.queue.pushTask(async (state) => {
      if (state.created) return state
      return this.withBackoff(async () => {
        const result = await state.lsRpc.createExecutionContext(this.id)
        if (result.contextId !== this.id) {
          throw new Error('Unexpected Context ID returned by the language server.')
        }
        state.lsRpc.retain()
        return { ...state, created: true }
      }, 'Failed to create execution context')
    })
  }

  private registerHandlers() {
    this.queue.pushTask(async (state) => {
      this.abort.handleObserve(state.lsRpc, 'executionContext/expressionUpdates', (event) => {
        if (event.contextId == this.id) this.emit('expressionUpdates', [event.updates])
      })
      this.abort.handleObserve(state.lsRpc, 'executionContext/executionFailed', (event) => {
        if (event.contextId == this.id) this.emit('executionFailed', [event.message])
      })
      this.abort.handleObserve(state.lsRpc, 'executionContext/executionComplete', (event) => {
        if (event.contextId == this.id) this.emit('executionComplete', [])
      })
      this.abort.handleObserve(state.lsRpc, 'executionContext/executionStatus', (event) => {
        if (event.contextId == this.id) this.emit('executionStatus', [event.diagnostics])
      })
      this.abort.handleObserve(
        state.lsRpc,
        'executionContext/visualizationEvaluationFailed',
        (event) => {
          if (event.contextId == this.id)
            this.emit('visualizationEvaluationFailed', [
              event.visualizationId,
              event.expressionId,
              event.message,
              event.diagnostic,
            ])
        },
      )
      return state
    })
  }

  recompute(
    expressionIds: 'all' | ExternalId[] = 'all',
    executionEnvironment?: ExecutionEnvironment,
  ) {
    this.queue.pushTask(async (state) => {
      if (!state.created) return state
      await state.lsRpc.recomputeExecutionContext(this.id, expressionIds, executionEnvironment)
      return state
    })
  }

  getStackBottom(): StackItem {
    return this.desiredStack[0]!
  }

  getStackTop(): StackItem {
    return this.desiredStack[this.desiredStack.length - 1]!
  }

  setExecutionEnvironment(mode: ExecutionEnvironment) {
    this.queue.pushTask(async (state) => {
      await state.lsRpc.setExecutionEnvironment(this.id, mode)
      return state
    })
  }

  dispose() {
    this.queue.pushTask(async (state) => {
      if (!state.created) return state
      await state.lsRpc.destroyExecutionContext(this.id)
      state.lsRpc.release()
      return { ...state, created: false }
    })
  }
}

/**
 * The project store synchronizes and holds the open project-related data. The synchronization is
 * performed using a CRDT data types from Yjs. Once the data is synchronized with a "LS bridge"
 * client, it is submitted to the language server as a document update.
 */
export const useProjectStore = defineStore('project', () => {
  const abort = useAbortScope()

  const observedFileName = ref<string>()

  const doc = new Y.Doc()
  const awareness = new Awareness(doc)

  const config = injectGuiConfig()
  const projectName = config.value.startup?.project
  if (projectName == null) throw new Error('Missing project name.')
  const projectDisplayName = config.value.startup?.displayedProjectName ?? projectName

  const clientId = random.uuidv4() as Uuid
  const lsUrls = resolveLsUrl(config.value)
  const initializedConnection = initializeLsRpcConnection(clientId, lsUrls.rpcUrl, abort)
  const lsRpcConnection = initializedConnection.then(
    ({ connection }) => connection,
    (error) => {
      console.error('Error getting Language Server connection:', error)
      throw error
    },
  )
  const contentRoots = initializedConnection.then(
    ({ contentRoots }) => contentRoots,
    (error) => {
      console.error('Error getting content roots:', error)
      throw error
    },
  )

  const dataConnection = initializeDataConnection(clientId, lsUrls.dataUrl, abort)
  const rpcUrl = new URL(lsUrls.rpcUrl)
  const isOnLocalBackend =
    rpcUrl.protocol === 'mock:' ||
    rpcUrl.hostname === 'localhost' ||
    rpcUrl.hostname === '127.0.0.1' ||
    rpcUrl.hostname === '[::1]' ||
    rpcUrl.hostname === '0:0:0:0:0:0:0:1'

  const name = computed(() => config.value.startup?.project)
  const namespace = computed(() => config.value.engine?.namespace)
  const fullName = computed(() => {
    const ns = namespace.value
    if (import.meta.env.PROD && ns == null) {
      console.warn(
        'Unknown project\'s namespace. Assuming "local", however it likely won\'t work in cloud',
      )
    }
    const projectName = name.value
    if (projectName == null) {
      console.error(
        "Unknown project's name. Cannot specify opened module's qualified path; many things may not work",
      )
      return null
    }
    return `${ns ?? 'local'}.${projectName}`
  })
  const modulePath = computed(() => {
    const filePath = observedFileName.value
    if (filePath == null) return undefined
    const withoutFileExt = filePath.replace(/\.enso$/, '')
    const withDotSeparators = withoutFileExt.replace(/\//g, '.')
    return tryQualifiedName(`${fullName.value}.${withDotSeparators}`)
  })

  let yDocsProvider: ReturnType<typeof attachProvider> | undefined
  watchEffect((onCleanup) => {
    // For now, let's assume that the websocket server is running on the same host as the web server.
    // Eventually, we can make this configurable, or even runtime variable.
    const socketUrl = new URL(location.origin)
    socketUrl.protocol = location.protocol.replace(/^http/, 'ws')
    socketUrl.pathname = '/project'
    yDocsProvider = attachProvider(
      socketUrl.href,
      'index',
      { ls: lsUrls.rpcUrl },
      doc,
      awareness.internal,
    )
    onCleanup(disposeYDocsProvider)
  })

  const projectModel = new DistributedProject(doc)
  const moduleDocGuid = ref<string>()

  function currentDocGuid() {
    const name = observedFileName.value
    if (name == null) return
    return projectModel.modules.get(name)?.guid
  }
  function tryReadDocGuid() {
    const guid = currentDocGuid()
    if (guid === moduleDocGuid.value) return
    moduleDocGuid.value = guid
  }

  projectModel.modules.observe(tryReadDocGuid)
  watchEffect(tryReadDocGuid)

  const module = computedAsync(async () => {
    const guid = moduleDocGuid.value
    if (guid == null) return null
    const moduleName = projectModel.findModuleByDocId(guid)
    if (moduleName == null) return null
    const mod = await projectModel.openModule(moduleName)
    for (const origin of localUserActionOrigins) mod?.undoManager.addTrackedOrigin(origin)
    return mod
  })

  const entryPoint = computed<MethodPointer>(() => {
    const projectName = fullName.value
    const mainModule = `${projectName}.Main`
    return { module: mainModule, definedOnType: mainModule, name: 'main' }
  })

  function createExecutionContextForMain(): ExecutionContext {
    return new ExecutionContext(
      lsRpcConnection,
      {
        methodPointer: entryPoint.value,
        positionalArgumentsExpressions: [],
      },
      abort,
    )
  }

  const firstExecution = lsRpcConnection.then(
    (lsRpc) =>
      nextEvent(lsRpc, 'executionContext/executionComplete').catch((error) => {
        console.error('First execution failed:', error)
        throw error
      }),
    (error) => {
      console.error('Could not get Language Server for first execution:', error)
      throw error
    },
  )
  const executionContext = createExecutionContextForMain()
  const visualizationDataRegistry = new VisualizationDataRegistry(executionContext, dataConnection)
  const computedValueRegistry = ComputedValueRegistry.WithExecutionContext(executionContext)

  const diagnostics = shallowRef<Diagnostic[]>([])
  executionContext.on('executionStatus', (newDiagnostics) => {
    diagnostics.value = newDiagnostics
  })

  function useVisualizationData(configuration: WatchSource<Opt<NodeVisualizationConfiguration>>) {
    const id = random.uuidv4() as Uuid

    watch(
      configuration,
      (config, _, onCleanup) => {
        executionContext.setVisualization(id, config)
        onCleanup(() => executionContext.setVisualization(id, null))
      },
      // Make sure to flush this watch in 'post', otherwise it might cause operations on stale
      // ASTs just before the widget tree renders and cleans up the associated widget instances.
      { immediate: true, flush: 'post' },
    )

    return computed(() => {
      const json = visualizationDataRegistry.getRawData(id)
      if (!json?.ok) return json ?? undefined
      const parsed = Ok(JSON.parse(json.value))
      markRaw(parsed)
      return parsed
    })
  }

  const dataflowErrors = new ReactiveMapping(computedValueRegistry.db, (id, info) => {
    const config = computed(() =>
      info.payload.type === 'DataflowError' ?
        {
          expressionId: id,
          visualizationModule: 'Standard.Visualization.Preprocessor',
          expression: {
            module: 'Standard.Visualization.Preprocessor',
            definedOnType: 'Standard.Visualization.Preprocessor',
            name: 'error_preprocessor',
          },
        }
      : null,
    )
    const data = useVisualizationData(config)
    return computed<{ kind: 'Dataflow'; message: string } | undefined>(() => {
      const visResult = data.value
      if (!visResult) return
      if (!visResult.ok) {
        visResult.error.log('Dataflow Error visualization evaluation failed')
        return undefined
      } else if ('message' in visResult.value && typeof visResult.value.message === 'string') {
        if ('kind' in visResult.value && visResult.value.kind === 'Dataflow')
          return { kind: visResult.value.kind, message: visResult.value.message }
        // Other kinds of error are not handled here
        else return undefined
      } else {
        console.error('Invalid dataflow error payload:', visResult.value)
        return undefined
      }
    })
  })

  const isRecordingEnabled = computed(() => executionMode.value === 'live')

  function stopCapturingUndo() {
    module.value?.undoManager.stopCapturing()
  }

  function executeExpression(
    expressionId: ExternalId,
    expression: string,
  ): Promise<Result<string> | null> {
    return new Promise((resolve) => {
      Promise.all([lsRpcConnection, dataConnection]).then(([lsRpc, data]) => {
        const visualizationId = random.uuidv4() as Uuid
        const dataHandler = (visData: VisualizationUpdate, uuid: Uuid | null) => {
          if (uuid === visualizationId) {
            const dataStr = visData.dataString()
            resolve(dataStr != null ? Ok(dataStr) : null)
            data.off(`${OutboundPayload.VISUALIZATION_UPDATE}`, dataHandler)
            executionContext.off('visualizationEvaluationFailed', errorHandler)
          }
        }
        const errorHandler = (
          uuid: Uuid,
          _expressionId: ExpressionId,
          message: string,
          _diagnostic: Diagnostic | undefined,
        ) => {
          if (uuid == visualizationId) {
            resolve(Err(message))
            data.off(`${OutboundPayload.VISUALIZATION_UPDATE}`, dataHandler)
            executionContext.off('visualizationEvaluationFailed', errorHandler)
          }
        }
        data.on(`${OutboundPayload.VISUALIZATION_UPDATE}`, dataHandler)
        executionContext.on('visualizationEvaluationFailed', errorHandler)
        lsRpc.executeExpression(executionContext.id, visualizationId, expressionId, expression)
      })
    })
  }

  const { executionMode } = setupSettings(projectModel)

  function disposeYDocsProvider() {
    yDocsProvider?.dispose()
    yDocsProvider = undefined
  }

  const recordMode = computed({
    get() {
      return executionMode.value === 'live'
    },
    set(value) {
      executionMode.value = value ? 'live' : 'design'
    },
  })

  return {
    setObservedFileName(name: string) {
      observedFileName.value = name
    },
    get observedFileName() {
      return observedFileName.value
    },
    name: projectName,
    displayName: projectDisplayName,
    isOnLocalBackend,
    executionContext,
    firstExecution,
    diagnostics,
    module,
    modulePath,
    entryPoint,
    projectModel,
    contentRoots,
    awareness: markRaw(awareness),
    computedValueRegistry: markRaw(computedValueRegistry),
    lsRpcConnection: markRaw(lsRpcConnection),
    dataConnection: markRaw(dataConnection),
    useVisualizationData,
    isRecordingEnabled,
    stopCapturingUndo,
    executionMode,
    recordMode,
    dataflowErrors,
    executeExpression,
    disposeYDocsProvider,
  }
})

type ExecutionMode = 'live' | 'design'
type Settings = { executionMode: WritableComputedRef<ExecutionMode> }
function setupSettings(project: DistributedProject | null): Settings {
  const settings = computed(() => project?.settings)
  // Value synchronized with a key of the `settings` map, used to enforce reactive dependencies.
  const executionMode_ = ref<ExecutionMode>()
  const executionMode = computed<ExecutionMode>({
    get() {
      return executionMode_.value ?? 'design'
    },
    set(value) {
      // Update the synchronized map; the change observer will set `executionMode_`.
      if (settings.value != null) settings.value.set('executionMode', value)
    },
  })
  useObserveYjs(settings, (event) => {
    event.changes.keys.forEach((change, key) => {
      if (key == 'executionMode') {
        if (change.action === 'add' || change.action === 'update') {
          switch (settings.value?.get('executionMode')) {
            case 'design':
              executionMode_.value = 'design'
              break
            case 'live':
              executionMode_.value = 'live'
              break
            default:
              console.log(`Bug: Unexpected executionMode. Ignoring...`, executionMode)
              break
          }
        } else if (change.action === 'delete') {
          executionMode_.value = undefined
        }
      }
    })
  })
  return { executionMode }
}
