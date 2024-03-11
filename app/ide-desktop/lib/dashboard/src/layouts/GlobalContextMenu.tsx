/** @file A context menu available everywhere in the directory. */
import * as React from 'react'

import * as authProvider from '#/providers/AuthProvider'
import * as backendProvider from '#/providers/BackendProvider'
import * as modalProvider from '#/providers/ModalProvider'

import type * as assetListEventModule from '#/events/assetListEvent'
import AssetListEventType from '#/events/AssetListEventType'

import ContextMenu from '#/components/ContextMenu'
import MenuEntry from '#/components/MenuEntry'

import UpsertDataLinkModal from '#/modals/UpsertDataLinkModal'
import UpsertSecretModal from '#/modals/UpsertSecretModal'

import * as backendModule from '#/services/Backend'

/** Props for a {@link GlobalContextMenu}. */
export interface GlobalContextMenuProps {
  readonly hidden?: boolean
  readonly hasCopyData: boolean
  readonly directoryKey: backendModule.DirectoryId | null
  readonly directoryId: backendModule.DirectoryId | null
  readonly dispatchAssetListEvent: (event: assetListEventModule.AssetListEvent) => void
  readonly doPaste: (
    newParentKey: backendModule.AssetId,
    newParentId: backendModule.DirectoryId
  ) => void
}

/** A context menu available everywhere in the directory. */
export default function GlobalContextMenu(props: GlobalContextMenuProps) {
  const { hidden = false, hasCopyData, directoryKey, directoryId, dispatchAssetListEvent } = props
  const { doPaste } = props
  const { user } = authProvider.useNonPartialUserSession()
  const { backend } = backendProvider.useBackend()
  const { setModal, unsetModal } = modalProvider.useSetModal()
  const rootDirectoryId = React.useMemo(
    () => user?.rootDirectoryId ?? backendModule.DirectoryId(''),
    [user]
  )
  const filesInputRef = React.useRef<HTMLInputElement>(null)
  const isCloud = backend.type === backendModule.BackendType.remote
  return (
    <ContextMenu hidden={hidden}>
      {!hidden && (
        <input
          ref={filesInputRef}
          multiple
          type="file"
          id="context_menu_file_input"
          className="hidden"
          onInput={event => {
            if (event.currentTarget.files != null) {
              dispatchAssetListEvent({
                type: AssetListEventType.uploadFiles,
                parentKey: directoryKey ?? rootDirectoryId,
                parentId: directoryId ?? rootDirectoryId,
                files: Array.from(event.currentTarget.files),
              })
              unsetModal()
            }
          }}
        />
      )}
      <MenuEntry
        hidden={hidden}
        action={backend.type === backendModule.BackendType.local ? 'uploadProjects' : 'uploadFiles'}
        doAction={() => {
          if (filesInputRef.current?.isConnected === true) {
            filesInputRef.current.click()
          } else {
            const input = document.createElement('input')
            input.type = 'file'
            input.style.display = 'none'
            document.body.appendChild(input)
            input.addEventListener('input', () => {
              if (input.files != null) {
                dispatchAssetListEvent({
                  type: AssetListEventType.uploadFiles,
                  parentKey: directoryKey ?? rootDirectoryId,
                  parentId: directoryId ?? rootDirectoryId,
                  files: Array.from(input.files),
                })
                unsetModal()
              }
            })
            input.click()
            input.remove()
          }
        }}
      />
      <MenuEntry
        hidden={hidden}
        action="newProject"
        doAction={() => {
          unsetModal()
          dispatchAssetListEvent({
            type: AssetListEventType.newProject,
            parentKey: directoryKey ?? rootDirectoryId,
            parentId: directoryId ?? rootDirectoryId,
            templateId: null,
            templateName: null,
            onSpinnerStateChange: null,
          })
        }}
      />
      <MenuEntry
        hidden={hidden}
        action="newFolder"
        doAction={() => {
          unsetModal()
          dispatchAssetListEvent({
            type: AssetListEventType.newFolder,
            parentKey: directoryKey ?? rootDirectoryId,
            parentId: directoryId ?? rootDirectoryId,
          })
        }}
      />
      {isCloud && (
        <MenuEntry
          hidden={hidden}
          action="newSecret"
          doAction={() => {
            setModal(
              <UpsertSecretModal
                id={null}
                name={null}
                doCreate={(name, value) => {
                  dispatchAssetListEvent({
                    type: AssetListEventType.newSecret,
                    parentKey: directoryKey ?? rootDirectoryId,
                    parentId: directoryId ?? rootDirectoryId,
                    name,
                    value,
                  })
                }}
              />
            )
          }}
        />
      )}
      {isCloud && (
        <MenuEntry
          hidden={hidden}
          action="newDataLink"
          doAction={() => {
            setModal(
              <UpsertDataLinkModal
                doCreate={(name, value) => {
                  dispatchAssetListEvent({
                    type: AssetListEventType.newDataLink,
                    parentKey: directoryKey ?? rootDirectoryId,
                    parentId: directoryId ?? rootDirectoryId,
                    name,
                    value,
                  })
                }}
              />
            )
          }}
        />
      )}
      {isCloud && directoryKey == null && hasCopyData && (
        <MenuEntry
          hidden={hidden}
          action="paste"
          doAction={() => {
            unsetModal()
            doPaste(rootDirectoryId, rootDirectoryId)
          }}
        />
      )}
    </ContextMenu>
  )
}
