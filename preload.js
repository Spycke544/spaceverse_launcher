const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge exposed to the Space Verse launcher UI.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // ---- Window controls ----
    closeApp: () => ipcRenderer.send('appClose'),
    minimizeApp: () => ipcRenderer.send('minimizeApp'),

    // ---- Discord ----
    openDiscord: () => ipcRenderer.send('opendc'),

    // ---- FiveM server ----
    getServerStatus: (ip) => ipcRenderer.invoke('getServerStatus', ip),
    getConnectedPlayers: (ip) => ipcRenderer.invoke('getConnectedPlayers', ip),
    startFiveM: (ip) => ipcRenderer.invoke('startFiveM', ip),
    getFiveMPath: () => ipcRenderer.invoke('getFiveMPath'),

    // ---- FiveM cache ----
    clearFiveMCache: () => ipcRenderer.invoke('clear-fivem-cache'),

    // ---- Config & version ----
    getConfig: () => ipcRenderer.invoke('getConfig'),
    getAppVersion: () => ipcRenderer.invoke('getAppVersion'),

    // ---- External links ----
    openExternal: (url) => ipcRenderer.invoke('openExternal', url),

    // ---- Auto-updater ----
    onUpdateStatus: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const subscription = (_event, data) => callback(data);
        ipcRenderer.on('update-status', subscription);
        return () => ipcRenderer.removeListener('update-status', subscription);
    }
});

contextBridge.exposeInMainWorld('launcherConfig', {
    get: () => ipcRenderer.invoke('getConfig')
});
