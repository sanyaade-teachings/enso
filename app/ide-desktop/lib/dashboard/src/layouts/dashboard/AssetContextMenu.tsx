/** @file The context menu for an arbitrary {@link backendModule.Asset}. */
import * as React from 'react'

import * as toast from 'react-toastify'

import AssetEventType from '#/events/AssetEventType'
import AssetListEventType from '#/events/AssetListEventType'
import * as toastAndLogHooks from '#/hooks/toastAndLogHooks'
import Category from '#/layouts/dashboard/CategorySwitcher/Category'
import GlobalContextMenu from '#/layouts/dashboard/GlobalContextMenu'
import ManageLabelsModal from '#/layouts/dashboard/ManageLabelsModal'
import ManagePermissionsModal from '#/layouts/dashboard/ManagePermissionsModal'
import UpsertSecretModal from '#/layouts/dashboard/UpsertSecretModal'
import * as authProvider from '#/providers/AuthProvider'
import * as loggerProvider from '#/providers/LoggerProvider'
import * as modalProvider from '#/providers/ModalProvider'
import * as backendModule from '#/services/backend'
import * as remoteBackendModule from '#/services/remoteBackend'
import * as assetTreeNode from '#/utilities/assetTreeNode'
import * as http from '#/utilities/http'
import * as object from '#/utilities/object'
import * as permissions from '#/utilities/permissions'
import * as shortcuts from '#/utilities/shortcuts'

import ContextMenu from '#/components/ContextMenu'
import ContextMenus from '#/components/ContextMenus'
import ContextMenuSeparator from '#/components/ContextMenuSeparator'
import type * as assetRow from '#/components/dashboard/AssetRow'
import ConfirmDeleteModal from '#/components/dashboard/ConfirmDeleteModal'
import MenuEntry from '#/components/MenuEntry'

// ========================
// === AssetContextMenu ===
// ========================

/** Props for a {@link AssetContextMenu}. */
export interface AssetContextMenuProps {
  hidden?: boolean
  backend: backendModule.Backend
  innerProps: assetRow.AssetRowInnerProps
  event: Pick<React.MouseEvent, 'pageX' | 'pageY'>
  eventTarget: HTMLElement | null
  doDelete: () => void
  doCopy: () => void
  doCut: () => void
  doPaste: (newParentKey: backendModule.AssetId) => void
}

/** The context menu for an arbitrary {@link backendModule.Asset}. */
export default function AssetContextMenu(props: AssetContextMenuProps) {
  const { hidden = false, backend, innerProps, event, eventTarget } = props
  const { doCopy, doCut, doPaste, doDelete } = props
  const { item, setItem, state, setRowState } = innerProps
  const { category, hasPasteData, labels, dispatchAssetEvent, dispatchAssetListEvent } = state
  const { doCreateLabel } = state

  const logger = loggerProvider.useLogger()
  const { organization, accessToken } = authProvider.useNonPartialUserSession()
  const { setModal, unsetModal } = modalProvider.useSetModal()
  const toastAndLog = toastAndLogHooks.useToastAndLog()
  const smartAsset = item.item
  const asset = smartAsset.value
  const self = asset.permissions?.find(
    permission => permission.user.user_email === organization?.value.email
  )
  const isCloud = backend.type === backendModule.BackendType.remote
  const ownsThisAsset = !isCloud || self?.permission === permissions.PermissionAction.own
  const managesThisAsset = ownsThisAsset || self?.permission === permissions.PermissionAction.admin
  const canEditThisAsset =
    managesThisAsset || self?.permission === permissions.PermissionAction.edit
  const isRunningProject =
    asset.type === backendModule.AssetType.project &&
    backendModule.DOES_PROJECT_STATE_INDICATE_VM_EXISTS[asset.projectState.type]
  const canExecute =
    backend.type === backendModule.BackendType.local ||
    (self?.permission != null && permissions.PERMISSION_ACTION_CAN_EXECUTE[self.permission])
  const isOtherUserUsingProject =
    backend.type !== backendModule.BackendType.local &&
    backendModule.assetIsProject(asset) &&
    asset.projectState.opened_by != null &&
    asset.projectState.opened_by !== organization?.value.email
  const setAsset = assetTreeNode.useSetAsset(asset, setItem)

  return category === Category.trash ? (
    !ownsThisAsset ? null : (
      <ContextMenus hidden={hidden} key={asset.id} event={event}>
        <ContextMenu hidden={hidden}>
          <MenuEntry
            hidden={hidden}
            action={shortcuts.KeyboardAction.restoreFromTrash}
            doAction={() => {
              unsetModal()
              dispatchAssetEvent({
                type: AssetEventType.restore,
                ids: new Set([asset.id]),
              })
            }}
          />
        </ContextMenu>
      </ContextMenus>
    )
  ) : (
    <ContextMenus hidden={hidden} key={asset.id} event={event}>
      <ContextMenu hidden={hidden}>
        {asset.type === backendModule.AssetType.project &&
          canExecute &&
          !isRunningProject &&
          !isOtherUserUsingProject && (
            <MenuEntry
              hidden={hidden}
              action={shortcuts.KeyboardAction.open}
              doAction={() => {
                unsetModal()
                dispatchAssetEvent({
                  type: AssetEventType.openProject,
                  id: asset.id,
                  shouldAutomaticallySwitchPage: true,
                  runInBackground: false,
                })
              }}
            />
          )}
        {asset.type === backendModule.AssetType.project && isCloud && (
          <MenuEntry
            hidden={hidden}
            action={shortcuts.KeyboardAction.run}
            doAction={() => {
              unsetModal()
              dispatchAssetEvent({
                type: AssetEventType.openProject,
                id: asset.id,
                shouldAutomaticallySwitchPage: false,
                runInBackground: true,
              })
            }}
          />
        )}
        {asset.type === backendModule.AssetType.project &&
          canExecute &&
          isRunningProject &&
          !isOtherUserUsingProject && (
            <MenuEntry
              hidden={hidden}
              action={shortcuts.KeyboardAction.close}
              doAction={() => {
                unsetModal()
                dispatchAssetEvent({
                  type: AssetEventType.closeProject,
                  id: asset.id,
                })
              }}
            />
          )}
        {asset.type === backendModule.AssetType.project && !isCloud && (
          <MenuEntry
            hidden={hidden}
            action={shortcuts.KeyboardAction.uploadToCloud}
            doAction={async () => {
              unsetModal()
              if (accessToken == null) {
                toastAndLog('Cannot upload to cloud in offline mode')
              } else {
                try {
                  const client = new http.Client([['Authorization', `Bearer ${accessToken}`]])
                  const remoteBackend = new remoteBackendModule.RemoteBackend(client, logger)
                  const projectResponse = await fetch(
                    `./api/project-manager/projects/${asset.id}/enso-project`
                  )
                  // This DOES NOT update the cloud assets list when it
                  // completes, as the current backend is not the remote
                  // (cloud) backend. The user may change to the cloud backend
                  // while this request is in progress, however this is
                  // uncommon enough that it is not worth the added complexity.
                  await remoteBackend.uploadFile(
                    {
                      fileName: `${asset.title}.enso-project`,
                      fileId: null,
                      parentDirectoryId: null,
                    },
                    await projectResponse.blob()
                  )
                  toast.toast.success('Successfully uploaded local project to cloud!')
                } catch (error) {
                  toastAndLog('Could not upload local project to cloud', error)
                }
              }
            }}
          />
        )}
        {canExecute && !isRunningProject && !isOtherUserUsingProject && (
          <MenuEntry
            hidden={hidden}
            disabled={
              asset.type !== backendModule.AssetType.project &&
              asset.type !== backendModule.AssetType.directory
            }
            action={shortcuts.KeyboardAction.rename}
            doAction={() => {
              setRowState(object.merger({ isEditingName: true }))
              unsetModal()
            }}
          />
        )}
        {smartAsset.type === backendModule.AssetType.secret && canEditThisAsset && (
          <MenuEntry
            hidden={hidden}
            action={shortcuts.KeyboardAction.edit}
            doAction={() => {
              setModal(
                <UpsertSecretModal
                  id={smartAsset.value.id}
                  name={asset.title}
                  doCreate={async (_name, value) => {
                    try {
                      await smartAsset.update({ value })
                    } catch (error) {
                      toastAndLog(null, error)
                    }
                  }}
                />
              )
            }}
          />
        )}
        {isCloud && (
          <MenuEntry
            hidden={hidden}
            disabled
            action={shortcuts.KeyboardAction.snapshot}
            doAction={() => {
              // No backend support yet.
            }}
          />
        )}
        {ownsThisAsset && !isRunningProject && !isOtherUserUsingProject && (
          <MenuEntry
            hidden={hidden}
            action={
              backend.type === backendModule.BackendType.local
                ? shortcuts.KeyboardAction.delete
                : shortcuts.KeyboardAction.moveToTrash
            }
            doAction={() => {
              if (backend.type === backendModule.BackendType.remote) {
                unsetModal()
                doDelete()
              } else {
                setModal(
                  <ConfirmDeleteModal
                    description={`the ${asset.type} '${asset.title}'`}
                    doDelete={doDelete}
                  />
                )
              }
            }}
          />
        )}
        {isCloud && <ContextMenuSeparator hidden={hidden} />}
        {isCloud && managesThisAsset && self != null && (
          <MenuEntry
            hidden={hidden}
            action={shortcuts.KeyboardAction.share}
            doAction={() => {
              setModal(
                <ManagePermissionsModal
                  item={smartAsset}
                  setItem={setAsset}
                  backend={backend}
                  self={self}
                  eventTarget={eventTarget}
                  doRemoveSelf={() => {
                    dispatchAssetEvent({ type: AssetEventType.removeSelf, id: asset.id })
                  }}
                />
              )
            }}
          />
        )}
        {isCloud && (
          <MenuEntry
            hidden={hidden}
            action={shortcuts.KeyboardAction.label}
            doAction={() => {
              setModal(
                <ManageLabelsModal
                  item={asset}
                  setItem={setAsset}
                  backend={backend}
                  allLabels={labels}
                  doCreateLabel={doCreateLabel}
                  eventTarget={eventTarget}
                />
              )
            }}
          />
        )}
        {isCloud && managesThisAsset && self != null && <ContextMenuSeparator hidden={hidden} />}
        <MenuEntry
          hidden={hidden}
          disabled={!isCloud}
          action={shortcuts.KeyboardAction.duplicate}
          doAction={() => {
            unsetModal()
            dispatchAssetListEvent({
              type: AssetListEventType.copy,
              newParentKey: item.directoryKey,
              newParent: item.directory,
              items: [smartAsset],
            })
          }}
        />
        {isCloud && (
          <MenuEntry hidden={hidden} action={shortcuts.KeyboardAction.copy} doAction={doCopy} />
        )}
        {isCloud && !isOtherUserUsingProject && (
          <MenuEntry hidden={hidden} action={shortcuts.KeyboardAction.cut} doAction={doCut} />
        )}
        <MenuEntry
          hidden={hidden}
          disabled={isCloud && asset.type !== backendModule.AssetType.file}
          action={shortcuts.KeyboardAction.download}
          doAction={() => {
            unsetModal()
            dispatchAssetEvent({
              type: AssetEventType.download,
              ids: new Set([asset.id]),
            })
          }}
        />
        {hasPasteData && (
          <MenuEntry
            hidden={hidden}
            action={shortcuts.KeyboardAction.paste}
            doAction={() => {
              const directoryKey =
                item.item.type === backendModule.AssetType.directory ? item.key : item.directoryKey
              doPaste(directoryKey)
            }}
          />
        )}
      </ContextMenu>
      {category === Category.home && (
        <GlobalContextMenu
          hidden={hidden}
          isCloud={isCloud}
          hasPasteData={hasPasteData}
          directoryKey={
            // This is SAFE, as both branches are guaranteed to be `DirectoryId`s
            // eslint-disable-next-line no-restricted-syntax
            (asset.type === backendModule.AssetType.directory
              ? item.key
              : item.directoryKey) as backendModule.DirectoryId
          }
          directory={
            smartAsset.type === backendModule.AssetType.directory ? smartAsset : item.directory
          }
          dispatchAssetListEvent={dispatchAssetListEvent}
          doPaste={doPaste}
        />
      )}
    </ContextMenus>
  )
}
