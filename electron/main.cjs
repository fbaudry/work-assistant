const { app, BrowserWindow, ipcMain, Menu, net, powerMonitor, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');
const { Updates } = require('./updates.cjs');
const metadata = require('../package.json');

protocol.registerSchemesAsPrivileged([{ scheme: 'work-assistant', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('Work Assistant');
let window;
let updates;
let updateTimer;
const developmentURL = !app.isPackaged && process.env.WORK_ASSISTANT_DEV_URL;
if (developmentURL && new URL(developmentURL).hostname !== '127.0.0.1') throw new Error('Development server must be local.');

function createWindow() {
  window = new BrowserWindow({
    width: 1180, height: 800, minWidth: 900, minHeight: 640,
    title: 'Work Assistant', titleBarStyle: 'hiddenInset', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = undefined; });
  window.loadURL(developmentURL || 'work-assistant://app/index.html');
}

function handle(channel, action) {
  ipcMain.handle(channel, (event) => {
    const frame = event.senderFrame;
    if (!window || event.sender !== window.webContents || frame !== window.webContents.mainFrame) throw new Error('Untrusted sender');
    const url = new URL(frame.url);
    const trusted = developmentURL
      ? url.origin === new URL(developmentURL).origin
      : url.protocol === 'work-assistant:' && url.hostname === 'app';
    if (!trusted) throw new Error('Untrusted origin');
    return action();
  });
}

function startUpdateChecks() {
  clearInterval(updateTimer);
  updates.check();
  updateTimer = setInterval(() => updates.check(), 30 * 60 * 1000);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!window) createWindow();
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(() => {
    const root = path.join(app.getAppPath(), 'dist');
    protocol.handle('work-assistant', (request) => {
      const url = new URL(request.url);
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (url.hostname !== 'app' || !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    updates = new Updates(autoUpdater, app.isPackaged && metadata.distribution === 'alpha', (state) => {
      if (window && !window.isDestroyed()) window.webContents.send('updates:state-changed', state);
    });
    handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
    handle('updates:state', () => updates.state);
    handle('updates:check', () => updates.check());
    handle('updates:install', () => updates.install());
    handle('app:feedback', () => {
      const url = new URL('https://github.com/fbaudry/work-assistant/issues/new');
      url.searchParams.set('template', 'feedback.yml');
      url.searchParams.set('version', app.getVersion());
      return shell.openExternal(url.toString());
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Work Assistant', submenu: [
        { role: 'about' },
        { label: 'Rechercher une mise à jour…', click: () => updates.check() },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ] },
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
    createWindow();
    startUpdateChecks();
    powerMonitor.on('suspend', () => clearInterval(updateTimer));
    powerMonitor.on('resume', startUpdateChecks);
    app.on('activate', () => { if (!window) createWindow(); });
  });
  app.on('before-quit', () => clearInterval(updateTimer));
  app.on('window-all-closed', () => app.quit());
}
