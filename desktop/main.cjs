const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');

const appUrl = 'https://posa-wincpv2s-projects.vercel.app';
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

const printPreviewContents = new WeakSet();

ipcMain.handle('posa:print-preview', (event) => {
  if (!printPreviewContents.has(event.sender)) throw new Error('This window cannot print POSA reports.');
  return new Promise((resolve, reject) => {
    event.sender.print({ silent: false, printBackground: true, pageSize: 'A4' }, (success, reason) => {
      if (success) resolve(true);
      else if (reason?.toLowerCase().includes('cancel')) resolve(false);
      else reject(new Error(reason || 'Could not open the print dialog.'));
    });
  });
});

ipcMain.handle('posa:preview-report', async (event, html) => {
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });

  try {
    await preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printPreviewContents.add(preview.webContents);
    await preview.webContents.executeJavaScript(`(() => {
      const style = document.createElement('style');
      style.textContent = '@media screen { body { max-width: 210mm; min-height: 100vh; margin: 0 auto; padding: 18mm 16mm; background: #fff; box-shadow: 0 0 28px rgba(0,0,0,.35); } } @media print { #posa-preview-toolbar { display: none !important; } }';
      document.head.append(style);
      const toolbar = document.createElement('div');
      toolbar.id = 'posa-preview-toolbar';
      Object.assign(toolbar.style, { position: 'fixed', zIndex: '99999', top: '12px', right: '12px', display: 'flex', gap: '8px', padding: '10px', borderRadius: '16px', background: '#02033A', boxShadow: '0 8px 24px rgba(0,0,0,.28)' });
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Print / Save PDF';
      Object.assign(button.style, { minHeight: '38px', padding: '0 16px', border: '0', borderRadius: '20px', background: '#90E0EF', color: '#02033A', font: '600 14px Nunito, Arial, sans-serif', cursor: 'pointer' });
      button.addEventListener('click', () => window.posaPreview.print());
      toolbar.append(button);
      document.body.prepend(toolbar);
    })()`);
    preview.show();
    preview.focus();
    return true;
  } catch (error) {
    if (!preview.isDestroyed()) preview.close();
    throw error;
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
