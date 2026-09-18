import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/store.mjs";
import { Poller, sourceKey } from "../lib/poller.mjs";
import { LoginRequiredError } from "../lib/browser.mjs";

const mk = (id, over = {}) => ({ id, source: id.split(":")[0] === "pl" ? "prairielearn" : id.split(":")[0], course: "C", title: id, dueAt: null, openAt: null, url: "", details: "", status: "open", seenAt: "t", ...over });
const settings = { courses: [{ course: "A", source: "canvas", courseId: "1" }, { course: "B", source: "prairielearn", instanceId: "2" }], canvasToken: "t", canvasBase: "https://c" };

function make(fetchers, sync, opts = {}) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), "ucm-")), "s.json"));
  const bus = new EventEmitter();
  const events = [];
  bus.on("state", (e) => events.push(e));
  const poller = new Poller({ store, getSettings: () => settings, fetchers, deps: {}, sync, log: () => {}, bus, ...opts });
  return { store, poller, events };
}

test("sourceKey", () => {
  assert.equal(sourceKey({ source: "canvas", courseId: "74998" }), "canvas:74998");
  assert.equal(sourceKey({ source: "prairielearn", instanceId: "2" }), "prairielearn:2");
  assert.equal(sourceKey({ source: "cs128" }), "cs128");
});

test("merges sources, records changes, persists, emits", async () => {
  const { store, poller, events } = make({ canvas: async () => [mk("canvas:1:9")], prairielearn: async () => [mk("pl:2:5")] });
  const r = await poller.run();
  assert.equal(store.state.assignments.length, 2);
  assert.equal(r.changes.length, 2);
  assert.equal(store.state.sources["canvas:1"].state, "ok");
  assert.ok(store.state.lastPoll);
  assert.equal(events.length, 1);
});

test("failed source keeps previous data and is marked", async () => {
  let fail = false;
  const { store, poller } = make({ canvas: async () => { if (fail) throw new Error("boom"); return [mk("canvas:1:9")]; }, prairielearn: async () => [] });
  await poller.run();
  fail = true;
  const r = await poller.run();
  assert.equal(store.state.assignments.length, 1, "canvas data retained");
  assert.equal(store.state.sources["canvas:1"].state, "error");
  assert.match(store.state.sources["canvas:1"].message, /boom/);
  assert.equal(r.changes.length, 0);
});

test("login required marks needs_login with url", async () => {
  const { store, poller } = make({ canvas: async () => [], prairielearn: async () => { throw new LoginRequiredError("https://shib/x"); } });
  await poller.run();
  assert.equal(store.state.sources["prairielearn:2"].state, "needs_login");
  assert.equal(store.state.sources["prairielearn:2"].loginUrl, "https://shib/x");
});

test("removal reported only after successful fetch", async () => {
  let items = [mk("canvas:1:9"), mk("canvas:1:10")];
  const { store, poller } = make({ canvas: async () => items, prairielearn: async () => [] });
  await poller.run();
  items = [mk("canvas:1:10")];
  const r = await poller.run();
  assert.deepEqual(r.changes.map((c) => `${c.type}:${c.id}`), ["removed:canvas:1:9"]);
  assert.equal(store.state.assignments.length, 1);
});

test("an empty fetch keeps the previous items and is marked as a soft failure", async () => {
  let items = [mk("canvas:1:9"), mk("canvas:1:10")];
  const { store, poller } = make({ canvas: async () => items, prairielearn: async () => [] });
  await poller.run();
  items = [];
  const r = await poller.run();
  assert.deepEqual(r.changes, [], "an empty page is never reported as removals");
  assert.equal(store.state.assignments.length, 2, "previous items are retained");
  assert.equal(store.state.sources["canvas:1"].state, "error");
  assert.equal(store.state.sources["canvas:1"].message, "returned 0 items (kept previous 2)");
  assert.equal(store.state.sources["canvas:1"].count, 2);
});

test("an empty fetch with nothing retained stays ok", async () => {
  const { store, poller } = make({ canvas: async () => [], prairielearn: async () => [] });
  await poller.run();
  assert.equal(store.state.sources["canvas:1"].state, "ok");
  assert.equal(store.state.sources["canvas:1"].count, 0);
});

test("sync runs every poll when enabled, never when disabled", async () => {
  let calls = 0;
  let enabled = true;
  const ok = { created: 1, updated: 0, deleted: 0, errors: [] };
  // The real sync also runs the calendar blocks, which record their own status.
  let holder = null;
  const { poller, store } = make(
    { canvas: async () => [mk("canvas:1:9")], prairielearn: async () => [] },
    async () => { calls++; holder.state.sources.googleCalendar = { state: "ok", message: "blocks: +1 ~0 -0", at: "t" }; return ok; },
    { isSyncEnabled: () => enabled },
  );
  holder = store;
  await poller.run();
  assert.equal(calls, 1);
  await poller.run(); // nothing changed this run
  assert.equal(calls, 2, "sync runs every poll, not only when something changed");
  assert.equal(store.state.sources.google.state, "ok");
  enabled = false;
  await poller.run();
  assert.equal(calls, 2, "sync never runs while disabled");
  assert.ok(!("google" in store.state.sources), "stale google entry is removed while sync is disabled");
  assert.ok(!("googleCalendar" in store.state.sources), "and so is the calendar-blocks entry");
});

test("sync error is captured into sources.google and retried next run", async () => {
  let calls = 0;
  const { poller, store } = make(
    { canvas: async () => [mk("canvas:1:9")], prairielearn: async () => [] },
    async () => { calls++; if (calls === 1) throw new Error("gfail"); return { created: 0, updated: 0, deleted: 0, errors: [] }; },
  );
  await poller.run();
  assert.equal(calls, 1);
  assert.equal(store.state.sources.google.state, "error");
  assert.match(store.state.sources.google.message, /gfail/);
  await poller.run();
  assert.equal(calls, 2, "a failed sync is retried on the next poll");
  assert.equal(store.state.sources.google.state, "ok");
});

test("run is not re-entrant", async () => {
  let n = 0;
  const { poller } = make({ canvas: async () => { n++; await new Promise((r) => setTimeout(r, 20)); return []; }, prairielearn: async () => [] });
  await Promise.all([poller.run(), poller.run()]);
  assert.equal(n, 1);
});

test("dedupes fetched items by id, keeping the last occurrence", async () => {
  const { store, poller } = make({
    canvas: async () => [mk("canvas:1:9", { title: "first" }), mk("canvas:1:9", { title: "second" })],
    prairielearn: async () => [],
  });
  const r = await poller.run();
  assert.equal(store.state.assignments.length, 1);
  assert.equal(store.state.assignments[0].title, "second");
  assert.deepEqual(r.changes.map((c) => c.type), ["added"]);
});

test("assignment dropped when its course is removed from settings", async () => {
  let courses = [
    { course: "A", source: "canvas", courseId: "1" },
    { course: "B", source: "prairielearn", instanceId: "2" },
  ];
  const store = new Store(join(mkdtempSync(join(tmpdir(), "ucm-")), "s.json"));
  const bus = new EventEmitter();
  const poller = new Poller({
    store,
    getSettings: () => ({ courses, canvasToken: "t", canvasBase: "https://c" }),
    fetchers: { canvas: async () => [mk("canvas:1:9")], prairielearn: async () => [mk("pl:2:5")] },
    deps: {},
    log: () => {},
    bus,
  });
  await poller.run();
  assert.equal(store.state.assignments.length, 2);

  courses = [{ course: "A", source: "canvas", courseId: "1" }]; // course B removed from settings
  const r = await poller.run();
  assert.equal(store.state.assignments.length, 1);
  assert.equal(store.state.assignments[0].id, "canvas:1:9");
  assert.deepEqual(r.changes.map((c) => `${c.type}:${c.id}`), ["removed:pl:2:5"]);
});

test("start/stop schedule polls and track nextAt", async (t) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => mock.timers.reset());
  let calls = 0;
  const store = new Store(join(mkdtempSync(join(tmpdir(), "ucm-")), "s.json"));
  const bus = new EventEmitter();
  const clock = new Date("2026-01-01T00:00:00.000Z");
  const poller = new Poller({
    store,
    getSettings: () => ({ courses: [{ course: "A", source: "canvas", courseId: "1" }], pollMinutes: 5 }),
    fetchers: { canvas: async () => { calls++; return []; }, prairielearn: async () => [] },
    deps: {},
    log: () => {},
    bus,
    now: () => clock,
  });

  poller.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 1);
  assert.equal(poller.nextAt, new Date(clock.getTime() + 5 * 60_000).toISOString());

  mock.timers.tick(5 * 60_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2);

  poller.stop();
  assert.equal(poller.nextAt, null);

  mock.timers.tick(5 * 60_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2, "no further runs after stop");
});

test("a fetcher's warning is appended to the source message and every fetcher shares one now", async () => {
  const nows = [];
  const withWarning = () => Object.assign([mk("canvas:1:9")], { warning: "status via login unavailable" });
  const { store, poller } = make({
    canvas: async (cfg, deps) => { nows.push(deps.now); return withWarning(); },
    prairielearn: async (cfg, deps) => { nows.push(deps.now); return [mk("pl:2:5")]; },
  });
  await poller.run();
  assert.equal(store.state.sources["canvas:1"].state, "ok");
  assert.equal(store.state.sources["canvas:1"].message, "1 items (status via login unavailable)");
  assert.equal(store.state.sources["prairielearn:2"].message, "1 items");
  assert.equal(nows.length, 2);
  assert.equal(nows[0].getTime(), nows[1].getTime(), "one instant per run, so a per-run cache key works");
});

test("a soft 0-item failure still carries the fetcher's warning", async () => {
  let items = [mk("canvas:1:9")];
  const { store, poller } = make({ canvas: async () => items, prairielearn: async () => [] });
  await poller.run();
  items = Object.assign([], { warning: "status via login unavailable" });
  await poller.run();
  assert.equal(store.state.sources["canvas:1"].state, "error");
  assert.equal(store.state.sources["canvas:1"].message, "returned 0 items (kept previous 1) (status via login unavailable)");
});

test("afterRun hook runs after every poll and its errors are logged, not thrown", async () => {
  let runs = 0; const logs = [];
  const store = new Store(join(mkdtempSync(join(tmpdir(), "ucm-")), "s.json"));
  const poller = new Poller({ store, getSettings: () => settings, fetchers: { canvas: async () => [], prairielearn: async () => [] }, deps: {}, log: (m) => logs.push(m), bus: new EventEmitter(), afterRun: async () => { runs++; if (runs === 2) throw new Error("release failed"); } });
  await poller.run(); await poller.run();
  assert.equal(runs, 2);
  assert.ok(logs.some((m) => /afterRun ERROR release failed/.test(m)));
});

test("status never regresses when a source loses sight of submissions", async () => {
  let status = "graded";
  const { store, poller } = make({ canvas: async () => [mk("canvas:1:9", { status })], prairielearn: async () => [] });
  await poller.run();
  status = "closed";
  const r = await poller.run();
  assert.equal(store.state.assignments[0].status, "graded");
  assert.deepEqual(r.changes, []);
  status = "graded";
  await poller.run();
  assert.equal(store.state.assignments[0].status, "graded");
});

test("a kept status keeps the grade it was earned with", async () => {
  let item = mk("canvas:1:9", { status: "graded", grade: "9/10" });
  const { store, poller } = make({ canvas: async () => [item], prairielearn: async () => [] });
  await poller.run();
  assert.equal(store.state.assignments[0].grade, "9/10");

  // The Canvas feed without a session: same assignment, no status, no grade.
  item = mk("canvas:1:9", { status: "open", grade: null });
  const r = await poller.run();
  assert.equal(store.state.assignments[0].status, "graded");
  assert.equal(store.state.assignments[0].grade, "9/10", "the grade survives with the status");
  assert.deepEqual(r.changes, []);

  // A fresh grade from the source always wins over the remembered one.
  item = mk("canvas:1:9", { status: "submitted", grade: "10/10" });
  await poller.run();
  assert.equal(store.state.assignments[0].status, "graded");
  assert.equal(store.state.assignments[0].grade, "10/10");
});

test("prairietest: one id-less entry, an empty result it vouches for is not a soft failure, and reservable exams ride on the source", async () => {
  assert.equal(sourceKey({ source: "prairietest" }), "prairietest");
  const ptSettings = { courses: [{ course: "CBTF", source: "prairietest" }] };
  const store = new Store(join(mkdtempSync(join(tmpdir(), "ucm-")), "s.json"));
  const bus = new EventEmitter();
  let items = Object.assign([mk("prairietest:reservation:1", { source: "prairietest" })], { trustedEmpty: true, reservable: [{ id: "9", course: "MATH 257", title: "Midterm 2" }] });
  const poller = new Poller({ store, getSettings: () => ptSettings, fetchers: { prairietest: async () => items }, deps: {}, log: () => {}, bus });
  await poller.run();
  assert.equal(store.state.assignments.length, 1);
  assert.deepEqual(store.state.sources.prairietest.reservable, [{ id: "9", course: "MATH 257", title: "Midterm 2" }]);
  items = Object.assign([], { trustedEmpty: true, reservable: [] });
  const r = await poller.run();
  assert.equal(store.state.sources.prairietest.state, "ok", "a trusted empty list is a real result");
  assert.equal(store.state.assignments.length, 0, "the taken exam is gone, not retained");
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].type, "removed");
  assert.deepEqual(store.state.sources.prairietest.reservable, []);
});
