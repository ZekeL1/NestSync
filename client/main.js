const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // 创建浏览器窗口 (Create the browser window)
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "NestSync",
    // 隐藏默认菜单栏，使界面更干净
    autoHideMenuBar: true, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // 方便演示，生产环境建议开启 (Enable for production security)
    }
  });

  // 加载 index.html
  mainWindow.loadFile('index.html');
}

// App 准备就绪时调用 (Called when Electron has finished initialization)
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});