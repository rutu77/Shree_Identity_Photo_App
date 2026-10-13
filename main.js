const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

ipcMain.handle('print-photo', async (_event, imageDataUrl) => {
  if (
    typeof imageDataUrl !== 'string'
    || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl)
  ) {
    throw new Error('The print image must be a base64-encoded PNG or JPEG.');
  }

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style id="print-style">
          @page { size: 4in 6in; margin: 0; }
          html, body { width: 4in; height: 6in; margin: 0; padding: 0; }
          img { display: block; width: 4in; height: 6in; }
        </style>
      </head>
      <body><img src="${imageDataUrl}" alt=""></body>
    </html>`;

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const imageDimensions = await printWindow.webContents.executeJavaScript(
      '(async () => { const image = document.querySelector("img"); await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; })()',
    );
    const landscape = imageDimensions.width > imageDimensions.height;
    const pageWidth = landscape ? '6in' : '4in';
    const pageHeight = landscape ? '4in' : '6in';
    await printWindow.webContents.executeJavaScript(
      `document.getElementById("print-style").textContent = ${JSON.stringify(
        `@page { size: ${pageWidth} ${pageHeight}; margin: 0; } html, body { width: ${pageWidth}; height: ${pageHeight}; margin: 0; padding: 0; } img { display: block; width: ${pageWidth}; height: ${pageHeight}; }`,
      )}`,
    );

    await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: landscape
            ? { width: 152400, height: 101600 }
            : { width: 101600, height: 152400 },
          landscape,
        },
        (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            reject(new Error(failureReason || 'The printer rejected the job.'));
          }
        },
      );
    });
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
});
