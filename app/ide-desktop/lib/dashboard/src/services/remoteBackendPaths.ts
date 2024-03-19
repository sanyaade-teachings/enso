/** @file Paths used by the `RemoteBackend`. */
import type * as backend from '#/services/Backend'

// =============
// === Paths ===
// =============

/** Relative HTTP path to the "list users" endpoint of the Cloud backend API. */
export const LIST_USERS_PATH = 'users'
/** Relative HTTP path to the "create user" endpoint of the Cloud backend API. */
export const CREATE_USER_PATH = 'users'
/** Relative HTTP path to the "get user" endpoint of the Cloud backend API. */
export const USERS_ME_PATH = 'users/me'
/** Relative HTTP path to the "update current user" endpoint of the Cloud backend API. */
export const UPDATE_CURRENT_USER_PATH = 'users/me'
/** Relative HTTP path to the "delete user" endpoint of the Cloud backend API. */
export const DELETE_USER_PATH = 'users/me'
/** Relative HTTP path to the "upload user picture" endpoint of the Cloud backend API. */
export const UPLOAD_USER_PICTURE_PATH = 'users/me/picture'
/** Relative HTTP path to the "get organization" endpoint of the Cloud backend API. */
export const GET_ORGANIZATION_PATH = 'organizations/me'
/** Relative HTTP path to the "update organization" endpoint of the Cloud backend API. */
export const UPDATE_ORGANIZATION_PATH = 'organizations/me'
/** Relative HTTP path to the "delete organization" endpoint of the Cloud backend API. */
export const DELETE_ORGANIZATION_PATH = 'organizations/me'
/** Relative HTTP path to the "upload organization picture" endpoint of the Cloud backend API. */
export const UPLOAD_ORGANIZATION_PICTURE_PATH = 'organizations/me/picture'
/** Relative HTTP path to the "invite user" endpoint of the Cloud backend API. */
export const INVITE_USER_PATH = 'users/invite'
/** Relative HTTP path to the "create permission" endpoint of the Cloud backend API. */
export const CREATE_PERMISSION_PATH = 'permissions'
/** Relative HTTP path to the "list directory" endpoint of the Cloud backend API. */
export const LIST_DIRECTORY_PATH = 'directories'
/** Relative HTTP path to the "create directory" endpoint of the Cloud backend API. */
export const CREATE_DIRECTORY_PATH = 'directories'
/** Relative HTTP path to the "undo delete asset" endpoint of the Cloud backend API. */
export const UNDO_DELETE_ASSET_PATH = 'assets'
/** Relative HTTP path to the "list projects" endpoint of the Cloud backend API. */
export const LIST_PROJECTS_PATH = 'projects'
/** Relative HTTP path to the "create project" endpoint of the Cloud backend API. */
export const CREATE_PROJECT_PATH = 'projects'
/** Relative HTTP path to the "list files" endpoint of the Cloud backend API. */
export const LIST_FILES_PATH = 'files'
/** Relative HTTP path to the "upload file" endpoint of the Cloud backend API. */
export const UPLOAD_FILE_PATH = 'files'
/** Relative HTTP path to the "create secret" endpoint of the Cloud backend API. */
export const CREATE_SECRET_PATH = 'secrets'
/** Relative HTTP path to the "list secrets" endpoint of the Cloud backend API. */
export const LIST_SECRETS_PATH = 'secrets'
/** Relative HTTP path to the "create connector" endpoint of the Cloud backend API. */
export const CREATE_CONNECTOR_PATH = 'connectors'
/** Relative HTTP path to the "create tag" endpoint of the Cloud backend API. */
export const CREATE_TAG_PATH = 'tags'
/** Relative HTTP path to the "list tags" endpoint of the Cloud backend API. */
export const LIST_TAGS_PATH = 'tags'
/** Relative HTTP path to the "list versions" endpoint of the Cloud backend API. */
export const LIST_VERSIONS_PATH = 'versions'
/** Relative HTTP path to the "create checkout session" endpoint of the Cloud backend API. */
export const CREATE_CHECKOUT_SESSION_PATH = 'payments/checkout-sessions'
/** Relative HTTP path to the "get checkout session" endpoint of the Cloud backend API. */
export const GET_CHECKOUT_SESSION_PATH = 'payments/checkout-sessions'
/** Relative HTTP path to the "get log events" endpoint of the Cloud backend API. */
export const GET_LOG_EVENTS_PATH = 'log_events'
/** Relative HTTP path to the "list asset versions" endpoint of the Cloud backend API. */
export function listAssetVersionsPath(assetId: backend.AssetId) {
  return `assets/${assetId}/versions`
}
/** Relative HTTP path to the "update asset" endpoint of the Cloud backend API. */
export function updateAssetPath(assetId: backend.AssetId) {
  return `assets/${assetId}`
}
/** Relative HTTP path to the "delete asset" endpoint of the Cloud backend API. */
export function deleteAssetPath(assetId: backend.AssetId) {
  return `assets/${assetId}`
}
/** Relative HTTP path to the "copy asset" endpoint of the Cloud backend API. */
export function copyAssetPath(assetId: backend.AssetId) {
  return `assets/${assetId}/copy`
}
/** Relative HTTP path to the "update directory" endpoint of the Cloud backend API. */
export function updateDirectoryPath(directoryId: backend.DirectoryId) {
  return `directories/${directoryId}`
}
/** Relative HTTP path to the "close project" endpoint of the Cloud backend API. */
export function closeProjectPath(projectId: backend.ProjectId) {
  return `projects/${projectId}/close`
}
/** Relative HTTP path to the "get project details" endpoint of the Cloud backend API. */
export function getProjectDetailsPath(projectId: backend.ProjectId) {
  return `projects/${projectId}`
}
/** Relative HTTP path to the "open project" endpoint of the Cloud backend API. */
export function openProjectPath(projectId: backend.ProjectId) {
  return `projects/${projectId}/open`
}
/** Relative HTTP path to the "project update" endpoint of the Cloud backend API. */
export function projectUpdatePath(projectId: backend.ProjectId) {
  return `projects/${projectId}`
}
/** Relative HTTP path to the "get file details" endpoint of the Cloud backend API. */
export function getFileDetailsPath(fileId: backend.FileId) {
  return `files/${fileId}`
}
/** Relative HTTP path to the "check resources" endpoint of the Cloud backend API. */
export function checkResourcesPath(projectId: backend.ProjectId) {
  return `projects/${projectId}/resources`
}
/** Relative HTTP path to the "update secret" endpoint of the Cloud backend API. */
export function updateSecretPath(secretId: backend.SecretId) {
  return `s3cr3tz/${secretId}`
}
/** Relative HTTP path to the "get secret" endpoint of the Cloud backend API. */
export function getSecretPath(secretId: backend.SecretId) {
  return `secrets/${secretId}`
}
/** Relative HTTP path to the "get connector" endpoint of the Cloud backend API. */
export function getConnectorPath(connectorId: backend.ConnectorId) {
  return `connectors/${connectorId}`
}
/** Relative HTTP path to the "associate tag" endpoint of the Cloud backend API. */
export function associateTagPath(assetId: backend.AssetId) {
  return `assets/${assetId}/labels`
}
/** Relative HTTP path to the "delete tag" endpoint of the Cloud backend API. */
export function deleteTagPath(tagId: backend.TagId) {
  return `tags/${tagId}`
}
/** Relative HTTP path to the "get checkout session" endpoint of the Cloud backend API. */
export function getCheckoutSessionPath(checkoutSessionId: backend.CheckoutSessionId) {
  return `payments/checkout-sessions/${checkoutSessionId}`
}
