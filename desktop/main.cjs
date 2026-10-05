const { app, BrowserWindow, shell } = require('electron');

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
