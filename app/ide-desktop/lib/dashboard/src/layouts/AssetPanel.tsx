/** @file A panel containing the description and settings for an asset. */
import * as React from 'react'

import * as localStorageProvider from '#/providers/LocalStorageProvider'
import * as textProvider from '#/providers/TextProvider'

import type * as assetEvent from '#/events/assetEvent'

import AssetProperties from '#/layouts/AssetProperties'
import AssetVersions from '#/layouts/AssetVersions/AssetVersions'
import type Category from '#/layouts/CategorySwitcher/Category'

import UnstyledButton from '#/components/UnstyledButton'

import * as backend from '#/services/Backend'

import * as array from '#/utilities/array'
import type AssetQuery from '#/utilities/AssetQuery'
import type * as assetTreeNode from '#/utilities/AssetTreeNode'
import LocalStorage from '#/utilities/LocalStorage'

// =====================
// === AssetPanelTab ===
// =====================

/** Determines the content of the {@link AssetPanel}. */
enum AssetPanelTab {
  properties = 'properties',
  versions = 'versions',
}

// ============================
// === Global configuration ===
// ============================

declare module '#/utilities/LocalStorage' {
  /** */
  interface LocalStorageData {
    readonly assetPanelTab: AssetPanelTab
  }
}

const TABS = Object.values(AssetPanelTab)
LocalStorage.registerKey('assetPanelTab', {
  tryParse: value => (array.includes(TABS, value) ? value : null),
})

// ==================
// === AssetPanel ===
// ==================

/** The subset of {@link AssetPanelProps} that are required to be supplied by the row. */
export interface AssetPanelRequiredProps {
  readonly item: assetTreeNode.AnyAssetTreeNode | null
  readonly setItem: React.Dispatch<React.SetStateAction<assetTreeNode.AnyAssetTreeNode>> | null
}

/** Props for an {@link AssetPanel}. */
export interface AssetPanelProps extends AssetPanelRequiredProps {
  readonly isReadonly?: boolean
  readonly setQuery: React.Dispatch<React.SetStateAction<AssetQuery>>
  readonly category: Category
  readonly labels: backend.Label[]
  readonly dispatchAssetEvent: (event: assetEvent.AssetEvent) => void
}

/** A panel containing the description and settings for an asset. */
export default function AssetPanel(props: AssetPanelProps) {
  const {
    item,
    setItem,
    setQuery,
    category,
    labels,
    dispatchAssetEvent,
    isReadonly = false,
  } = props

  const { getText } = textProvider.useText()
  const { localStorage } = localStorageProvider.useLocalStorage()
  const [initialized, setInitialized] = React.useState(false)
  const [tab, setTab] = React.useState(() => {
    const savedTab = localStorage.get('assetPanelTab') ?? AssetPanelTab.properties
    if (
      (item?.item.type === backend.AssetType.secret ||
        item?.item.type === backend.AssetType.directory) &&
      savedTab === AssetPanelTab.versions
    ) {
      return AssetPanelTab.properties
    } else {
      return savedTab
    }
  })

  React.useEffect(() => {
    // This prevents secrets and directories always setting the tab to `properties`
    // (because they do not support the `versions` tab).
    if (initialized) {
      localStorage.set('assetPanelTab', tab)
    }
    // `initialized` is NOT a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, /* should never change */ localStorage])

  React.useEffect(() => {
    setInitialized(true)
  }, [])

  return (
    <div
      data-testid="asset-panel"
      className="pointer-events-none absolute flex h-full w-asset-panel flex-col gap-asset-panel border-l-2 border-black/[0.12] p-top-bar-margin pl-asset-panel-l"
      onClick={event => {
        event.stopPropagation()
      }}
    >
      <div className="flex">
        {item != null &&
          item.item.type !== backend.AssetType.secret &&
          item.item.type !== backend.AssetType.directory && (
            <UnstyledButton
              className={`button pointer-events-auto select-none bg-frame px-button-x leading-cozy transition-colors hover:bg-selected-frame ${
                tab !== AssetPanelTab.versions ? '' : 'bg-selected-frame active'
              }`}
              onPress={() => {
                setTab(oldTab =>
                  oldTab === AssetPanelTab.versions
                    ? AssetPanelTab.properties
                    : AssetPanelTab.versions
                )
              }}
            >
              {getText('versions')}
            </UnstyledButton>
          )}
        {/* Spacing. The top right asset and user bars overlap this area. */}
        <div className="grow" />
      </div>
      {item == null || setItem == null ? (
        <div className="grid grow place-items-center text-lg">
          {getText('selectExactlyOneAssetToViewItsDetails')}
        </div>
      ) : (
        <>
          {tab === AssetPanelTab.properties && (
            <AssetProperties
              isReadonly={isReadonly}
              item={item}
              setItem={setItem}
              category={category}
              labels={labels}
              setQuery={setQuery}
              dispatchAssetEvent={dispatchAssetEvent}
            />
          )}
          {tab === AssetPanelTab.versions && <AssetVersions item={item} />}
        </>
      )}
    </div>
  )
}
