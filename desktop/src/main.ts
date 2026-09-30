import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'node:url';
import { initServer } from './server';
import { setupTray } from './tray';
import { setupAppMenu } from './menu';

const nativeImport = new Function('mod', 'return import(mod)');

let mainWindow: BrowserWindow | null = null;
let appServices: any = null;
let isQuitting = false;

// Enforce single instance of the application
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  async function createWindow() {
    mainWindow = new BrowserWindow({
      title: 'UIUC Collective Mind',
      width: 1200,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#ffffff',
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      show: true // Force show immediately
    });

    // Handle new windows (e.g., target="_blank" links)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Close behavior -> minimize to tray so background polling continues
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });
  }

  app.whenReady().then(async () => {
    try {
      // 1. Create window instantly so user sees immediate feedback
      await createWindow();

      // 2. Start the embedded server in the background
      appServices = await initServer((state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('state-update', state);
        }
      });

      // 3. Handlers for settings dialog and manual polling
      const openSettings = () => {
        mainWindow?.webContents.executeJavaScript(`if(window.openSettings) window.openSettings();`);
      };
      const triggerPoll = () => {
        if (appServices && appServices.poller) {
          appServices.poller.run().catch(console.error);
        }
      };

      // 4. Setup Native Application Menu and System Tray
      setupAppMenu(mainWindow, openSettings, triggerPoll);
      if (mainWindow && !mainWindow.isDestroyed()) {
        setupTray(mainWindow, triggerPoll, openSettings);
        mainWindow.loadURL(appServices.url).catch(e => {
          console.error("loadURL failed", e);
        });
      }
      
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        } else {
          mainWindow?.show();
        }
      });

    } catch (error: any) {
      console.error("Failed to start server", error);
      app.quit();
    }
  });
}

// IPC handlers bridging the UI and the backend
ipcMain.handle('trigger-poll', async () => {
  if (appServices && appServices.poller) {
    appServices.poller.run().catch(console.error);
    return true;
  }
  return false;
});

ipcMain.handle('open-login', async (event, sourceKey: string) => {
  // Try to find the source config to construct the URL
  const settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    const root = app.isPackaged ? __dirname : path.join(__dirname, '../../');
    const { loadSettings } = await nativeImport(pathToFileURL(path.join(root, 'lib', 'settings.mjs')).href);
    const settings = loadSettings(settingsFile);
    
    const { sourceKey: getSourceKey } = await nativeImport(pathToFileURL(path.join(root, 'lib', 'poller.mjs')).href);
    const cfg = settings.courses.find((c: any) => getSourceKey(c) === sourceKey);
    
    if (cfg) {
      const { sourceUrl } = await nativeImport(pathToFileURL(path.join(root, 'server.mjs')).href);
      const target = sourceUrl(cfg, settings);
      
      if (target && appServices.browser) {
        appServices.browser.openForLogin(target).catch(console.error);
        return { ok: true };
      }
    }
  } catch(e: any) {
    console.error("Login open error:", e.message);
  }
  return { ok: false, error: "unknown source or no login required" };
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Quit when all windows are closed, except on macOS (tray mode)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  isQuitting = true;
  if (appServices && appServices.shutdown) {
    // We delay the quit to let cleanup happen if needed, but not strictly necessary for local files
    event.preventDefault();
    await appServices.shutdown();
    app.exit(0);
  }
});
