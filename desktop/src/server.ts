import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'node:url';
import { ElectronBrowser } from './browser-adapter';

// Helper to get the correct path to the original source files
const isProd = app.isPackaged;
const rootPath = isProd ? __dirname : path.join(__dirname, '../../');

// We use a native import workaround to prevent TypeScript from converting import() into require()
// because require() cannot load .mjs files natively.
const nativeImport = new Function('mod', 'return import(mod)');

export async function initServer(onStateChange: (state: any) => void) {
  const libPath = (mod: string) => pathToFileURL(path.join(rootPath, 'lib', mod)).href;
  
  // Dynamically import everything we need from the original codebase
  const { loadSettings } = await nativeImport(libPath('settings.mjs'));
  const { bus, log, recentLog } = await nativeImport(libPath('log.mjs'));
  const { Store } = await nativeImport(libPath('store.mjs'));
  const { Poller } = await nativeImport(libPath('poller.mjs'));
  const { fetchCanvasAuto } = await nativeImport(libPath('sources/canvas.mjs'));
  const { fetchPrairieLearn } = await nativeImport(libPath('sources/prairielearn.mjs'));
  const { fetchCs128 } = await nativeImport(libPath('sources/cs128.mjs'));
  const { fetchSmartPhysics } = await nativeImport(libPath('sources/smartphysics.mjs'));
  const { fetchPrairieTest } = await nativeImport(libPath('sources/prairietest.mjs'));
  const { GoogleAuth } = await nativeImport(libPath('google/auth.mjs'));
  const { TasksApi } = await nativeImport(libPath('google/tasks.mjs'));
  const { runSync } = await nativeImport(libPath('google/sync.mjs'));
  const { CalendarApi } = await nativeImport(libPath('google/calendar.mjs'));
  const { runBlockSync } = await nativeImport(libPath('google/blocks.mjs'));
  
  // The server module is at the root
  const serverModPath = pathToFileURL(path.join(rootPath, 'server.mjs')).href;
  const { createServer } = await nativeImport(serverModPath);

  // Setup data directory in the user's app data, not in the install dir
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'data');
  const profileDir = path.join(userDataPath, 'profile');
  const settingsFile = path.join(userDataPath, 'settings.json');
  
  fs.mkdirSync(dataDir, { recursive: true });

  const getSettings = () => loadSettings(settingsFile);

  const store = new Store(path.join(dataDir, "state.json"));
  if (store.loadError) log(`STATE FILE PROBLEM: ${store.loadError}`);

  const browser = new ElectronBrowser({ 
    profileDir, 
    cookieFile: path.join(dataDir, "cookies.json"), 
    log 
  });

  const auth = new GoogleAuth({ 
    tokenFile: path.join(dataDir, "google-token.json"), 
    getSettings 
  });
  
  const api = new TasksApi({ auth });
  const calendar = new CalendarApi({ auth });

  const fetchers = {
    canvas: (cfg: any, deps: any) => fetchCanvasAuto(cfg, {
      ...deps, base: deps.settings.canvasBase, token: deps.settings.canvasToken,
      feedUrl: deps.settings.canvasFeedUrl, courses: deps.settings.courses.filter((c: any) => c.source === "canvas"), log
    }),
    prairielearn: (cfg: any, deps: any) => fetchPrairieLearn(cfg, deps),
    cs128: (cfg: any, deps: any) => fetchCs128(cfg, deps),
    smartphysics: (cfg: any, deps: any) => fetchSmartPhysics(cfg, deps),
    prairietest: (cfg: any, deps: any) => fetchPrairieTest(cfg, deps),
  };

  const poller = new Poller({
    afterRun: () => browser.releaseIdle(),
    store,
    getSettings,
    fetchers,
    deps: { browser },
    sync: async (a: any) => {
      const s = getSettings();
      let taskResult = { created: 0, updated: 0, deleted: 0, errors: [] as string[] };
      try {
        if (api) {
          const res = await runSync({ api, store, assignments: a, leadDays: s.taskLeadDays, log }).catch((e: any) => {
            log(`tasks sync: ${e.message}`);
            return { created: 0, updated: 0, deleted: 0, errors: [e.message] };
          });
          if (res) taskResult = res;
        }
      } finally {
        await runBlockSync({ api: calendar, store, assignments: a, withinHours: s.blockWithinHours, startHour: s.blockStartHour, endHour: s.blockEndHour, log }).catch((e: any) => log(`calendar blocks ERROR ${e.message}`));
      }
      return taskResult;
    },
    isSyncEnabled: () => auth.connected,
    log,
    bus
  });

  const publicDir = isProd ? path.join(rootPath, 'public') : path.join(__dirname, '../../public');

  const server = createServer({ 
    store, 
    settingsFile, 
    poller, 
    browser, 
    google: { auth }, 
    bus, 
    log, 
    recentLog, 
    publicDir 
  });

  // Proxy state events to Electron main process
  bus.on("state", (state: any) => {
    onStateChange(state);
  });

  // We use port 0 so the OS assigns a random available port, avoiding EADDRINUSE crashes
  // if the original LaunchAgent or another instance is already running on the default port.
  return new Promise((resolve, reject) => {
    server.on("error", (e: any) => { 
      log(`Server error: ${e.message}`);
      reject(e);
    });
    
    server.listen(0, "127.0.0.1", () => {
      const actualPort = (server.address() as any).port;
      const url = `http://127.0.0.1:${actualPort}`;
      log(`listening on ${url}`);
      poller.start();
      
      resolve({
        url,
        port: actualPort,
        poller,
        browser,
        server,
        shutdown: async () => {
          poller.stop();
          await browser.close();
          server.close();
        }
      });
    });
  });
}
