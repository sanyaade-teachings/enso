/** @file Header menubar for the directory listing, containing information about
 * the current directory and some configuration options. */
import * as React from 'react'

import AddConnectorIcon from 'enso-assets/add_connector.svg'
import AddFolderIcon from 'enso-assets/add_folder.svg'
import AddKeyIcon from 'enso-assets/add_key.svg'
import DataDownloadIcon from 'enso-assets/data_download.svg'
import DataUploadIcon from 'enso-assets/data_upload.svg'

import * as backendProvider from '#/providers/BackendProvider'
import * as inputBindingsProvider from '#/providers/InputBindingsProvider'
import * as modalProvider from '#/providers/ModalProvider'
import * as textProvider from '#/providers/TextProvider'

import type * as assetEvent from '#/events/assetEvent'
import AssetEventType from '#/events/AssetEventType'

import Category from '#/layouts/CategorySwitcher/Category'

import Button from '#/components/Button'

import ConfirmDeleteModal from '#/modals/ConfirmDeleteModal'
import UpsertDataLinkModal from '#/modals/UpsertDataLinkModal'
import UpsertSecretModal from '#/modals/UpsertSecretModal'

import * as backendModule from '#/services/Backend'

import * as sanitizedEventTargets from '#/utilities/sanitizedEventTargets'

// ================
// === DriveBar ===
// ================

/** Props for a {@link DriveBar}. */
export interface DriveBarProps {
  readonly category: Category
  readonly canDownloadFiles: boolean
  readonly doEmptyTrash: () => void
  readonly doCreateProject: () => void
  readonly doCreateDirectory: () => void
  readonly doCreateSecret: (name: string, value: string) => void
  readonly doCreateDataLink: (name: string, value: unknown) => void
  readonly doUploadFiles: (files: File[]) => void
  readonly dispatchAssetEvent: (event: assetEvent.AssetEvent) => void
}

/** Displays the current directory path and permissions, upload and download buttons,
 * and a column display mode switcher. */
export default function DriveBar(props: DriveBarProps) {
  const { category, canDownloadFiles, doEmptyTrash, doCreateProject, doCreateDirectory } = props
  const { doCreateSecret, doCreateDataLink, doUploadFiles, dispatchAssetEvent } = props
  const { backend } = backendProvider.useBackend()
  const { setModal, unsetModal } = modalProvider.useSetModal()
  const { getText } = textProvider.useText()
  const inputBindings = inputBindingsProvider.useInputBindings()
  const uploadFilesRef = React.useRef<HTMLInputElement>(null)
  const isCloud = backend.type === backendModule.BackendType.remote
  const isHomeCategory = category === Category.home || !isCloud

  React.useEffect(() => {
    return inputBindings.attach(sanitizedEventTargets.document.body, 'keydown', {
      ...(backend.type !== backendModule.BackendType.local
        ? {
            newFolder: () => {
              doCreateDirectory()
            },
          }
        : {}),
      newProject: () => {
        doCreateProject()
      },
      uploadFiles: () => {
        uploadFilesRef.current?.click()
      },
    })
  }, [backend.type, doCreateDirectory, doCreateProject, /* should never change */ inputBindings])

  return category === Category.trash ? (
    <div className="flex h-8 py-0.5">
      <div className="flex gap-2.5">
        <button
          className="flex items-center bg-frame rounded-full h-8 px-2.5"
          onClick={event => {
            event.stopPropagation()
            setModal(
              <ConfirmDeleteModal actionText="all trashed items forever" doDelete={doEmptyTrash} />
            )
          }}
        >
          <span className="font-semibold whitespace-nowrap leading-5 h-6 py-px">
            {getText('clearTrash')}
          </span>
        </button>
      </div>
    </div>
  ) : (
    <div className="flex h-8 py-0.5">
      <div className="flex gap-2.5">
        <button
          disabled={!isHomeCategory}
          className="flex items-center bg-frame rounded-full h-8 px-2.5"
          {...(!isHomeCategory ? { title: getText('newProjectInHomeOnly') } : {})}
          onClick={() => {
            unsetModal()
            doCreateProject()
          }}
        >
          <span
            className={`font-semibold whitespace-nowrap leading-5 h-6 py-px ${
              !isHomeCategory ? 'opacity-50' : ''
            }`}
          >
            {getText('newProject')}
          </span>
        </button>
        <div className="flex items-center text-black/50 bg-frame rounded-full gap-3 h-8 px-3">
          {isCloud && (
            <Button
              active={isHomeCategory}
              disabled={!isHomeCategory}
              error={getText('newFolderInHomeOnly')}
              image={AddFolderIcon}
              alt={getText('newFolder')}
              disabledOpacityClassName="opacity-20"
              onClick={() => {
                unsetModal()
                doCreateDirectory()
              }}
            />
          )}
          {isCloud && (
            <Button
              active={isHomeCategory}
              disabled={!isHomeCategory}
              error={getText('newSecretInHomeOnly')}
              image={AddKeyIcon}
              alt={getText('newSecret')}
              disabledOpacityClassName="opacity-20"
              onClick={event => {
                event.stopPropagation()
                setModal(<UpsertSecretModal id={null} name={null} doCreate={doCreateSecret} />)
              }}
            />
          )}
          {isCloud && (
            <Button
              active={isHomeCategory}
              disabled={!isHomeCategory}
              error={getText('newDataLinkInHomeOnly')}
              image={AddConnectorIcon}
              alt={getText('newDataLink')}
              disabledOpacityClassName="opacity-20"
              onClick={event => {
                event.stopPropagation()
                setModal(<UpsertDataLinkModal doCreate={doCreateDataLink} />)
              }}
            />
          )}
          <input
            ref={uploadFilesRef}
            type="file"
            multiple
            id="upload_files_input"
            name="upload_files_input"
            {...(isCloud ? {} : { accept: '.enso-project' })}
            className="hidden"
            onInput={event => {
              if (event.currentTarget.files != null) {
                doUploadFiles(Array.from(event.currentTarget.files))
              }
              // Clear the list of selected files. Otherwise, `onInput` will not be
              // dispatched again if the same file is selected.
              event.currentTarget.value = ''
            }}
          />
          <Button
            active={isHomeCategory}
            disabled={!isHomeCategory}
            error={getText('uploadToHomeOnly')}
            image={DataUploadIcon}
            alt={getText('uploadFiles')}
            disabledOpacityClassName="opacity-20"
            onClick={() => {
              unsetModal()
              uploadFilesRef.current?.click()
            }}
          />
          <Button
            active={canDownloadFiles}
            disabled={!canDownloadFiles}
            image={DataDownloadIcon}
            alt={getText('downloadFiles')}
            error={getText('canOnlyDownloadFilesError')}
            disabledOpacityClassName="opacity-20"
            onClick={event => {
              event.stopPropagation()
              unsetModal()
              dispatchAssetEvent({ type: AssetEventType.downloadSelected })
            }}
          />
        </div>
      </div>
    </div>
  )
}
