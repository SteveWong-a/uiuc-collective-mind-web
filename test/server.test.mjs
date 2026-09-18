import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { request } from "node:http";
import { Store } from "../lib/store.mjs";
import { createServer, sourceUrl } from "../server.mjs";

const dir = mkdtempSync(join(tmpdir(), "ucm-"));
mkdirSync(join(dir, "public"));
writeFileSync(join(dir, "public", "index.html"), "<h1>ui</h1>");
// Controller ruling: pre-seed settings.json so /api/login/prairielearn:2 can
// resolve the course config (loadSettings merges this with DEFAULTS).
writeFileSync(
  join(dir, "settings.json"),
  JSON.stringify({
    courses: [
      { course: "B", source: "prairielearn", instanceId: "2" },
      { course: "A", source: "canvas", courseId: "1" },
    ],
  })
);
const store = new Store(join(dir, "state.json"));
store.state.assignments = [{ id: "canvas:1:1", course: "X", title: "T", dueAt: null, status: "open" }];
store.state.sources["prairielearn:2"] = { state: "needs_login", loginUrl: "https://shib/x" };
const bus = new EventEmitter();
const calls = [];
const poller = { run: async () => { calls.push("run"); return { changes: [] }; }, running: false, nextAt: "2026-09-03T13:00:00.000Z" };
const browser = { openForLogin: async (u) => calls.push("login:" + u) };
const auth = { connected: false, authUrl: ({ redirectUri }) => ({ url: "https://accounts.google.com/x?r=" + encodeURIComponent(redirectUri), state: "s" }), handleCallback: async ({ code, state }) => { if (state !== "s") throw new Error("OAuth state mismatch"); calls.push(`cb:${code}:${state}`); auth.connected = true; }, disconnect: () => { auth.connected = false; } };
const server = createServer({ store, settingsFile: join(dir, "settings.json"), poller, browser, google: { auth }, bus, log: () => {}, recentLog: () => [], publicDir: join(dir, "public") });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());
const j = async (path, opts = {}) => { const res = await fetch(base + path, { headers: { "content-type": "application/json" }, redirect: "manual", ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined }); return { status: res.status, body: res.status === 204 || res.status >= 300 ? null : await res.json(), headers: res.headers }; };

test("index and state", async () => {
  assert.match(await (await fetch(base + "/")).text(), /ui/);
  const { body } = await j("/api/state");
  assert.equal(body.assignments.length, 1);
  assert.equal(body.nextPoll, "2026-09-03T13:00:00.000Z");
  assert.equal(body.google.connected, false);
  assert.equal(body.settings.canvasToken, "");
});

test("rejects foreign origin", async () => {
  const res = await fetch(base + "/api/state", { headers: { origin: "https://evil.example" } });
  assert.equal(res.status, 403);
});

test("accepts *.localhost host names and rejects other hosts", async () => {
  const port = server.address().port;
  // fetch() refuses to override Host, so use a raw request.
  const raw = (headers) => new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/api/state", method: "GET", headers }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    req.on("error", reject); req.end();
  });
  assert.equal(await raw({ host: `course.localhost:${port}`, origin: `http://course.localhost:${port}` }), 200);
  assert.equal(await raw({ host: `course.example.com:${port}` }), 403);
  assert.equal(await raw({ host: `course.localhost:${port + 1}` }), 403);
  assert.equal(await raw({ host: "course.localhost", origin: "http://course.localhost" }), 200, "port-less host via the port-80 redirect");
  assert.equal(await raw({ host: `course.localhost:${port}`, origin: `http://evil.localhost.example:${port}` }), 403);
});

test("poll, settings, login", async () => {
  assert.equal((await j("/api/poll", { method: "POST" })).status, 202);
  assert.ok(calls.includes("run"));
  const s = await j("/api/settings", { method: "PUT", body: { canvasToken: "abcd1234" } });
  assert.equal(s.body.canvasToken, "••••1234");
  assert.equal((await j("/api/settings", { method: "PUT", body: { pollMinutes: 1 } })).status, 400);
  assert.equal((await j("/api/login/prairielearn:2", { method: "POST" })).status, 202);
  assert.ok(calls.includes("login:https://us.prairielearn.com/pl/course_instance/2/assessments"), "opens the source page, never the captured SSO URL");
  assert.equal((await j("/api/login/canvas:1", { method: "POST" })).status, 202);
  assert.ok(calls.some((c) => c === "login:https://canvas.illinois.edu/courses/1"));
  assert.equal((await j("/api/login/nope", { method: "POST" })).status, 404);
});

test("google connect + callback + disconnect", async () => {
  const c = await j("/api/google/connect");
  assert.match(c.body.url, /oauth%2Fcallback/);
  const cb = await fetch(base + "/oauth/callback?code=abc&state=s", { redirect: "manual" });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), `http://127.0.0.1:${server.address().port}/`, "returns to the host the user connected from");
  assert.ok(calls.includes("cb:abc:s"));
  assert.equal((await j("/api/state")).body.google.connected, true);
  assert.equal((await j("/api/google/disconnect", { method: "POST" })).status, 204);
  assert.equal((await j("/api/state")).body.google.connected, false);
});

test("oauth callback with wrong state returns 400", async () => {
  const cb = await fetch(base + "/oauth/callback?code=x&state=wrong", { redirect: "manual" });
  assert.equal(cb.status, 400);
  assert.equal(cb.headers.get("x-content-type-options"), "nosniff");
  assert.match(await cb.text(), /Google sign-in failed: OAuth state mismatch/);
  assert.equal((await j("/api/state")).body.google.connected, false);
});

test("SSE events stream state and log, and clean up listeners on close", { timeout: 5000 }, async () => {
  const before = { state: bus.listenerCount("state"), log: bus.listenerCount("log") };
  const controller = new AbortController();
  const res = await fetch(base + "/api/events", { signal: controller.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const readUntil = async (needle, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (!buf.includes(needle)) {
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${JSON.stringify(needle)}, got: ${buf}`);
      const { value, done } = await reader.read();
      if (done) throw new Error("stream closed early");
      buf += decoder.decode(value, { stream: true });
    }
  };

  await readUntil("event: state");
  const stateFrame = buf.split("\n\n").find((f) => f.startsWith("event: state"));
  const stateData = JSON.parse(stateFrame.slice(stateFrame.indexOf("data: ") + "data: ".length));
  assert.ok(Array.isArray(stateData.assignments));

  buf = "";
  bus.emit("log", { at: "t", msg: "hello" });
  await readUntil("hello");
  const logFrame = buf.split("\n\n").find((f) => f.startsWith("event: log"));
  assert.ok(logFrame && logFrame.includes("hello"));

  controller.abort();
  const deadline = Date.now() + 500;
  while (Date.now() < deadline && (bus.listenerCount("state") !== before.state || bus.listenerCount("log") !== before.log)) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(bus.listenerCount("state"), before.state);
  assert.equal(bus.listenerCount("log"), before.log);
});

test("sourceUrl sends a PrairieTest login to the PrairieTest home page", () => {
  assert.equal(sourceUrl({ course: "CBTF", source: "prairietest" }), "https://us.prairietest.com/pt");
});
