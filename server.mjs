#!/usr/bin/env node
import { createServer as httpCreate } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { loadSettings, saveSettings, maskSettings } from "./lib/settings.mjs";
import { bus as realBus, log as realLog, recentLog as realRecent } from "./lib/log.mjs";
import { Store } from "./lib/store.mjs";
import { Poller, sourceKey } from "./lib/poller.mjs";
import { Browser } from "./lib/browser.mjs";
import { fetchCanvasAuto } from "./lib/sources/canvas.mjs";
import { fetchPrairieLearn, assessmentsUrl } from "./lib/sources/prairielearn.mjs";
import { fetchCs128, GRADEBOOK_URL } from "./lib/sources/cs128.mjs";
import { fetchSmartPhysics, SMARTPHYSICS_URL } from "./lib/sources/smartphysics.mjs";
import { fetchPrairieTest, PRAIRIETEST_URL } from "./lib/sources/prairietest.mjs";
import { GoogleAuth } from "./lib/google/auth.mjs";
import { TasksApi } from "./lib/google/tasks.mjs";
import { runSync } from "./lib/google/sync.mjs";
import { CalendarApi } from "./lib/google/calendar.mjs";
import { runBlockSync } from "./lib/google/blocks.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.resume(); } });
    req.on("end", () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error("invalid JSON body"), { status: 400 })); } });
    req.on("error", reject);
  });
}

// Only this machine may talk to the server: localhost, 127.0.0.1, or any
// *.localhost name (browsers resolve those to 127.0.0.1 without any setup).
export function isLocalHostname(h) { return h === "localhost" || h === "127.0.0.1" || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.localhost$/i.test(h); }
function isAllowedOrigin(req, port) {
  const host = req.headers.host;
  if (!host) return false;
  const m = host.match(/^(.+?)(?::(\d+))?$/);
  // A missing port means the browser reached us through the port-80 redirect (scripts/port80.sh).
  if (!m || (m[2] !== undefined && Number(m[2]) !== port) || !isLocalHostname(m[1])) return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  let o; try { o = new URL(origin); } catch { return false; }
  return o.protocol === "http:" && (o.port === "" || Number(o.port) === port) && isLocalHostname(o.hostname);
}

// The page a user should land on to log in for a source. Always the source's own
// page: captured SSO redirect URLs (SAML requests) are single-use and reopening
// them makes Shibboleth error out.
export function sourceUrl(cfg, settings = {}) {
  if (cfg.source === "prairielearn") return assessmentsUrl(cfg.instanceId);
  if (cfg.source === "cs128") return GRADEBOOK_URL;
  if (cfg.source === "canvas") return `${settings.canvasBase ?? "https://canvas.illinois.edu"}/courses/${cfg.courseId}`;
  if (cfg.source === "smartphysics") return SMARTPHYSICS_URL(cfg.enrollmentId);
  if (cfg.source === "prairietest") return PRAIRIETEST_URL;
  return null;
}

export function createServer({ store, settingsFile, poller, browser, google, bus, log, recentLog, publicDir }) {
  const settings = () => loadSettings(settingsFile);
  let returnTo = "/";
  const statePayload = () => ({
    assignments: store.state.assignments, changes: store.state.changes, sources: store.state.sources,
    lastPoll: store.state.lastPoll, nextPoll: poller.nextAt, polling: poller.running,
    google: { connected: google.auth.connected, tasklistId: store.state.google.tasklistId, calendarId: store.state.google.calendarId },
    settings: maskSettings(settings()), log: recentLog(),
  });

  const server = httpCreate(async (req, res) => {
    const m = req.method;
    const port = server.address()?.port;
    if (!port || !isAllowedOrigin(req, port)) return json(res, 403, { error: "forbidden origin" });
    let path = req.url;
    try {
      const url = new URL(req.url, "http://localhost");
      path = url.pathname;
      if (m === "GET" && (path === "/" || path === "/index.html")) {
        const html = readFileSync(join(publicDir, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(html);
      }
      if (m === "GET" && path === "/api/state") return json(res, 200, statePayload());
      if (m === "GET" && path === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        send("state", statePayload());
        const onState = () => send("state", statePayload());
        const onLog = (d) => send("log", d);
        bus.on("state", onState); bus.on("log", onLog);
        const ping = setInterval(() => res.write(": ping\n\n"), 15000);
        const cleanup = () => { clearInterval(ping); bus.off("state", onState); bus.off("log", onLog); };
        req.on("close", cleanup); res.on("close", cleanup); res.on("error", cleanup);
        return;
      }
      if (m === "POST" && path === "/api/poll") { poller.run().catch((e) => log(`poll ERROR ${e.message}`)); return json(res, 202, { ok: true }); }
      if (m === "PUT" && path === "/api/settings") {
        const body = await readBody(req);
        try { const saved = saveSettings(settingsFile, body); bus.emit("state", {}); return json(res, 200, maskSettings(saved)); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      const login = path.match(/^\/api\/login\/(.+)$/);
      if (m === "POST" && login) {
        const key = decodeURIComponent(login[1]);
        const cfg = settings().courses.find((c) => sourceKey(c) === key);
        if (!cfg) return json(res, 404, { error: "unknown source" });
        const target = sourceUrl(cfg, settings());
        if (!target) return json(res, 400, { error: "this source has no browser login" });
        browser.openForLogin(target).catch((e) => log(`login window ERROR ${e.message}`));
        return json(res, 202, { ok: true });
      }
      if (m === "GET" && path === "/api/google/connect") {
        // Google only allows 127.0.0.1/localhost as the OAuth return address, so
        // remember where the user actually came from and send them back there.
        returnTo = `http://${req.headers.host}/`;
        try { const { url: u } = google.auth.authUrl({ redirectUri: `http://127.0.0.1:${port}/oauth/callback` }); return json(res, 200, { url: u }); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      if (m === "GET" && path === "/oauth/callback") {
        const err = url.searchParams.get("error");
        if (err) {
          res.writeHead(400, { "content-type": "text/plain", "x-content-type-options": "nosniff" });
          return res.end(`Google sign-in failed: ${err}`);
        }
        try {
          await google.auth.handleCallback({ code: url.searchParams.get("code"), state: url.searchParams.get("state"), redirectUri: `http://127.0.0.1:${port}/oauth/callback` });
        } catch (e) {
          log(`Google sign-in failed: ${e.message}`);
          res.writeHead(400, { "content-type": "text/plain", "x-content-type-options": "nosniff" });
          return res.end(`Google sign-in failed: ${e.message}`);
        }
        log("Google connected: Tasks + Calendar");
        bus.emit("state", {});
        poller.run().catch(() => {});
        res.writeHead(302, { location: returnTo });
        return res.end();
      }
      if (m === "POST" && path === "/api/google/disconnect") { google.auth.disconnect(); bus.emit("state", {}); return json(res, 204); }
      return json(res, 404, { error: "not found" });
    } catch (e) {
      const status = e.status ?? 500;
      if (status === 500) log(`HTTP ERROR ${m} ${path}: ${e.message}`);
      if (res.headersSent) return res.end();
      return json(res, status, { error: e.message });
    }
  });
  return server;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd[0], cmd[1], () => {});
}

export async function main() {
  const settingsFile = join(ROOT, "settings.json");
  const getSettings = () => loadSettings(settingsFile);
  mkdirSync(join(ROOT, "data"), { recursive: true });
  process.on("unhandledRejection", (e) => realLog(`UNHANDLED: ${e?.stack ?? e}`));
  process.on("uncaughtException", (e) => realLog(`UNCAUGHT: ${e?.stack ?? e}`));
  const store = new Store(join(ROOT, "data", "state.json"));
  if (store.loadError) realLog(`STATE FILE PROBLEM: ${store.loadError}`);
  const browser = new Browser({ profileDir: join(ROOT, "profile"), cookieFile: join(ROOT, "data", "cookies.json"), log: realLog });
  const auth = new GoogleAuth({ tokenFile: join(ROOT, "data", "google-token.json"), getSettings });
  const api = new TasksApi({ auth });
  const calendar = new CalendarApi({ auth });
  const fetchers = {
    canvas: (cfg, { settings, browser, now }) => fetchCanvasAuto(cfg, {
      base: settings.canvasBase, token: settings.canvasToken, browser, now,
      feedUrl: settings.canvasFeedUrl, courses: settings.courses.filter((c) => c.source === "canvas"), log: realLog,
    }),
    prairielearn: (cfg, deps) => fetchPrairieLearn(cfg, deps),
    cs128: (cfg, deps) => fetchCs128(cfg, deps),
    smartphysics: (cfg, deps) => fetchSmartPhysics(cfg, deps),
    prairietest: (cfg, deps) => fetchPrairieTest(cfg, deps),
  };
  const poller = new Poller({
    afterRun: () => browser.releaseIdle(),
    store,
    getSettings,
    fetchers,
    deps: { browser },
    // One poll mirrors both sides of Google: the task list (what is left to do)
    // and the evening calendar blocks (when to do it). The tasks summary is what
    // the poller reports as `sources.google`; runBlockSync records its own
    // `sources.googleCalendar`, and runs even when the tasks half failed.
    sync: async (a) => {
      const s = getSettings();
      let taskResult = { created: 0, updated: 0, deleted: 0, errors: [] };
      try {
        if (api) {
          const res = await runSync({ api, store, assignments: a, leadDays: s.taskLeadDays, log: realLog }).catch((e) => {
            realLog(`tasks sync: ${e.message}`);
            return { created: 0, updated: 0, deleted: 0, errors: [e.message] };
          });
          if (res) taskResult = res;
        }
      } finally {
        await runBlockSync({ api: calendar, store, assignments: a, withinHours: s.blockWithinHours, startHour: s.blockStartHour, endHour: s.blockEndHour, log: realLog }).catch((e) => realLog(`calendar blocks ERROR ${e.message}`));
      }
      return taskResult;
    },
    isSyncEnabled: () => auth.connected,
    log: realLog,
    bus: realBus,
  });
  const server = createServer({ store, settingsFile, poller, browser, google: { auth }, bus: realBus, log: realLog, recentLog: realRecent, publicDir: join(ROOT, "public") });
  const port = getSettings().port;
  server.on("error", (e) => { if (e.code === "EADDRINUSE") { console.error(`\nPort ${port} in use. Set a different "port" in settings.json.\n`); process.exit(1); } throw e; });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://${getSettings().appHost}:${port}`;
    realLog(`listening on ${url}`);
    if (!process.env.UCM_NO_OPEN) openBrowser(url);
    poller.start();
  });
  const shutdown = async () => { poller.stop(); await browser.close(); server.close(); process.exit(0); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
