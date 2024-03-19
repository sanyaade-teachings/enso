/**
 * @file
 * The hook contains the logic for mounting the children into the portal.
 */
import * as React from 'react'

import invariant from 'tiny-invariant'

import * as portalProvider from './PortalProvider'
import type * as types from './types'

/**
 * The hook contains the logic for mounting the children into the portal.
 * @internal
 */
export function usePortal(props: types.PortalProps) {
  const { children, isDisabled = false, root = null, onMount } = props

  const onMountRef = React.useRef(onMount)
  const portalContext = portalProvider.usePortalContext()
  const [mountRoot, setMountRoot] = React.useState<Element | null>(null)
  onMountRef.current = onMount

  React.useEffect(() => {
    if (!isDisabled) {
      const contextRoot = portalContext.root
      const currentRoot = root?.current ?? null
      const currentContextRoot = contextRoot?.current ?? null

      invariant(
        !(contextRoot == null && currentRoot == null),
        'Before using Portal, you need to specify a root, where the component should be mounted or put the component under the <Root /> component'
      )

      setMountRoot(currentRoot ?? currentContextRoot)
    }
  }, [root, portalContext.root, isDisabled])

  React.useEffect(() => {
    if (isDisabled || mountRoot) {
      onMountRef.current?.()
    }
  }, [isDisabled, mountRoot])

  return {
    isDisabled,
    children,
    mountRoot,
  }
}
