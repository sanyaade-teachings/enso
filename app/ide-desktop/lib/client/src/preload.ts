/** @file Preload script containing code that runs before web page is loaded into the browser
 * window. It has access to both DOM APIs and Node environment, and is used to expose privileged
 * APIs to the renderer via the contextBridge API. To learn more, visit:
 * https://www.electronjs.org/docs/latest/tutorial/tutorial-preload. */

const { contextBridge, ipcRenderer } = require('electron')
import * as ipc from 'ipc'



// =================
// === Constants ===
// =================

/** Name given to the {@link AUTHENTICATION_API} object, when it is exposed on the Electron main
 * window. */
const AUTHENTICATION_API_KEY = 'authenticationApi'



// ======================
// === Profiling APIs ===
// ======================

// These APIs expose functionality for use from Rust. See the bindings in the `debug_api` module for
// the primary documentation.

/** Shutdown-related commands and events. */
contextBridge.exposeInMainWorld('enso_lifecycle', {
    /** Allows application-exit to be initiated from WASM code.
     * This is used, for example, in a key binding (Ctrl+Alt+Q) that saves a performance profile and
     * exits. */
    quit: () => ipcRenderer.send(ipc.channel.quit),
})

// Save and load profile data.
let onProfiles: ((profiles: string[]) => void)[] = []
let profilesLoaded: string[]
ipcRenderer.on(ipc.channel.profilesLoaded, (event, profiles: string[]) => {
    for (const callback of onProfiles) {
        callback(profiles)
    }
    onProfiles = []
    profilesLoaded = profiles
})
contextBridge.exposeInMainWorld('enso_profiling_data', {
    // Delivers profiling log.
    saveProfile: (data: any) => ipcRenderer.send(ipc.channel.saveProfile, data),
    // Requests any loaded profiling logs.
    loadProfiles: (callback: (profiles: string[]) => void) => {
        if (profilesLoaded === undefined) {
            ipcRenderer.send('load-profiles')
            onProfiles.push(callback)
        } else {
            callback(profilesLoaded)
        }
    },
})

// Access to the system console that Electron was run from.
contextBridge.exposeInMainWorld('enso_console', {
    // Print an error message with `console.error`.
    error: (data: any) => ipcRenderer.send('error', data),
})



// ==========================
// === Authentication API ===
// ==========================

/** Object exposed on the Electron main window; provides proxy functions to:
 * - open OAuth flows in the system browser, and
 * - handle deep links from the system browser or email client to the dashboard.
 *
 * Some functions (i.e., the functions to open URLs in the system browser) are not available in
 * sandboxed processes (i.e., the dashboard). So the {@link contextBridge.exposeInMainWorld} API is
 * used to expose these functions. The functions are exposed via this "API object", which is added
 * to the main window.
 *
 * For more details, see: https://www.electronjs.org/docs/latest/api/context-bridge#api-functions */
const AUTHENTICATION_API = {
    /** Opens a URL in the system browser (rather than in the app).
     *
     * OAuth URLs must be opened this way because the dashboard application is sandboxed and thus
     * not privileged to do so unless we explicitly expose this functionality. */
    openUrlInSystemBrowser: (url: string) => ipcRenderer.send(ipc.channel.openUrlInSystemBrowser, url),
    /** Set the callback that will be called when a deep link to the application is opened.
     *
     * The callback is intended to handle links like
     * `enso://authentication/register?code=...&state=...` from external sources like the user's
     * system browser or email client. Handling the links involves resuming whatever flow was in
     * progress when the link was opened (e.g., an OAuth registration flow). */
    setDeepLinkHandler: (callback: (url: string) => void) =>
        ipcRenderer.on(ipc.channel.openDeepLink, (_event, url) => callback(url)),
};
contextBridge.exposeInMainWorld(AUTHENTICATION_API_KEY, AUTHENTICATION_API);
