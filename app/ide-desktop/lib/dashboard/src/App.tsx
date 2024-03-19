/** @file File containing the {@link App} React component, which is the entrypoint into our React
 * application.
 *
 * # Providers
 *
 * The {@link App} component is responsible for defining the global context used by child
 * components. For example, it defines a {@link toastify.ToastContainer}, which is used to display temporary
 * notifications to the user. These global components are defined at the top of the {@link App} so
 * that they are available to all of the child components.
 *
 * The {@link App} also defines various providers (e.g., {@link authProvider.AuthProvider}).
 * Providers are a React-specific concept that allows components to access global state without
 * having to pass it down through the component tree. For example, the
 * {@link authProvider.AuthProvider} wraps the entire application, and provides the context
 * necessary for child components to use the {@link authProvider.useAuth} hook. The
 * {@link authProvider.useAuth} hook lets child components access the user's authentication session
 * (i.e., email, username, etc.) and it also provides methods for signing the user in, etc.
 *
 * Providers consist of a provider component that wraps the application, a context object defined
 * by the provider component, and a hook that can be used by child components to access the context.
 * All of the providers are initialized here, at the {@link App} component to ensure that they are
 * available to all of the child components.
 *
 * # Routes and Authentication
 *
 * The {@link AppRouter} component defines the layout of the application, in terms of navigation. It
 * consists of a list of {@link router.Route}s, as well as the HTTP pathnames that the
 * {@link router.Route}s can be accessed by.
 *
 * The {@link router.Route}s are grouped by authorization level. Some routes are
 * accessed by unauthenticated (i.e., not signed in) users. Some routes are accessed by partially
 * authenticated users (c.f. {@link authProvider.PartialUserSession}). That is, users who have
 * signed up but who have not completed email verification or set a username. The remaining
 * {@link router.Route}s require fully authenticated users (c.f.
 * {@link authProvider.FullUserSession}). */
import * as React from 'react'

import * as reactQuery from '@tanstack/react-query'
import * as router from 'react-router-dom'
import * as toastify from 'react-toastify'

import * as detect from 'enso-common/src/detect'

import * as appUtils from '#/appUtils'

import * as inputBindingsModule from '#/configurations/inputBindings'

import AuthProvider, * as authProvider from '#/providers/AuthProvider'
import BackendProvider from '#/providers/BackendProvider'
import InputBindingsProvider from '#/providers/InputBindingsProvider'
import LocalStorageProvider, * as localStorageProvider from '#/providers/LocalStorageProvider'
import LoggerProvider from '#/providers/LoggerProvider'
import type * as loggerProvider from '#/providers/LoggerProvider'
import ModalProvider from '#/providers/ModalProvider'
import SessionProvider from '#/providers/SessionProvider'

import ConfirmRegistration from '#/pages/authentication/ConfirmRegistration'
import EnterOfflineMode from '#/pages/authentication/EnterOfflineMode'
import ForgotPassword from '#/pages/authentication/ForgotPassword'
import Login from '#/pages/authentication/Login'
import Registration from '#/pages/authentication/Registration'
import ResetPassword from '#/pages/authentication/ResetPassword'
import SetUsername from '#/pages/authentication/SetUsername'
import Dashboard from '#/pages/dashboard/Dashboard'
import Subscribe from '#/pages/subscribe/Subscribe'

import * as rootComponent from '#/components/Root'

import type Backend from '#/services/Backend'
import LocalBackend from '#/services/LocalBackend'

import LocalStorage from '#/utilities/LocalStorage'
import * as object from '#/utilities/object'

import * as authServiceModule from '#/authentication/service'

// ============================
// === Global configuration ===
// ============================

declare module '#/utilities/LocalStorage' {
  /** */
  interface LocalStorageData {
    readonly inputBindings: Readonly<Record<string, readonly string[]>>
  }
}

LocalStorage.registerKey('inputBindings', {
  tryParse: value =>
    typeof value !== 'object' || value == null
      ? null
      : Object.fromEntries(
          Object.entries<unknown>({ ...value }).flatMap(kv => {
            const [k, v] = kv
            return Array.isArray(v) && v.every((item): item is string => typeof item === 'string')
              ? [[k, v]]
              : []
          })
        ),
})

// ======================
// === getMainPageUrl ===
// ======================

/** Returns the URL to the main page. This is the current URL, with the current route removed. */
function getMainPageUrl() {
  const mainPageUrl = new URL(window.location.href)
  mainPageUrl.pathname = mainPageUrl.pathname.replace(appUtils.ALL_PATHS_REGEX, '')
  return mainPageUrl
}

// ===========
// === App ===
// ===========

/** Global configuration for the `App` component. */
export interface AppProps {
  readonly vibrancy: boolean
  readonly logger: loggerProvider.Logger
  /** Whether the application may have the local backend running. */
  readonly supportsLocalBackend: boolean
  /** If true, the app can only be used in offline mode. */
  readonly isAuthenticationDisabled: boolean
  /** Whether the application supports deep links. This is only true when using
   * the installed app on macOS and Windows. */
  readonly supportsDeepLinks: boolean
  /** Whether the dashboard should be rendered. */
  readonly shouldShowDashboard: boolean
  /** The name of the project to open on startup, if any. */
  readonly initialProjectName: string | null
  readonly onAuthenticated: (accessToken: string | null) => void
  readonly projectManagerUrl: string | null
  readonly appRunner: AppRunner
}

/** Component called by the parent module, returning the root React component for this
 * package.
 *
 * This component handles all the initialization and rendering of the app, and manages the app's
 * routes. It also initializes an `AuthProvider` that will be used by the rest of the app. */
export default function App(props: AppProps) {
  // This is a React component even though it does not contain JSX.
  // eslint-disable-next-line no-restricted-syntax
  const Router = detect.isOnElectron() ? router.MemoryRouter : router.BrowserRouter
  const queryClient = React.useMemo(() => new reactQuery.QueryClient(), [])

  // Both `BackendProvider` and `InputBindingsProvider` depend on `LocalStorageProvider`.
  // Note that the `Router` must be the parent of the `AuthProvider`, because the `AuthProvider`
  // will redirect the user between the login/register pages and the dashboard.
  return (
    <reactQuery.QueryClientProvider client={queryClient}>
      <toastify.ToastContainer
        position="top-center"
        theme="light"
        closeOnClick={false}
        draggable={false}
        toastClassName="text-sm leading-cozy bg-selected-frame rounded-default backdrop-blur-default"
        transition={toastify.Zoom}
        limit={3}
      />
      <Router basename={getMainPageUrl().pathname}>
        <LocalStorageProvider>
          <AppRouter {...props} />
        </LocalStorageProvider>
      </Router>
    </reactQuery.QueryClientProvider>
  )
}

// =================
// === AppRouter ===
// =================

/** Router definition for the app.
 *
 * The only reason the {@link AppRouter} component is separate from the {@link App} component is
 * because the {@link AppRouter} relies on React hooks, which can't be used in the same React
 * component as the component that defines the provider. */
function AppRouter(props: AppProps) {
  const { logger, supportsLocalBackend, isAuthenticationDisabled, shouldShowDashboard } = props
  const { onAuthenticated, projectManagerUrl } = props
  // `navigateHooks.useNavigate` cannot be used here as it relies on `AuthProvider`, which has not
  // yet been initialized at this point.
  // eslint-disable-next-line no-restricted-properties
  const navigate = router.useNavigate()
  const { localStorage } = localStorageProvider.useLocalStorage()
  if (detect.IS_DEV_MODE) {
    // @ts-expect-error This is used exclusively for debugging.
    window.navigate = navigate
  }
  const [inputBindingsRaw] = React.useState(() => inputBindingsModule.createBindings())
  const [root] = React.useState<React.RefObject<HTMLElement>>(() => ({
    current: document.getElementById('enso-dashboard'),
  }))
  React.useEffect(() => {
    const savedInputBindings = localStorage.get('inputBindings')
    if (savedInputBindings != null) {
      const filteredInputBindings = object.mapEntries(
        inputBindingsRaw.metadata,
        k => savedInputBindings[k]
      )
      for (const [bindingKey, newBindings] of object.unsafeEntries(filteredInputBindings)) {
        for (const oldBinding of inputBindingsRaw.metadata[bindingKey].bindings) {
          inputBindingsRaw.delete(bindingKey, oldBinding)
        }
        for (const newBinding of newBindings ?? []) {
          inputBindingsRaw.add(bindingKey, newBinding)
        }
      }
    }
  }, [/* should never change */ localStorage, /* should never change */ inputBindingsRaw])
  const inputBindings = React.useMemo(() => {
    const updateLocalStorage = () => {
      localStorage.set(
        'inputBindings',
        Object.fromEntries(
          Object.entries(inputBindingsRaw.metadata).map(kv => {
            const [k, v] = kv
            return [k, v.bindings]
          })
        )
      )
    }
    return {
      /** Transparently pass through `handler()`. */
      get handler() {
        return inputBindingsRaw.handler.bind(inputBindingsRaw)
      },
      /** Transparently pass through `attach()`. */
      get attach() {
        return inputBindingsRaw.attach.bind(inputBindingsRaw)
      },
      reset: (bindingKey: inputBindingsModule.DashboardBindingKey) => {
        inputBindingsRaw.reset(bindingKey)
        updateLocalStorage()
      },
      add: (bindingKey: inputBindingsModule.DashboardBindingKey, binding: string) => {
        inputBindingsRaw.add(bindingKey, binding)
        updateLocalStorage()
      },
      delete: (bindingKey: inputBindingsModule.DashboardBindingKey, binding: string) => {
        inputBindingsRaw.delete(bindingKey, binding)
        updateLocalStorage()
      },
      /** Transparently pass through `metadata`. */
      get metadata() {
        return inputBindingsRaw.metadata
      },
      /** Transparently pass through `register()`. */
      get register() {
        return inputBindingsRaw.unregister.bind(inputBindingsRaw)
      },
      /** Transparently pass through `unregister()`. */
      get unregister() {
        return inputBindingsRaw.unregister.bind(inputBindingsRaw)
      },
    }
  }, [/* should never change */ localStorage, /* should never change */ inputBindingsRaw])
  const mainPageUrl = getMainPageUrl()
  const authService = React.useMemo(() => {
    const authConfig = { navigate, ...props }
    return authServiceModule.initAuthService(authConfig)
  }, [props, /* should never change */ navigate])
  const userSession = authService?.cognito.userSession.bind(authService.cognito) ?? null
  const registerAuthEventListener = authService?.registerAuthEventListener ?? null
  const initialBackend: Backend = isAuthenticationDisabled
    ? new LocalBackend(projectManagerUrl)
    : // This is safe, because the backend is always set by the authentication flow.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      null!
  React.useEffect(() => {
    let isClick = false
    const onMouseDown = () => {
      isClick = true
    }
    const onMouseUp = (event: MouseEvent) => {
      if (
        isClick &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        const selection = document.getSelection()
        const app = document.getElementById('app')
        const appContainsSelection =
          app != null &&
          selection != null &&
          selection.anchorNode != null &&
          app.contains(selection.anchorNode) &&
          selection.focusNode != null &&
          app.contains(selection.focusNode)
        if (selection != null && !appContainsSelection) {
          selection.removeAllRanges()
        }
      }
    }
    const onSelectStart = () => {
      isClick = false
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectstart', onSelectStart)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('selectstart', onSelectStart)
    }
  }, [])

  const routes = (
    <router.Routes>
      <React.Fragment>
        {/* Login & registration pages are visible to unauthenticated users. */}
        <router.Route element={<authProvider.GuestLayout />}>
          <router.Route path={appUtils.REGISTRATION_PATH} element={<Registration />} />
          <router.Route
            path={appUtils.LOGIN_PATH}
            element={<Login supportsLocalBackend={supportsLocalBackend} />}
          />
        </router.Route>
        {/* Protected pages are visible to authenticated users. */}
        <router.Route element={<authProvider.ProtectedLayout />}>
          <router.Route
            path={appUtils.DASHBOARD_PATH}
            element={shouldShowDashboard && <Dashboard {...props} />}
          />
          <router.Route path={appUtils.SUBSCRIBE_PATH} element={<Subscribe />} />
        </router.Route>
        {/* Semi-protected pages are visible to users currently registering. */}
        <router.Route element={<authProvider.SemiProtectedLayout />}>
          <router.Route path={appUtils.SET_USERNAME_PATH} element={<SetUsername />} />
        </router.Route>
        {/* Other pages are visible to unauthenticated and authenticated users. */}
        <router.Route path={appUtils.CONFIRM_REGISTRATION_PATH} element={<ConfirmRegistration />} />
        <router.Route path={appUtils.FORGOT_PASSWORD_PATH} element={<ForgotPassword />} />
        <router.Route path={appUtils.RESET_PASSWORD_PATH} element={<ResetPassword />} />
        <router.Route path={appUtils.ENTER_OFFLINE_MODE_PATH} element={<EnterOfflineMode />} />
      </React.Fragment>
    </router.Routes>
  )
  let result = routes
  result = <InputBindingsProvider inputBindings={inputBindings}>{result}</InputBindingsProvider>
  result = <ModalProvider>{result}</ModalProvider>
  result = (
    <AuthProvider
      shouldStartInOfflineMode={isAuthenticationDisabled}
      supportsLocalBackend={supportsLocalBackend}
      authService={authService}
      onAuthenticated={onAuthenticated}
      projectManagerUrl={projectManagerUrl}
    >
      {result}
    </AuthProvider>
  )
  result = <BackendProvider initialBackend={initialBackend}>{result}</BackendProvider>
  result = (
    <SessionProvider
      mainPageUrl={mainPageUrl}
      userSession={userSession}
      registerAuthEventListener={registerAuthEventListener}
    >
      {result}
    </SessionProvider>
  )
  result = <LoggerProvider logger={logger}>{result}</LoggerProvider>
  result = (
    <rootComponent.Root rootRef={root} navigate={navigate}>
      {result}
    </rootComponent.Root>
  )
  return result
}
