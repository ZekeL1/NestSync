// client/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

// 🌟 终极修复黑屏：彻底禁用硬件加速 (Disable Hardware Acceleration)
// 这能解决“有声音无画面”的渲染冲突问题。
app.disableHardwareAcceleration(); 

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, height: 800, minWidth: 900, minHeight: 600,
        title: "NestSync", autoHideMenuBar: true, show: false, backgroundColor: '#f8f9fa',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // 访问我们 Express 启动的本地网站
    mainWindow.loadURL('http://localhost:3000');

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });