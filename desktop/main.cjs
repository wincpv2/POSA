const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');

const appUrl = 'https://posa-sandy.vercel.app';
const appHost = new URL(appUrl).hostname;
const supabaseHost = 'ydqmxjyqwvcbihrtdrnw.supabase.co';

function isAppOrSignInUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname === appHost ||
      url.hostname === supabaseHost ||
      url.hostname === 'accounts.google.com' ||
      url.hostname.endsWith('.google.com')
    );
  } catch {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 1100,
    minWidth: 1100,
    minHeight: 820,
    backgroundColor: '#04065E',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppOrSignInUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppOrSignInUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  void window.loadURL(appUrl);
}

ipcMain.handle('posa:print-html', async (event, html) => {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isAppOrSignInUrl(senderUrl) || new URL(senderUrl).hostname !== appHost) {
    throw new Error('Printing is only available from POSA.');
  }
  if (typeof html !== 'string' || html.length > 8_000_000) {
    throw new Error('The report content is invalid or too large to print.');
  }

  const preview = new BrowserWindow({
    width: 1000,
    height: 1200,
    minWidth: 800,
    minHeight: 700,
    show: false,
    parent: BrowserWindow.fromWebContents(event.sender) || undefined,
    autoHideMenuBar: true,
    title: 'POSA Report Print Preview',
    backgroundColor: '#FFFFFF',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  try {
    await preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    preview.show();
    return await new Promise((resolve, reject) => {
      preview.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        if (success) resolve(true);
        else if (reason?.toLowerCase().includes('cancel')) resolve(false);
        else reject(new Error(reason || 'Could not open the print dialog.'));
      });
    });
  } finally {
    if (!preview.isDestroyed()) preview.close();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
