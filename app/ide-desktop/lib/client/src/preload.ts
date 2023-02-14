const { contextBridge, ipcRenderer } = require('electron')
import * as ipc from 'ipc'

// ==================
// === Debug APIs ===
// ==================

// These APIs expose functionality for use from Rust; see the bindings in the `debug_api` module for
// the primary documentation.

// Shutdown-related commands and events.
contextBridge.exposeInMainWorld('enso_lifecycle', {
    // Allows application-exit to be initiated from WASM code.
    // This is used, for example, in a key binding (Ctrl+Alt+Q) that saves a performance profile and exits.
    quit: () => ipcRenderer.send(ipc.channel.quit),
})

// Save and load profile data.
let onProfiles: any = []
let profilesLoaded: any
ipcRenderer.on(ipc.channel.profilesLoaded, (event, profiles) => {
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
    loadProfiles: (callback: any) => {
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
