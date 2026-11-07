#!/usr/bin/env node
import { existsSync, statSync, watchFile, unwatchFile } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../lib/store.mjs";
import { loadSettings } from "../lib/settings.mjs";
import { MuseMcpServer, resolveActiveDataDir } from "../lib/muse.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function createStdioMcpRunner({
  dataDir = resolveActiveDataDir(ROOT),
  settingsFile = process.env.UCM_SETTINGS_FILE || null,
  serverUrl = process.env.UCM_SERVER_URL || null,
  apiToken = process.env.UCM_API_TOKEN || null,
  input = process.stdin,
  output = process.stdout,
  fetchImpl = fetch,
} = {}) {
  const stateFile = join(dataDir, "state.json");
  const resolvedSettingsFile =
    settingsFile ||
    (existsSync(join(dirname(dataDir), "settings.json"))
      ? join(dirname(dataDir), "settings.json")
      : join(ROOT, "settings.json"));

  let store = new Store(stateFile);
  let lastMtime = existsSync(stateFile) ? statSync(stateFile).mtimeMs : 0;

  const reloadIfChanged = () => {
    if (!existsSync(stateFile)) return false;
    try {
      const mtime = statSync(stateFile).mtimeMs;
      if (mtime > lastMtime) {
        lastMtime = mtime;
        store = new Store(stateFile);
        mcp.store = store;
        return true;
      }
    } catch {}
    return false;
  };

  const pollerProxy = {
    run: async () => {
      if (serverUrl && apiToken) {
        try {
          await fetchImpl(`${serverUrl}/api/poll`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiToken}` },
          });
        } catch {}
      }
      reloadIfChanged();
      return { changes: store.state.changes };
    },
  };

  const mcp = new MuseMcpServer({
    store,
    getSettings: () => {
      reloadIfChanged();
      return loadSettings(resolvedSettingsFile);
    },
    poller: pollerProxy,
    log: (msg) => process.stderr.write(`[muse-mcp] ${msg}\n`),
  });

  const detachStdio = mcp.attachStdio(input, output);

  watchFile(stateFile, { interval: 2000 }, () => {
    if (reloadIfChanged()) {
      mcp.notifyUpdate();
    }
  });

  const close = () => {
    unwatchFile(stateFile);
    detachStdio();
  };

  return { mcp, close, reloadIfChanged };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const runner = createStdioMcpRunner();
  process.on("SIGINT", () => {
    runner.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    runner.close();
    process.exit(0);
  });
}
