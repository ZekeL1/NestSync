const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 900,   // 响应 AC：最小宽度 900
    minHeight: 600,  // 响应 AC：最小高度 600
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);