/** @file Module containing the API client for the Cloud backend API.
 *
 * Each exported function in the {@link RemoteBackend} in this module corresponds to
 * an API endpoint. The functions are asynchronous and return a {@link Promise} that resolves to
 * the response from the API. */
import * as detect from 'enso-common/src/detect'

import type * as loggerProvider from '#/providers/LoggerProvider'

import Backend, * as backendModule from '#/services/Backend'
import * as remoteBackendPaths from '#/services/remoteBackendPaths'

import type HttpClient from '#/utilities/HttpClient'
import * as object from '#/utilities/object'

// =================
// === Constants ===
// =================

/** HTTP status indicating that the request was successful. */
const STATUS_SUCCESS_FIRST = 200
/** HTTP status indicating that the request was successful. */
const STATUS_SUCCESS_LAST = 299
/** HTTP status indicating that the resource does not exist. */
const STATUS_NOT_FOUND = 404
/** HTTP status indicating that the server encountered a fatal exception. */
const STATUS_SERVER_ERROR = 500

/** The number of milliseconds in one day. */
const ONE_DAY_MS = 86_400_000

/** Default HTTP body for an "open project" request. */
const DEFAULT_OPEN_PROJECT_BODY: backendModule.OpenProjectRequestBody = { executeAsync: false }

// =============
// === Types ===
// =============

/** The format of all errors returned by the backend. */
interface RemoteBackendError {
  readonly type: string
  readonly code: string
  readonly message: string
  readonly param: string
}

// ============================
// === responseIsSuccessful ===
// ============================

/** Whether a response has a success HTTP status code (200-299). */
function responseIsSuccessful(response: Response) {
  return response.status >= STATUS_SUCCESS_FIRST && response.status <= STATUS_SUCCESS_LAST
}

// ===============================
// === waitUntilProjectIsReady ===
// ===============================

/** The interval between requests checking whether the IDE is ready. */
const CHECK_STATUS_INTERVAL_MS = 5000

/** Return a {@link Promise} that resolves only when a project is ready to open. */
export async function waitUntilProjectIsReady(
  backend: Backend,
  item: backendModule.ProjectAsset,
  abortController: AbortController = new AbortController()
) {
  let project = await backend.getProjectDetails(item.id, item.title)
  if (!backendModule.IS_OPENING_OR_OPENED[project.state.type]) {
    await backend.openProject(item.id, null, item.title)
  }
  let nextCheckTimestamp = 0
  while (
    !abortController.signal.aborted &&
    project.state.type !== backendModule.ProjectState.opened
  ) {
    await new Promise<void>(resolve => {
      const delayMs = nextCheckTimestamp - Number(new Date())
      setTimeout(resolve, Math.max(0, delayMs))
    })
    nextCheckTimestamp = Number(new Date()) + CHECK_STATUS_INTERVAL_MS
    project = await backend.getProjectDetails(item.id, item.title)
  }
}

// =============
// === Types ===
// =============

/** HTTP response body for the "list users" endpoint. */
export interface ListUsersResponseBody {
  readonly users: backendModule.SimpleUser[]
}

/** HTTP response body for the "list projects" endpoint. */
export interface ListDirectoryResponseBody {
  readonly assets: backendModule.AnyAsset[]
}

/** HTTP response body for the "list projects" endpoint. */
export interface ListProjectsResponseBody {
  readonly projects: backendModule.ListedProjectRaw[]
}

/** HTTP response body for the "list files" endpoint. */
export interface ListFilesResponseBody {
  readonly files: backendModule.FileLocator[]
}

/** HTTP response body for the "list secrets" endpoint. */
export interface ListSecretsResponseBody {
  readonly secrets: backendModule.SecretInfo[]
}

/** HTTP response body for the "list tag" endpoint. */
export interface ListTagsResponseBody {
  readonly tags: backendModule.Label[]
}

/** HTTP response body for the "list versions" endpoint. */
export interface ListVersionsResponseBody {
  readonly versions: [backendModule.Version, ...backendModule.Version[]]
}

// =====================
// === RemoteBackend ===
// =====================

/** Information for a cached default version. */
interface DefaultVersionInfo {
  readonly version: backendModule.VersionNumber
  readonly lastUpdatedEpochMs: number
}

/** Class for sending requests to the Cloud backend API endpoints. */
export default class RemoteBackend extends Backend {
  readonly type = backendModule.BackendType.remote
  protected defaultVersions: Partial<Record<backendModule.VersionType, DefaultVersionInfo>> = {}

  /** Create a new instance of the {@link RemoteBackend} API client.
   * @throws An error if the `Authorization` header is not set on the given `client`. */
  constructor(
    private readonly client: HttpClient,
    private readonly logger: loggerProvider.Logger
  ) {
    super()
    // All of our API endpoints are authenticated, so we expect the `Authorization` header to be
    // set.
    if (!new Headers(this.client.defaultHeaders).has('Authorization')) {
      const message = 'Authorization header not set'
      this.logger.error(message)
      throw new Error(message)
    } else {
      if (detect.IS_DEV_MODE) {
        // @ts-expect-error This exists only for debugging purposes. It does not have types
        // because it MUST NOT be used in this codebase.
        window.remoteBackend = this
      }
      return
    }
  }

  /** Log an error message and throws an {@link Error} with the specified message.
   * @throws {Error} Always. */
  async throw(prefix: string, response: Response | null): Promise<never> {
    const error =
      response == null
        ? { message: 'unknown error' }
        : // This is SAFE only when the response has been confirmed to have an erroring status code.
          // eslint-disable-next-line no-restricted-syntax
          ((await response.json()) as RemoteBackendError)
    const message = `${prefix}: ${error.message}.`
    this.logger.error(message)
    throw new Error(message)
  }

  /** Return a list of all users in the same organization. */
  override async listUsers(): Promise<backendModule.SimpleUser[]> {
    const path = remoteBackendPaths.LIST_USERS_PATH
    const response = await this.get<ListUsersResponseBody>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not list users in the organization`, response)
    } else {
      return (await response.json()).users
    }
  }

  /** Set the username and parent organization of the current user. */
  override async createUser(
    body: backendModule.CreateUserRequestBody
  ): Promise<backendModule.User> {
    const path = remoteBackendPaths.CREATE_USER_PATH
    const response = await this.post<backendModule.User>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not create user', response)
    } else {
      return await response.json()
    }
  }

  /** Change the username of the current user. */
  override async updateUser(body: backendModule.UpdateUserRequestBody): Promise<void> {
    const path = remoteBackendPaths.UPDATE_CURRENT_USER_PATH
    const response = await this.put(path, body)
    if (!responseIsSuccessful(response)) {
      if (body.username != null) {
        return this.throw('Could not change username', response)
      } else {
        return this.throw('Could not update user', response)
      }
    } else {
      return
    }
  }

  /** Delete the current user. */
  override async deleteUser(): Promise<void> {
    const response = await this.delete(remoteBackendPaths.DELETE_USER_PATH)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not delete user', response)
    } else {
      return
    }
  }

  /** Invite a new user to the organization by email. */
  override async inviteUser(body: backendModule.InviteUserRequestBody): Promise<void> {
    const path = remoteBackendPaths.INVITE_USER_PATH
    const response = await this.post(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not invite user '${body.userEmail}'`, response)
    } else {
      return
    }
  }

  /** Upload a new profile picture for the current user. */
  override async uploadUserPicture(
    params: backendModule.UploadPictureRequestParams,
    file: Blob
  ): Promise<backendModule.User> {
    const paramsString = new URLSearchParams({
      /* eslint-disable @typescript-eslint/naming-convention */
      ...(params.fileName != null ? { file_name: params.fileName } : {}),
      /* eslint-enable @typescript-eslint/naming-convention */
    }).toString()
    const path = `${remoteBackendPaths.UPLOAD_USER_PICTURE_PATH}?${paramsString}`
    const response = await this.putBinary<backendModule.User>(path, file)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not upload user profile picture', response)
    } else {
      return await response.json()
    }
  }

  /** Return details for the current organization.
   * @returns `null` if a non-successful status code (not 200-299) was received. */
  override async getOrganization(): Promise<backendModule.OrganizationInfo | null> {
    const path = remoteBackendPaths.GET_ORGANIZATION_PATH
    const response = await this.get<backendModule.OrganizationInfo>(path)
    if (response.status === STATUS_NOT_FOUND) {
      // Organization info has not yet been created.
      return null
    } else if (!responseIsSuccessful(response)) {
      return this.throw('Could not get organization', response)
    } else {
      return await response.json()
    }
  }

  /** Update details for the current organization. */
  override async updateOrganization(
    body: backendModule.UpdateOrganizationRequestBody
  ): Promise<backendModule.OrganizationInfo | null> {
    const path = remoteBackendPaths.UPDATE_ORGANIZATION_PATH
    const response = await this.patch<backendModule.OrganizationInfo>(path, body)

    if (response.status === STATUS_NOT_FOUND) {
      // Organization info has not yet been created.
      return null
    } else if (!responseIsSuccessful(response)) {
      return this.throw('Could not update organization', response)
    } else {
      return await response.json()
    }
  }

  /** Upload a new profile picture for the current organization. */
  override async uploadOrganizationPicture(
    params: backendModule.UploadPictureRequestParams,
    file: Blob
  ): Promise<backendModule.OrganizationInfo> {
    const paramsString = new URLSearchParams({
      /* eslint-disable @typescript-eslint/naming-convention */
      ...(params.fileName != null ? { file_name: params.fileName } : {}),
      /* eslint-enable @typescript-eslint/naming-convention */
    }).toString()
    const path = `${remoteBackendPaths.UPLOAD_ORGANIZATION_PICTURE_PATH}?${paramsString}`
    const response = await this.putBinary<backendModule.OrganizationInfo>(path, file)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not upload user profile picture', response)
    } else {
      return await response.json()
    }
  }

  /** Adds a permission for a specific user on a specific asset. */
  override async createPermission(body: backendModule.CreatePermissionRequestBody): Promise<void> {
    const path = remoteBackendPaths.CREATE_PERMISSION_PATH
    const response = await this.post<backendModule.User>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not set permissions', response)
    } else {
      return
    }
  }

  /** Return details for the current user.
   * @returns `null` if a non-successful status code (not 200-299) was received. */
  override async usersMe(): Promise<backendModule.User | null> {
    const path = remoteBackendPaths.USERS_ME_PATH
    const response = await this.get<backendModule.User>(path)
    if (!responseIsSuccessful(response)) {
      return null
    } else {
      return await response.json()
    }
  }

  /** Return a list of assets in a directory.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async listDirectory(
    query: backendModule.ListDirectoryRequestParams,
    title: string | null
  ): Promise<backendModule.AnyAsset[]> {
    const path = remoteBackendPaths.LIST_DIRECTORY_PATH
    const response = await this.get<ListDirectoryResponseBody>(
      path +
        '?' +
        new URLSearchParams(
          query.recentProjects
            ? [['recent_projects', String(true)]]
            : [
                ...(query.parentId != null ? [['parent_id', query.parentId]] : []),
                ...(query.filterBy != null ? [['filter_by', query.filterBy]] : []),
                ...(query.labels != null ? query.labels.map(label => ['label', label]) : []),
              ]
        ).toString()
    )
    if (!responseIsSuccessful(response)) {
      if (response.status === STATUS_SERVER_ERROR) {
        // The directory is probably empty.
        return []
      } else if (query.parentId != null) {
        const name = title != null ? `'${title}'` : `with ID '${query.parentId}'`
        return this.throw(`Could not list folder ${name}`, response)
      } else {
        return this.throw('Could not list root folder', response)
      }
    } else {
      return (await response.json()).assets
        .map(asset =>
          object.merge(asset, {
            // eslint-disable-next-line no-restricted-syntax
            type: asset.id.match(/^(.+?)-/)?.[1] as backendModule.AssetType,
          })
        )
        .map(asset =>
          object.merge(asset, {
            permissions: [...(asset.permissions ?? [])].sort(backendModule.compareUserPermissions),
          })
        )
    }
  }

  /** Create a directory.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async createDirectory(
    body: backendModule.CreateDirectoryRequestBody
  ): Promise<backendModule.CreatedDirectory> {
    const path = remoteBackendPaths.CREATE_DIRECTORY_PATH
    const response = await this.post<backendModule.CreatedDirectory>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not create folder with name '${body.title}'`, response)
    } else {
      return await response.json()
    }
  }

  /** Change the name of a directory.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async updateDirectory(
    directoryId: backendModule.DirectoryId,
    body: backendModule.UpdateDirectoryRequestBody,
    title: string | null
  ) {
    const path = remoteBackendPaths.updateDirectoryPath(directoryId)
    const response = await this.put<backendModule.UpdatedDirectory>(path, body)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `with ID '${directoryId}'`
      return this.throw(`Could not update folder ${name}`, response)
    } else {
      return await response.json()
    }
  }

  /** List all previous versions of an asset. */
  override async listAssetVersions(
    assetId: backendModule.AssetId,
    title: string | null
  ): Promise<backendModule.AssetVersions> {
    const path = remoteBackendPaths.listAssetVersionsPath(assetId)
    const response = await this.get<backendModule.AssetVersions>(path)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `with ID '${assetId}'`
      return this.throw(`Could not list versions for ${name}`, response)
    } else {
      return await response.json()
    }
  }

  /**
   * Fetches the content of Main.enso file for a given project.
   */
  async getFileContent(projectId: backendModule.ProjectId, version: string): Promise<string> {
    const path = remoteBackendPaths.getProjectContentPath(projectId, version)
    const response = await this.get<string>(path)

    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not get content of file with ProjectID '${projectId}'`, response)
    } else {
      return await response.text()
    }
  }

  /** Change the parent directory of an asset.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async updateAsset(
    assetId: backendModule.AssetId,
    body: backendModule.UpdateAssetRequestBody,
    title: string | null
  ) {
    const path = remoteBackendPaths.updateAssetPath(assetId)
    const response = await this.patch(path, body)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `asset with ID '${assetId}'`
      return this.throw(`Could not update ${name}.`, response)
    } else {
      return
    }
  }

  /** Delete an arbitrary asset.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async deleteAsset(assetId: backendModule.AssetId, force: boolean, title: string | null) {
    const paramsString = new URLSearchParams([['force', String(force)]]).toString()
    const path = remoteBackendPaths.deleteAssetPath(assetId) + '?' + paramsString
    const response = await this.delete(path)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `asset with ID '${assetId}'`
      return this.throw(`Unable to delete ${name}.`, response)
    } else {
      return
    }
  }

  /** Restore an arbitrary asset from the trash.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async undoDeleteAsset(
    assetId: backendModule.AssetId,
    title: string | null
  ): Promise<void> {
    const path = remoteBackendPaths.UNDO_DELETE_ASSET_PATH
    const response = await this.patch(path, { assetId })
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Unable to restore ${
          title != null ? `'${title}'` : `asset with ID '${assetId}'`
        } from Trash`,
        response
      )
    } else {
      return
    }
  }

  /** Copy an arbitrary asset to another directory.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async copyAsset(
    assetId: backendModule.AssetId,
    parentDirectoryId: backendModule.DirectoryId,
    title: string | null,
    parentDirectoryTitle: string | null
  ): Promise<backendModule.CopyAssetResponse> {
    const response = await this.post<backendModule.CopyAssetResponse>(
      remoteBackendPaths.copyAssetPath(assetId),
      { parentDirectoryId }
    )
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Unable to copy ${title != null ? `'${title}'` : `asset with ID '${assetId}'`} to ${
          parentDirectoryTitle != null
            ? `'${parentDirectoryTitle}'`
            : `directory with ID '${parentDirectoryId}'`
        }`,
        response
      )
    } else {
      return await response.json()
    }
  }

  /** Return a list of projects belonging to the current user.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async listProjects(): Promise<backendModule.ListedProject[]> {
    const path = remoteBackendPaths.LIST_PROJECTS_PATH
    const response = await this.get<ListProjectsResponseBody>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not list projects', response)
    } else {
      return (await response.json()).projects.map(project => ({
        ...project,
        jsonAddress:
          project.address != null ? backendModule.Address(`${project.address}json`) : null,
        binaryAddress:
          project.address != null ? backendModule.Address(`${project.address}binary`) : null,
      }))
    }
  }

  /** Create a project.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async createProject(
    body: backendModule.CreateProjectRequestBody
  ): Promise<backendModule.CreatedProject> {
    const path = remoteBackendPaths.CREATE_PROJECT_PATH
    const response = await this.post<backendModule.CreatedProject>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not create project with name '${body.projectName}'`, response)
    } else {
      return await response.json()
    }
  }

  /** Close a project.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async closeProject(
    projectId: backendModule.ProjectId,
    title: string | null
  ): Promise<void> {
    const path = remoteBackendPaths.closeProjectPath(projectId)
    const response = await this.post(path, {})
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Could not close project ${title != null ? `'${title}'` : `with ID '${projectId}'`}`,
        response
      )
    } else {
      return
    }
  }

  /** Return details for a project.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async getProjectDetails(
    projectId: backendModule.ProjectId,
    title: string | null
  ): Promise<backendModule.Project> {
    const path = remoteBackendPaths.getProjectDetailsPath(projectId)
    const response = await this.get<backendModule.ProjectRaw>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Could not get details of project ${
          title != null ? `'${title}'` : `with ID '${projectId}'`
        }`,
        response
      )
    } else {
      const project = await response.json()
      const ideVersion =
        project.ide_version ?? (await this.getDefaultVersion(backendModule.VersionType.ide))
      return {
        ...project,
        ideVersion,
        engineVersion: project.engine_version,
        jsonAddress:
          project.address != null ? backendModule.Address(`${project.address}json`) : null,
        binaryAddress:
          project.address != null ? backendModule.Address(`${project.address}binary`) : null,
      }
    }
  }

  /** Prepare a project for execution.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async openProject(
    projectId: backendModule.ProjectId,
    body: backendModule.OpenProjectRequestBody | null,
    title: string | null
  ): Promise<void> {
    const path = remoteBackendPaths.openProjectPath(projectId)
    const response = await this.post(path, body ?? DEFAULT_OPEN_PROJECT_BODY)
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Could not open project ${title != null ? `'${title}'` : `with ID '${projectId}'`}`,
        response
      )
    } else {
      return
    }
  }

  /** Update the name or AMI of a project.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async updateProject(
    projectId: backendModule.ProjectId,
    body: backendModule.UpdateProjectRequestBody,
    title: string | null
  ): Promise<backendModule.UpdatedProject> {
    const path = remoteBackendPaths.projectUpdatePath(projectId)
    const response = await this.put<backendModule.UpdatedProject>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Could not update project ${title != null ? `'${title}'` : `with ID '${projectId}'`}`,
        response
      )
    } else {
      return await response.json()
    }
  }

  /** Return the resource usage of a project.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async checkResources(
    projectId: backendModule.ProjectId,
    title: string | null
  ): Promise<backendModule.ResourceUsage> {
    const path = remoteBackendPaths.checkResourcesPath(projectId)
    const response = await this.get<backendModule.ResourceUsage>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Could not get resource usage for project ${
          title != null ? `'${title}'` : `with ID '${projectId}'`
        }`,
        response
      )
    } else {
      return await response.json()
    }
  }

  /** Return a list of files accessible by the current user.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async listFiles(): Promise<backendModule.FileLocator[]> {
    const path = remoteBackendPaths.LIST_FILES_PATH
    const response = await this.get<ListFilesResponseBody>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not list files', response)
    } else {
      return (await response.json()).files
    }
  }

  /** Upload a file.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async uploadFile(
    params: backendModule.UploadFileRequestParams,
    file: Blob
  ): Promise<backendModule.FileInfo> {
    const paramsString = new URLSearchParams({
      /* eslint-disable @typescript-eslint/naming-convention */
      file_name: params.fileName,
      ...(params.fileId != null ? { file_id: params.fileId } : {}),
      ...(params.parentDirectoryId ? { parent_directory_id: params.parentDirectoryId } : {}),
      /* eslint-enable @typescript-eslint/naming-convention */
    }).toString()
    const path = `${remoteBackendPaths.UPLOAD_FILE_PATH}?${paramsString}`
    const response = await this.postBinary<backendModule.FileInfo>(path, file)
    if (!responseIsSuccessful(response)) {
      if (params.fileId != null) {
        return this.throw(`Could not upload file with ID '${params.fileId}'`, response)
      } else {
        return this.throw('Could not upload file', response)
      }
    } else {
      return await response.json()
    }
  }

  /** Return details for a project.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async getFileDetails(
    fileId: backendModule.FileId,
    title: string | null
  ): Promise<backendModule.FileDetails> {
    const path = remoteBackendPaths.getFileDetailsPath(fileId)
    const response = await this.get<backendModule.FileDetails>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(
        `Could not get details of project ${title != null ? `'${title}'` : `with ID '${fileId}'`}`,
        response
      )
    } else {
      return await response.json()
    }
  }

  /** Return a Data Link.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async createConnector(
    body: backendModule.CreateConnectorRequestBody
  ): Promise<backendModule.ConnectorInfo> {
    const path = remoteBackendPaths.CREATE_CONNECTOR_PATH
    const response = await this.post<backendModule.ConnectorInfo>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not create Data Link with name '${body.name}'`, response)
    } else {
      return await response.json()
    }
  }

  /** Return a Data Link.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async getConnector(
    connectorId: backendModule.ConnectorId,
    title: string | null
  ): Promise<backendModule.Connector> {
    const path = remoteBackendPaths.getConnectorPath(connectorId)
    const response = await this.get<backendModule.Connector>(path)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `with ID '${connectorId}'`
      return this.throw(`Could not get Data Link ${name}`, response)
    } else {
      return await response.json()
    }
  }

  /** Delete a Data Link.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async deleteConnector(
    connectorId: backendModule.ConnectorId,
    title: string | null
  ): Promise<void> {
    const path = remoteBackendPaths.getConnectorPath(connectorId)
    const response = await this.delete(path)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `with ID '${connectorId}'`
      return this.throw(`Could not delete Data Link ${name}`, response)
    } else {
      return
    }
  }

  /** Create a secret environment variable.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async createSecret(
    body: backendModule.CreateSecretRequestBody
  ): Promise<backendModule.SecretId> {
    const path = remoteBackendPaths.CREATE_SECRET_PATH
    const response = await this.post<backendModule.SecretId>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not create secret with name '${body.name}'`, response)
    } else {
      return await response.json()
    }
  }

  /** Return a secret environment variable.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async getSecret(
    secretId: backendModule.SecretId,
    title: string | null
  ): Promise<backendModule.Secret> {
    const path = remoteBackendPaths.getSecretPath(secretId)
    const response = await this.get<backendModule.Secret>(path)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `with ID '${secretId}'`
      return this.throw(`Could not get secret ${name}`, response)
    } else {
      return await response.json()
    }
  }

  /** Update a secret environment variable.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async updateSecret(
    secretId: backendModule.SecretId,
    body: backendModule.UpdateSecretRequestBody,
    title: string | null
  ): Promise<void> {
    const path = remoteBackendPaths.updateSecretPath(secretId)
    const response = await this.put(path, body)
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `with ID '${secretId}'`
      return this.throw(`Could not update secret ${name}`, response)
    } else {
      return
    }
  }

  /** Return the secret environment variables accessible by the user.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async listSecrets(): Promise<backendModule.SecretInfo[]> {
    const path = remoteBackendPaths.LIST_SECRETS_PATH
    const response = await this.get<ListSecretsResponseBody>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw('Could not list secrets', response)
    } else {
      return (await response.json()).secrets
    }
  }

  /** Create a label used for categorizing assets.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async createTag(body: backendModule.CreateTagRequestBody): Promise<backendModule.Label> {
    const path = remoteBackendPaths.CREATE_TAG_PATH
    const response = await this.post<backendModule.Label>(path, body)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not create label '${body.value}'`, response)
    } else {
      return await response.json()
    }
  }

  /** Return all labels accessible by the user.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async listTags(): Promise<backendModule.Label[]> {
    const path = remoteBackendPaths.LIST_TAGS_PATH
    const response = await this.get<ListTagsResponseBody>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not list labels`, response)
    } else {
      return (await response.json()).tags
    }
  }

  /** Set the full list of labels for a specific asset.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async associateTag(
    assetId: backendModule.AssetId,
    labels: backendModule.LabelName[],
    title: string | null
  ) {
    const path = remoteBackendPaths.associateTagPath(assetId)
    const response = await this.patch<ListTagsResponseBody>(path, { labels })
    if (!responseIsSuccessful(response)) {
      const name = title != null ? `'${title}'` : `with ID '${assetId}'`
      return this.throw(`Could not set labels for asset ${name}`, response)
    } else {
      return
    }
  }

  /** Delete a label.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async deleteTag(
    tagId: backendModule.TagId,
    value: backendModule.LabelName
  ): Promise<void> {
    const path = remoteBackendPaths.deleteTagPath(tagId)
    const response = await this.delete(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not delete label '${value}'`, response)
    } else {
      return
    }
  }

  /** Return a list of backend or IDE versions.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async listVersions(
    params: backendModule.ListVersionsRequestParams
  ): Promise<backendModule.Version[]> {
    const paramsString = new URLSearchParams({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      version_type: params.versionType,
      default: String(params.default),
    }).toString()
    const path = remoteBackendPaths.LIST_VERSIONS_PATH + '?' + paramsString
    const response = await this.get<ListVersionsResponseBody>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not list versions of type '${params.versionType}'`, response)
    } else {
      return (await response.json()).versions
    }
  }

  /** Create a payment checkout session.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async createCheckoutSession(
    plan: backendModule.Plan
  ): Promise<backendModule.CheckoutSession> {
    const response = await this.post<backendModule.CheckoutSession>(
      remoteBackendPaths.CREATE_CHECKOUT_SESSION_PATH,
      { plan } satisfies backendModule.CreateCheckoutSessionRequestBody
    )
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not create checkout session for plan '${plan}'.`, response)
    } else {
      return await response.json()
    }
  }

  /** Gets the status of a payment checkout session.
   * @throws An error if a non-successful status code (not 200-299) was received. */
  override async getCheckoutSession(
    sessionId: backendModule.CheckoutSessionId
  ): Promise<backendModule.CheckoutSessionStatus> {
    const path = remoteBackendPaths.getCheckoutSessionPath(sessionId)
    const response = await this.get<backendModule.CheckoutSessionStatus>(path)
    if (!responseIsSuccessful(response)) {
      return this.throw(`Could not get checkout session for session ID '${sessionId}'.`, response)
    } else {
      return await response.json()
    }
  }

  /** Get the default version given the type of version (IDE or backend). */
  protected async getDefaultVersion(versionType: backendModule.VersionType) {
    const cached = this.defaultVersions[versionType]
    const nowEpochMs = Number(new Date())
    if (cached != null && nowEpochMs - cached.lastUpdatedEpochMs < ONE_DAY_MS) {
      return cached.version
    } else {
      const version = (await this.listVersions({ versionType, default: true }))[0]?.number
      if (version == null) {
        return this.throw(`No default ${versionType} version found`, null)
      } else {
        const info: DefaultVersionInfo = { version, lastUpdatedEpochMs: nowEpochMs }
        this.defaultVersions[versionType] = info
        return info.version
      }
    }
  }

  /** Send an HTTP GET request to the given path. */
  private get<T = void>(path: string) {
    return this.client.get<T>(`${process.env.ENSO_CLOUD_API_URL}/${path}`)
  }

  /** Send a JSON HTTP POST request to the given path. */
  private post<T = void>(path: string, payload: object) {
    return this.client.post<T>(`${process.env.ENSO_CLOUD_API_URL}/${path}`, payload)
  }

  /** Send a binary HTTP POST request to the given path. */
  private postBinary<T = void>(path: string, payload: Blob) {
    return this.client.postBinary<T>(`${process.env.ENSO_CLOUD_API_URL}/${path}`, payload)
  }

  /** Send a JSON HTTP PATCH request to the given path. */
  private patch<T = void>(path: string, payload: object) {
    return this.client.patch<T>(`${process.env.ENSO_CLOUD_API_URL}/${path}`, payload)
  }

  /** Send a JSON HTTP PUT request to the given path. */
  private put<T = void>(path: string, payload: object) {
    return this.client.put<T>(`${process.env.ENSO_CLOUD_API_URL}/${path}`, payload)
  }

  /** Send a binary HTTP PUT request to the given path. */
  private putBinary<T = void>(path: string, payload: Blob) {
    return this.client.putBinary<T>(`${process.env.ENSO_CLOUD_API_URL}/${path}`, payload)
  }

  /** Send an HTTP DELETE request to the given path. */
  private delete<T = void>(path: string) {
    return this.client.delete<T>(`${process.env.ENSO_CLOUD_API_URL}/${path}`)
  }
}
