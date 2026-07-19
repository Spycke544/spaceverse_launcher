const { app, BrowserWindow, ipcMain, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Server = require('./Server');
const find = require('find-process');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

const CFG = require('./config.json');

let mainWindow = null;
let fiveMPath = null;

// ============================================
// Windows
// ============================================

const createMainWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 720,
        minWidth: 1080,
        minHeight: 660,
        resizable: false,
        frame: false,
        backgroundColor: '#05070f',
        show: false,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: process.env.NODE_ENV === 'development'
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });
};

// ============================================
// FiveM path (Windows registry)
// ============================================

const getFiveMPathFromRegistry = () => {
    return new Promise((resolve) => {
        if (fiveMPath) return resolve(fiveMPath);

        try {
            const regedit = require('regedit');

            let vbsPath;
            if (app.isPackaged) {
                vbsPath = path.join(process.resourcesPath, 'regedit', 'vbs');
            } else {
                vbsPath = path.join(__dirname, 'node_modules', 'regedit', 'vbs');
            }
            regedit.setExternalVBSLocation(vbsPath);

            regedit.list('HKCU\\SOFTWARE\\CitizenFX\\FiveM\\', (err, result) => {
                if (err) return resolve(null);

                for (const key in result) {
                    try {
                        const value = result[key]?.values?.['Last Run Location']?.value;
                        if (value && fs.existsSync(value)) {
                            fiveMPath = value;
                            return resolve(fiveMPath);
                        }
                    } catch (e) { /* keep looking */ }
                }
                resolve(null);
            });
        } catch (error) {
            console.error('Error reading registry:', error);
            resolve(null);
        }
    });
};

// ============================================
// FiveM cache
// ============================================

const clearFiveMCache = async () => {
    try {
        const basePath = path.join(process.env.LOCALAPPDATA, 'FiveM', 'FiveM.app');
        const foldersToDelete = [
            'crashes',
            'logs',
            path.join('data', 'cache'),
            path.join('data', 'nui-storage'),
            path.join('data', 'server-cache'),
            path.join('data', 'server-cache-priv')
        ];

        let deletedCount = 0;
        for (const folder of foldersToDelete) {
            const fullPath = path.join(basePath, folder);
            if (fs.existsSync(fullPath)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                deletedCount++;
            }
        }

        return {
            success: true,
            message: `Cache FiveM purgé — ${deletedCount} secteur${deletedCount > 1 ? 's' : ''} nettoyé${deletedCount > 1 ? 's' : ''}.`
        };
    } catch (err) {
        return { success: false, message: `Erreur : ${err.message}` };
    }
};

// ============================================
// FiveM launch + smart connect
// ============================================

const startFiveM = async (ip) => {
    try {
        if (!ip || typeof ip !== 'string') {
            throw new Error('Adresse du serveur invalide.');
        }

        const cleanIp = ip.trim();
        const connectUrl = `fivem://connect/${cleanIp}`;
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        /**
         * Returns an active FiveM window (PID stays stable between the loading
         * screen and the final window, so we rely on the window handle, not PID).
         */
        const getFiveMWindow = () => {
            return new Promise((resolve) => {
                const { execFile } = require('child_process');

                const powershellCommand = `
                    $process = Get-Process -ErrorAction SilentlyContinue |
                        Where-Object {
                            $_.ProcessName -like "FiveM*" -and
                            $_.MainWindowHandle -ne 0
                        } |
                        Select-Object -First 1

                    if ($process) {
                        $process.Refresh()
                        @{
                            pid = $process.Id
                            handle = $process.MainWindowHandle.ToInt64()
                            title = $process.MainWindowTitle
                            responding = $process.Responding
                        } | ConvertTo-Json -Compress
                    }
                `;

                execFile(
                    'powershell.exe',
                    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', powershellCommand],
                    { windowsHide: true, timeout: 5000 },
                    (error, stdout) => {
                        if (error || !stdout.trim()) return resolve(null);
                        try { resolve(JSON.parse(stdout.trim())); }
                        catch (parseError) { resolve(null); }
                    }
                );
            });
        };

        // Already running → connect straight away.
        const existingWindow = await getFiveMWindow();
        if (existingWindow && existingWindow.responding === true && existingWindow.handle) {
            console.log(`FiveM déjà ouvert, connexion : ${connectUrl}`);
            await shell.openExternal(connectUrl);
            return { success: true };
        }

        // Cold start.
        console.log('Lancement de FiveM...');
        await shell.openExternal('fivem://');

        // 1) wait for the loading window to appear
        let loadingWindowDetected = false;
        const loadingTimeout = Date.now() + 120000;
        while (Date.now() < loadingTimeout) {
            const windowInfo = await getFiveMWindow();
            if (windowInfo && windowInfo.handle) {
                loadingWindowDetected = true;
                console.log(`Fenêtre de chargement détectée : PID ${windowInfo.pid}`);
                break;
            }
            await wait(500);
        }
        if (!loadingWindowDetected) {
            throw new Error('La fenêtre de chargement FiveM n’a pas été détectée.');
        }

        // 2) wait for the loading window to actually disappear (2 confirmations)
        let missingChecks = 0;
        const disappearanceTimeout = Date.now() + 180000;
        while (Date.now() < disappearanceTimeout) {
            const windowInfo = await getFiveMWindow();
            if (!windowInfo || !windowInfo.handle) {
                missingChecks++;
                if (missingChecks >= 2) break;
            } else {
                missingChecks = 0;
            }
            await wait(500);
        }
        if (missingChecks < 2) {
            throw new Error('La fenêtre de chargement FiveM ne s’est pas fermée.');
        }

        // 3) wait for the final, responsive window
        console.log('Chargement terminé, attente de la fenêtre finale...');
        let finalWindow = null;
        const finalWindowTimeout = Date.now() + 120000;
        while (Date.now() < finalWindowTimeout) {
            const windowInfo = await getFiveMWindow();
            if (windowInfo && windowInfo.handle && windowInfo.responding === true) {
                finalWindow = windowInfo;
                break;
            }
            await wait(500);
        }
        if (!finalWindow) {
            throw new Error('La fenêtre finale FiveM n’a pas été détectée.');
        }

        // small margin then connect
        await wait(3000);
        console.log(`Connexion au serveur : ${connectUrl}`);
        await shell.openExternal(connectUrl);

        return { success: true };
    } catch (error) {
        console.error('Erreur lors du lancement de FiveM :', error);
        return { success: false, error: error.message };
    }
};

// ============================================
// IPC
// ============================================

ipcMain.on('appClose', () => {
    if (mainWindow) mainWindow.close();
    app.quit();
});
ipcMain.on('minimizeApp', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('opendc', () => { shell.openExternal(CFG.discord); });

ipcMain.handle('getConfig', () => CFG);
ipcMain.handle('getAppVersion', () => app.getVersion());
ipcMain.handle('openExternal', async (event, url) => { shell.openExternal(url); });

ipcMain.handle('getServerStatus', async (event, ip) => {
    try {
        const API = new Server(ip);
        return await API.getServerStatus();
    } catch (error) {
        return { online: false, error: error.message };
    }
});

ipcMain.handle('getConnectedPlayers', async (event, ip) => {
    try {
        const API = new Server(ip);
        return await API.getPlayersList();
    } catch (error) {
        return [];
    }
});

ipcMain.handle('getFiveMPath', async () => await getFiveMPathFromRegistry());
ipcMain.handle('startFiveM', async (event, ip) => await startFiveM(ip));
ipcMain.handle('clear-fivem-cache', async () => await clearFiveMCache());

// ============================================
// Auto-updater
// ============================================

const sendUpdateStatus = (payload) => {
    mainWindow?.webContents.send('update-status', payload);
};

const setupAutoUpdater = () => {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;

    autoUpdater.on('checking-for-update', () => {
        sendUpdateStatus({ state: 'checking', message: 'Analyse du réseau orbital...' });
    });

    autoUpdater.on('update-available', (info) => {
        sendUpdateStatus({
            state: 'available',
            version: info.version,
            message: `Nouvelle version ${info.version} détectée`
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        sendUpdateStatus({ state: 'current', version: info.version, message: 'Launcher à jour' });
    });

    autoUpdater.on('download-progress', (progress) => {
        const percent = Math.round(progress.percent || 0);
        sendUpdateStatus({
            state: 'downloading',
            percent,
            message: `Téléchargement de la mise à jour : ${percent}%`
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendUpdateStatus({
            state: 'downloaded',
            version: info.version,
            message: 'Mise à jour prête. Redémarrage...'
        });
        setTimeout(() => {
            autoUpdater.quitAndInstall(true, true);
        }, 3000);
    });

    autoUpdater.on('error', (error) => {
        console.error('AUTO-UPDATER ERROR:', error?.message || error);
        sendUpdateStatus({
            state: 'error',
            message: `Mise à jour impossible : ${error?.message || 'erreur inconnue'}`
        });
    });
};

// ============================================
// Lifecycle
// ============================================

app.whenReady().then(() => {
    createMainWindow();
    setupAutoUpdater();

    if (app.isPackaged) {
        setTimeout(() => autoUpdater.checkForUpdates(), 3000);
    }
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// Single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}
