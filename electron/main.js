// main.js – Electron entry point
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // Adjust the URL to point to the LAN server where the Next.js app runs.
  const startUrl = process.env.NEXT_APP_URL || 'http://10.3.12.26:3000';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(startUrl);

  // Optional: open DevTools for debugging (remove in production)
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
