const { app, BrowserWindow, dialog, Menu, protocol, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { config } = require('../package.json');

const gameURL = 'journey://game/';
protocol.registerSchemesAsPrivileged([
  { scheme: 'journey', privileges: { standard: true, secure: true } }
]);

const profile = join(app.getPath('appData'), app.isPackaged ? 'LittleTownChronicles' : 'LittleTownChroniclesDev');
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);

let mainWindow;
let updateTimer;

function serveGame() {
  const original = readFileSync(join(app.getAppPath(), config.gameSource), 'utf8');
  // The HTML parser normalizes line endings before checking the inline script hash.
  const html = original.replace(/\r\n?/g, '\n');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error('Expected a single inline game script');
  const hash = createHash('sha256').update(scripts[0][1]).digest('base64');
  const game = html.replace('<script>', '<script src="/save-transfer.js"></script>\n<script>');
  const saveTransfer = readFileSync(join(__dirname, 'save-transfer.js'), 'utf8');
  const policy = [
    "default-src 'none'",
    `script-src 'self' 'sha256-${hash}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
  protocol.handle('journey', request => {
    if (request.url === gameURL) {
      return new Response(game, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': policy }
      });
    }
    if (request.url === new URL('save-transfer.js', gameURL).href) {
      return new Response(saveTransfer, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
    }
    return new Response(null, { status: 404 });
  });
}

function createGameWindow() {
  mainWindow = new BrowserWindow({
    title: '小さな町の年代記',
    width: 1280,
    height: 900,
    minWidth: 420,
    minHeight: 460,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== gameURL) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow.loadURL(gameURL);
}

function setupUpdates() {
  const hasFeed = process.platform === 'win32' && app.isPackaged &&
    existsSync(join(process.resourcesPath, 'app-update.yml'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  let ready = false;
  let busy = false;
  let status = hasFeed ? '次回の更新確認を待っています。' : 'このビルドには配布先が設定されていません。';
  autoUpdater.on('update-available', ({ version }) => { status = `新版 ${version} をダウンロードしています。`; });
  autoUpdater.on('update-not-available', () => { status = '最新版を使用しています。'; });
  autoUpdater.on('update-downloaded', ({ version }) => {
    ready = true;
    status = `新版 ${version} の準備ができました。ゲームを閉じると更新します。`;
  });
  autoUpdater.on('error', error => {
    console.error('Update failed:', error.message);
    if (!ready) status = '更新を確認または取得できませんでした。次回の確認時に再試行します。';
  });

  async function check() {
    if (!hasFeed || ready || busy) return;
    busy = true;
    status = '更新を確認しています。';
    try {
      const result = await autoUpdater.checkForUpdates();
      await result?.downloadPromise;
    } catch (error) {
      // Updater errors also fire the error event. Keep a useful status if an
      // error occurs before the library can emit the event.
      if (!ready) status = '更新を確認または取得できませんでした。';
    } finally {
      busy = false;
    }
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'ゲーム', submenu: [{ label: '終了', role: 'quit' }] },
    { label: '表示', submenu: [{ label: '全画面切り替え', role: 'togglefullscreen' }] },
    { label: '更新', submenu: [{
      label: '更新を確認',
      click: async () => {
        await check();
        if (!mainWindow) return;
        await dialog.showMessageBox(mainWindow, {
          title: 'アプリの更新',
          message: status,
          detail: `現在のバージョン ${app.getVersion()}`
        });
      }
    }] }
  ]));
  if (hasFeed) {
    setTimeout(() => void check(), 2000).unref();
    updateTimer = setInterval(() => void check(), 4 * 60 * 60 * 1000);
    updateTimer.unref();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => clearInterval(updateTimer));
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    serveGame();
    await createGameWindow();
    setupUpdates();
  }).catch(error => {
    console.error(error);
    dialog.showErrorBox('小さな町の年代記', 'ゲームを起動できませんでした。');
    app.quit();
  });
}
