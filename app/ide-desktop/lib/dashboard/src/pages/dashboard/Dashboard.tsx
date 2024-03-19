/** @file Main dashboard component, responsible for listing user's projects as well as other
 * interactive components. */
import * as React from 'react'

import * as detect from 'enso-common/src/detect'

import * as eventHooks from '#/hooks/eventHooks'
import * as searchParamsState from '#/hooks/searchParamsState'

import * as authProvider from '#/providers/AuthProvider'
import * as backendProvider from '#/providers/BackendProvider'
import * as inputBindingsProvider from '#/providers/InputBindingsProvider'
import * as localStorageProvider from '#/providers/LocalStorageProvider'
import * as loggerProvider from '#/providers/LoggerProvider'
import * as modalProvider from '#/providers/ModalProvider'

import type * as assetEvent from '#/events/assetEvent'
import AssetEventType from '#/events/AssetEventType'
import type * as assetListEvent from '#/events/assetListEvent'
import AssetListEventType from '#/events/AssetListEventType'

import type * as assetPanel from '#/layouts/AssetPanel'
import AssetPanel from '#/layouts/AssetPanel'
import type * as assetSearchBar from '#/layouts/AssetSearchBar'
import Category from '#/layouts/CategorySwitcher/Category'
import Chat from '#/layouts/Chat'
import ChatPlaceholder from '#/layouts/ChatPlaceholder'
import Drive from '#/layouts/Drive'
import Editor from '#/layouts/Editor'
import Home from '#/layouts/Home'
import * as pageSwitcher from '#/layouts/PageSwitcher'
import Settings from '#/layouts/Settings'
import TopBar from '#/layouts/TopBar'

import TheModal from '#/components/dashboard/TheModal'
import type * as spinner from '#/components/Spinner'

import * as backendModule from '#/services/Backend'
import LocalBackend from '#/services/LocalBackend'
import RemoteBackend, * as remoteBackendModule from '#/services/RemoteBackend'

import * as array from '#/utilities/array'
import AssetQuery from '#/utilities/AssetQuery'
import HttpClient from '#/utilities/HttpClient'
import LocalStorage from '#/utilities/LocalStorage'
import * as object from '#/utilities/object'
import * as sanitizedEventTargets from '#/utilities/sanitizedEventTargets'

// ============================
// === Global configuration ===
// ============================

declare module '#/utilities/LocalStorage' {
  /** */
  interface LocalStorageData {
    readonly isAssetPanelVisible: boolean
    readonly page: pageSwitcher.Page
    readonly projectStartupInfo: backendModule.ProjectStartupInfo
  }
}

LocalStorage.registerKey('isAssetPanelVisible', {
  tryParse: value => (value === true ? value : null),
})

const PAGES = Object.values(pageSwitcher.Page)
LocalStorage.registerKey('page', {
  tryParse: value => (array.includes(PAGES, value) ? value : null),
})

const BACKEND_TYPES = Object.values(backendModule.BackendType)
LocalStorage.registerKey('projectStartupInfo', {
  isUserSpecific: true,
  tryParse: value => {
    if (typeof value !== 'object' || value == null) {
      return null
    } else if (
      !('accessToken' in value) ||
      (typeof value.accessToken !== 'string' && value.accessToken != null)
    ) {
      return null
    } else if (!('backendType' in value) || !array.includes(BACKEND_TYPES, value.backendType)) {
      return null
    } else if (!('project' in value) || !('projectAsset' in value)) {
      return null
    } else {
      return {
        // These type assertions are UNSAFE, however correctly type-checking these
        // would be very complicated.
        // eslint-disable-next-line no-restricted-syntax
        project: value.project as backendModule.Project,
        // eslint-disable-next-line no-restricted-syntax
        projectAsset: value.projectAsset as backendModule.ProjectAsset,
        backendType: value.backendType,
        accessToken: value.accessToken ?? null,
      }
    }
  },
})

// =================
// === Dashboard ===
// =================

/** Props for {@link Dashboard}s that are common to all platforms. */
export interface DashboardProps {
  /** Whether the application may have the local backend running. */
  readonly supportsLocalBackend: boolean
  readonly appRunner: AppRunner
  readonly initialProjectName: string | null
  readonly projectManagerUrl: string | null
}

/** The component that contains the entire UI. */
export default function Dashboard(props: DashboardProps) {
  const { supportsLocalBackend, appRunner, initialProjectName: rawInitialProjectName } = props
  const { projectManagerUrl } = props
  const logger = loggerProvider.useLogger()
  const session = authProvider.useNonPartialUserSession()
  const { backend } = backendProvider.useBackend()
  const { setBackend } = backendProvider.useSetBackend()
  const { modalRef } = modalProvider.useModalRef()
  const { updateModal, unsetModal } = modalProvider.useSetModal()
  const { localStorage } = localStorageProvider.useLocalStorage()
  const inputBindings = inputBindingsProvider.useInputBindings()
  const [initialized, setInitialized] = React.useState(false)
  const [isHelpChatOpen, setIsHelpChatOpen] = React.useState(false)

  // These pages MUST be ROUTER PAGES.
  const [page, setPage] = searchParamsState.useSearchParamsState(
    'page',
    () => localStorage.get('page') ?? pageSwitcher.Page.drive,
    (value: unknown): value is pageSwitcher.Page =>
      array.includes(Object.values(pageSwitcher.Page), value)
  )
  const [queuedAssetEvents, setQueuedAssetEvents] = React.useState<assetEvent.AssetEvent[]>([])
  const [query, setQuery] = React.useState(() => AssetQuery.fromString(''))
  const [labels, setLabels] = React.useState<backendModule.Label[]>([])
  const [suggestions, setSuggestions] = React.useState<assetSearchBar.Suggestion[]>([])
  const [projectStartupInfo, setProjectStartupInfo] =
    React.useState<backendModule.ProjectStartupInfo | null>(null)
  const [openProjectAbortController, setOpenProjectAbortController] =
    React.useState<AbortController | null>(null)
  const [assetListEvents, dispatchAssetListEvent] =
    eventHooks.useEvent<assetListEvent.AssetListEvent>()
  const [assetEvents, dispatchAssetEvent] = eventHooks.useEvent<assetEvent.AssetEvent>()
  const [assetPanelProps, setAssetPanelProps] =
    React.useState<assetPanel.AssetPanelRequiredProps | null>(null)
  const [isAssetPanelEnabled, setIsAssetPanelEnabled] = React.useState(
    () => localStorage.get('isAssetPanelVisible') ?? false
  )
  const [isAssetPanelTemporarilyVisible, setIsAssetPanelTemporarilyVisible] = React.useState(false)
  const [initialProjectName, setInitialProjectName] = React.useState(rawInitialProjectName)
  const isCloud = backend.type === backendModule.BackendType.remote
  const rootDirectoryId = React.useMemo(
    () => session.user?.rootDirectoryId ?? backendModule.DirectoryId(''),
    [session.user]
  )
  const isAssetPanelVisible =
    page === pageSwitcher.Page.drive && (isAssetPanelEnabled || isAssetPanelTemporarilyVisible)

  React.useEffect(() => {
    setInitialized(true)
  }, [])

  React.useEffect(() => {
    unsetModal()
    // FIXME [sb]: https://github.com/enso-org/cloud-v2/issues/777
    // Workarounds for GUI1 should be removed when they are no longer necessary.
    document.body.style.cursor = page === pageSwitcher.Page.editor ? 'none' : 'auto'
  }, [page, /* should never change */ unsetModal])

  React.useEffect(() => {
    if (query.query !== '') {
      setPage(pageSwitcher.Page.drive)
    }
  }, [query, setPage])

  React.useEffect(() => {
    let currentBackend = backend
    if (
      supportsLocalBackend &&
      localStorage.get('backendType') === backendModule.BackendType.local
    ) {
      currentBackend = new LocalBackend(projectManagerUrl)
      setBackend(currentBackend)
    }
    const savedProjectStartupInfo = localStorage.get('projectStartupInfo')
    if (rawInitialProjectName != null) {
      if (page === pageSwitcher.Page.editor) {
        setPage(pageSwitcher.Page.drive)
      }
    } else if (savedProjectStartupInfo != null) {
      if (savedProjectStartupInfo.backendType === backendModule.BackendType.remote) {
        if (session.accessToken != null) {
          if (
            currentBackend.type === backendModule.BackendType.remote &&
            savedProjectStartupInfo.projectAsset.parentId === session.user.rootDirectoryId
          ) {
            // `projectStartupInfo` is still `null`, so the `editor` page will be empty.
            setPage(pageSwitcher.Page.drive)
            setQueuedAssetEvents([
              {
                type: AssetEventType.openProject,
                id: savedProjectStartupInfo.project.projectId,
                shouldAutomaticallySwitchPage: page === pageSwitcher.Page.editor,
                runInBackground: false,
              },
            ])
          } else {
            setPage(pageSwitcher.Page.drive)
            const httpClient = new HttpClient(
              new Headers([['Authorization', `Bearer ${session.accessToken}`]])
            )
            const remoteBackend = new RemoteBackend(httpClient, logger)
            void (async () => {
              const abortController = new AbortController()
              setOpenProjectAbortController(abortController)
              try {
                const oldProject = await backend.getProjectDetails(
                  savedProjectStartupInfo.projectAsset.id,
                  savedProjectStartupInfo.projectAsset.title
                )
                if (backendModule.IS_OPENING_OR_OPENED[oldProject.state.type]) {
                  await remoteBackendModule.waitUntilProjectIsReady(
                    remoteBackend,
                    savedProjectStartupInfo.projectAsset,
                    abortController
                  )
                  if (!abortController.signal.aborted) {
                    const project = await remoteBackend.getProjectDetails(
                      savedProjectStartupInfo.projectAsset.id,
                      savedProjectStartupInfo.projectAsset.title
                    )
                    setProjectStartupInfo(object.merge(savedProjectStartupInfo, { project }))
                    if (page === pageSwitcher.Page.editor) {
                      setPage(page)
                    }
                  }
                }
              } catch {
                setProjectStartupInfo(null)
              }
            })()
          }
        }
      } else {
        if (currentBackend.type === backendModule.BackendType.local) {
          setInitialProjectName(savedProjectStartupInfo.projectAsset.id)
        } else {
          const localBackend = new LocalBackend(projectManagerUrl)
          void (async () => {
            await localBackend.openProject(
              savedProjectStartupInfo.projectAsset.id,
              null,
              savedProjectStartupInfo.projectAsset.title
            )
            const project = await localBackend.getProjectDetails(
              savedProjectStartupInfo.projectAsset.id,
              savedProjectStartupInfo.projectAsset.title
            )
            setProjectStartupInfo(object.merge(savedProjectStartupInfo, { project }))
          })()
        }
      }
    }
    // This MUST only run when the component is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  eventHooks.useEventHandler(assetEvents, event => {
    switch (event.type) {
      case AssetEventType.openProject: {
        openProjectAbortController?.abort()
        setOpenProjectAbortController(null)
        break
      }
      default: {
        // Ignored.
        break
      }
    }
  })

  React.useEffect(() => {
    if (initialized) {
      if (projectStartupInfo != null) {
        localStorage.set('projectStartupInfo', projectStartupInfo)
      } else {
        localStorage.delete('projectStartupInfo')
      }
    }
    // `initialized` is NOT a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStartupInfo, /* should never change */ localStorage])

  React.useEffect(() => {
    localStorage.set('isAssetPanelVisible', isAssetPanelEnabled)
  }, [isAssetPanelEnabled, /* should never change */ localStorage])

  React.useEffect(() => {
    if (page !== pageSwitcher.Page.settings) {
      localStorage.set('page', page)
    }
  }, [page, /* should never change */ localStorage])

  React.useEffect(() => {
    const onClick = () => {
      if (getSelection()?.type !== 'Range') {
        unsetModal()
      }
    }
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
    }
  }, [/* should never change */ unsetModal])

  React.useEffect(
    () =>
      inputBindings.attach(sanitizedEventTargets.document.body, 'keydown', {
        closeModal: () => {
          updateModal(oldModal => {
            if (oldModal == null) {
              queueMicrotask(() => {
                setPage(oldPage => {
                  if (oldPage !== pageSwitcher.Page.settings) {
                    return oldPage
                  } else {
                    return localStorage.get('page') ?? pageSwitcher.Page.drive
                  }
                })
              })
              return oldModal
            } else {
              return null
            }
          })
          if (modalRef.current == null) {
            // eslint-disable-next-line no-restricted-syntax
            return false
          }
        },
      }),
    [inputBindings, modalRef, localStorage, updateModal, setPage]
  )

  React.useEffect(() => {
    if (detect.isOnElectron()) {
      // We want to handle the back and forward buttons in electron the same way as in the browser.
      // eslint-disable-next-line no-restricted-syntax
      return inputBindings.attach(sanitizedEventTargets.document.body, 'keydown', {
        goBack: () => {
          window.navigationApi.goBack()
        },
        goForward: () => {
          window.navigationApi.goForward()
        },
      })
    }
  }, [inputBindings])

  const setBackendType = React.useCallback(
    (newBackendType: backendModule.BackendType) => {
      if (newBackendType !== backend.type) {
        switch (newBackendType) {
          case backendModule.BackendType.local:
            setBackend(new LocalBackend(projectManagerUrl))
            break
          case backendModule.BackendType.remote: {
            const client = new HttpClient([
              ['Authorization', `Bearer ${session.accessToken ?? ''}`],
            ])
            setBackend(new RemoteBackend(client, logger))
            break
          }
        }
      }
    },
    [
      backend.type,
      session.accessToken,
      logger,
      /* should never change */ projectManagerUrl,
      /* should never change */ setBackend,
    ]
  )

  const doCreateProject = React.useCallback(
    (
      templateId: string | null = null,
      templateName: string | null = null,
      onSpinnerStateChange: ((state: spinner.SpinnerState) => void) | null = null
    ) => {
      dispatchAssetListEvent({
        type: AssetListEventType.newProject,
        parentKey: rootDirectoryId,
        parentId: rootDirectoryId,
        templateId: templateId,
        templateName: templateName,
        onSpinnerStateChange: onSpinnerStateChange,
      })
    },
    [rootDirectoryId, /* should never change */ dispatchAssetListEvent]
  )

  const doOpenEditor = React.useCallback(
    async (
      newProject: backendModule.ProjectAsset,
      setProjectAsset: React.Dispatch<React.SetStateAction<backendModule.ProjectAsset>>,
      switchPage: boolean
    ) => {
      if (switchPage) {
        setPage(pageSwitcher.Page.editor)
      }
      if (projectStartupInfo?.project.projectId !== newProject.id) {
        setProjectStartupInfo({
          project: await backend.getProjectDetails(newProject.id, newProject.title),
          projectAsset: newProject,
          setProjectAsset: setProjectAsset,
          backendType: backend.type,
          accessToken: session.accessToken,
        })
      }
    },
    [backend, projectStartupInfo?.project.projectId, session.accessToken, setPage]
  )

  const doCloseEditor = React.useCallback((closingProject: backendModule.ProjectAsset) => {
    setProjectStartupInfo(oldInfo =>
      oldInfo?.projectAsset.id === closingProject.id ? null : oldInfo
    )
  }, [])

  const doRemoveSelf = React.useCallback(() => {
    if (projectStartupInfo?.projectAsset != null) {
      const id = projectStartupInfo.projectAsset.id
      dispatchAssetListEvent({ type: AssetListEventType.removeSelf, id })
      setProjectStartupInfo(null)
    }
  }, [projectStartupInfo?.projectAsset, /* should never change */ dispatchAssetListEvent])

  const onSignOut = React.useCallback(() => {
    if (page === pageSwitcher.Page.editor) {
      setPage(pageSwitcher.Page.drive)
    }
    setProjectStartupInfo(null)
  }, [page, setPage])

  return (
    <>
      <div
        className={`flex text-xs text-primary ${
          page === pageSwitcher.Page.editor ? 'pointer-events-none cursor-none' : ''
        }`}
      >
        <div
          className={`relative flex h-screen grow select-none flex-col overflow-hidden container-size ${
            page === pageSwitcher.Page.home ? 'pb-home-page-b' : 'gap-top-level'
          }`}
          onContextMenu={event => {
            event.preventDefault()
            unsetModal()
          }}
        >
          <TopBar
            supportsLocalBackend={supportsLocalBackend}
            isCloud={isCloud}
            projectAsset={projectStartupInfo?.projectAsset ?? null}
            setProjectAsset={projectStartupInfo?.setProjectAsset ?? null}
            page={page}
            setPage={setPage}
            isEditorDisabled={projectStartupInfo == null}
            isHelpChatOpen={isHelpChatOpen}
            setIsHelpChatOpen={setIsHelpChatOpen}
            setBackendType={setBackendType}
            query={query}
            setQuery={setQuery}
            labels={labels}
            suggestions={suggestions}
            isAssetPanelVisible={isAssetPanelVisible}
            isAssetPanelEnabled={isAssetPanelEnabled}
            setIsAssetPanelEnabled={setIsAssetPanelEnabled}
            doRemoveSelf={doRemoveSelf}
            onSignOut={onSignOut}
          />
          <Home hidden={page !== pageSwitcher.Page.home} createProject={doCreateProject} />
          <Drive
            supportsLocalBackend={supportsLocalBackend}
            hidden={page !== pageSwitcher.Page.drive}
            hideRows={page !== pageSwitcher.Page.drive && page !== pageSwitcher.Page.home}
            initialProjectName={initialProjectName}
            query={query}
            setQuery={setQuery}
            labels={labels}
            setLabels={setLabels}
            setSuggestions={setSuggestions}
            projectStartupInfo={projectStartupInfo}
            queuedAssetEvents={queuedAssetEvents}
            assetListEvents={assetListEvents}
            dispatchAssetListEvent={dispatchAssetListEvent}
            assetEvents={assetEvents}
            dispatchAssetEvent={dispatchAssetEvent}
            setAssetPanelProps={setAssetPanelProps}
            setIsAssetPanelTemporarilyVisible={setIsAssetPanelTemporarilyVisible}
            doCreateProject={doCreateProject}
            doOpenEditor={doOpenEditor}
            doCloseEditor={doCloseEditor}
          />
          <Editor
            hidden={page !== pageSwitcher.Page.editor}
            supportsLocalBackend={supportsLocalBackend}
            projectStartupInfo={projectStartupInfo}
            appRunner={appRunner}
          />
          {page === pageSwitcher.Page.settings && <Settings />}
          {/* `session.accessToken` MUST be present in order for the `Chat` component to work. */}
          {session.accessToken != null && process.env.ENSO_CLOUD_CHAT_URL != null ? (
            <Chat
              isOpen={isHelpChatOpen}
              doClose={() => {
                setIsHelpChatOpen(false)
              }}
              endpoint={process.env.ENSO_CLOUD_CHAT_URL}
            />
          ) : (
            <ChatPlaceholder
              isOpen={isHelpChatOpen}
              doClose={() => {
                setIsHelpChatOpen(false)
              }}
            />
          )}
        </div>
        <div
          className={`flex flex-col overflow-hidden transition-min-width duration-side-panel ease-in-out ${
            isAssetPanelVisible ? 'min-w-side-panel' : 'invisible min-w'
          }`}
        >
          {isAssetPanelVisible && (
            <AssetPanel
              key={assetPanelProps?.item?.item.id}
              item={assetPanelProps?.item ?? null}
              setItem={assetPanelProps?.setItem ?? null}
              setQuery={setQuery}
              category={Category.home}
              labels={labels}
              dispatchAssetEvent={dispatchAssetEvent}
            />
          )}
        </div>
      </div>
      <div className="select-none text-xs text-primary">
        <TheModal />
      </div>
    </>
  )
}
