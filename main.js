const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const angularHtmlPath = path.join(
    __dirname,
    'frontend',
    'dist',
    'frontend',
    'browser',
    'index.html',
  );

  mainWindow.loadFile(angularHtmlPath).catch((error) => {
    console.error(`Could not load the Angular build at ${angularHtmlPath}:`, error);
    dialog.showErrorBox(
      'Photo Studio could not open',
      "Build the Angular app first by running 'npm run build:angular'.",
    );
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
