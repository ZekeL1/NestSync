const { app, BrowserWindow } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow;

function getRendererUrl() {
    const localUiUrl = 'http://localhost:3000';
    const apiBase = String(process.env.NESTSYNC_API_BASE || '').trim().replace(/\/+$/, '');
    if (!apiBase) return localUiUrl;
    return `${localUiUrl}?apiBase=${encodeURIComponent(apiBase)}`;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300, 
        height: 900, 
        minWidth: 375, 
        minHeight: 667,
        title: "NestSync",
        titleBarStyle: 'hiddenInset', 
        trafficLightPosition: { x: 20, y: 20 }, 
        backgroundColor: '#00000000', 
        vibrancy: 'under-window', 
        visualEffectState: 'active',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            scrollBounce: true
        }
    });

    mainWindow.loadURL(getRendererUrl());
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
