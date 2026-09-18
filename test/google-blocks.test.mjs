import { test } from "node:test";
import assert from "node:assert/strict";
import { planBlocks, toEvent, diffBlocks, runBlockSync, CALENDAR_TITLE, RECONSENT, REMINDERS } from "../lib/google/blocks.mjs";

// Sep 2026 is CDT (UTC-5): 8 PM Chicago on Sep 12 is 2026-09-13T01:00:00.000Z.
const a = (over = {}) => ({ id: "pl:1:2", source: "prairielearn", course: "CS 173", title: "HW1 Proofs", dueAt: "2026-09-13T04:59:00.000Z", openAt: null, url: "https://pl/x", details: "d", status: "open", seenAt: "t", ...over });
const EVENING = { date: "2026-09-12", start: "2026-09-13T01:00:00.000Z", end: "2026-09-13T04:00:00.000Z" };
const plan = (items, over = {}) => planBlocks(items, { now: new Date("2026-09-12T14:00:00Z"), ...over });
const shape = (b) => ({ date: b.date, start: b.start, end: b.end, ids: b.assignments.map((x) => x.id) });

test("an assignment due tonight gets tonight's 8-11 PM block", () => {
  const blocks = plan([a()]);
  assert.equal(blocks.length, 1);
  assert.deepEqual(shape(blocks[0]), { ...EVENING, ids: ["pl:1:2"] });
});

test("work due tomorrow morning gets tonight's block: the last evening before the deadline", () => {
  // due Sep 13, 10:00 AM Chicago — 8 PM on Sep 13 is after it, so Sep 12 is the last evening that precedes it.
  const blocks = plan([a({ dueAt: "2026-09-13T15:00:00.000Z" })], { now: new Date("2026-09-12T16:00:00Z") });
  assert.deepEqual(blocks.map(shape), [{ ...EVENING, ids: ["pl:1:2"] }]);
});

test("outside the window nothing is blocked yet", () => {
  assert.deepEqual(plan([a()], { now: new Date("2026-09-11T12:00:00Z") }), [], "41 h out: too early");
  assert.equal(plan([a()], { now: new Date("2026-09-12T05:30:00Z") }).length, 1, "just inside 24 h");
  assert.equal(plan([a()], { now: new Date("2026-09-11T12:00:00Z"), withinHours: 72 }).length, 1, "a wider window reaches further out");
});

test("an evening that is already over is skipped, an evening still running is not", () => {
  assert.equal(plan([a()], { now: new Date("2026-09-13T03:59:00Z") }).length, 1, "10:59 PM: the block still has a minute left");
  assert.deepEqual(plan([a()], { now: new Date("2026-09-13T04:00:00Z") }), [], "11:00 PM sharp: over");
  assert.deepEqual(plan([a()], { now: new Date("2026-09-13T04:30:00Z") }), [], "11:30 PM, due 11:59 PM: no evening left");
});

test("overdue work that can still be turned in keeps getting tonight's block until it is done", () => {
  // due Sep 12, 11:59 PM; now Sep 14, 7:00 AM Chicago: the block is Sep 14's evening, not one in the past.
  assert.deepEqual(plan([a()], { now: new Date("2026-09-14T12:00:00Z") }).map(shape), [{ date: "2026-09-14", start: "2026-09-15T01:00:00.000Z", end: "2026-09-15T04:00:00.000Z", ids: ["pl:1:2"] }]);
  // Sep 14, 11:30 PM: tonight is over, so tomorrow evening.
  assert.deepEqual(plan([a()], { now: new Date("2026-09-15T04:30:00Z") }).map(shape), [{ date: "2026-09-15", start: "2026-09-16T01:00:00.000Z", end: "2026-09-16T04:00:00.000Z", ids: ["pl:1:2"] }]);
  // Sep 14, 10:00 PM: tonight still has an hour left.
  assert.equal(plan([a()], { now: new Date("2026-09-15T03:00:00Z") })[0].date, "2026-09-14");
  // Overdue and tonight's work share one evening, overdue first.
  const blocks = plan([a({ id: "tonight", dueAt: "2026-09-15T04:59:00.000Z" }), a({ id: "late" })], { now: new Date("2026-09-14T12:00:00Z") });
  assert.deepEqual(blocks.map(shape), [{ date: "2026-09-14", start: "2026-09-15T01:00:00.000Z", end: "2026-09-15T04:00:00.000Z", ids: ["late", "tonight"] }]);
  assert.deepEqual(plan([a({ status: "closed" })], { now: new Date("2026-09-14T12:00:00Z") }), [], "closed: too late to turn in, no block");
});

test("only outstanding, dated work is blocked", () => {
  for (const status of ["submitted", "graded", "closed"]) assert.deepEqual(plan([a({ status })]), [], `${status} needs no block`);
  for (const status of ["open", "unknown"]) assert.equal(plan([a({ status })]).length, 1, `${status} gets one`);
  assert.deepEqual(plan([a({ dueAt: null })]), [], "no deadline, no block");
});

test("everything landing on one evening shares a single block, deadline first", () => {
  const blocks = plan([
    a({ id: "late", dueAt: "2026-09-13T04:59:00.000Z" }),
    a({ id: "early", dueAt: "2026-09-13T02:00:00.000Z" }),
    a({ id: "tomorrow", dueAt: "2026-09-14T02:00:00.000Z" }),
  ], { now: new Date("2026-09-13T02:30:00Z") });
  assert.deepEqual(blocks.map(shape), [
    { ...EVENING, ids: ["early", "late"] },
    { date: "2026-09-13", start: "2026-09-14T01:00:00.000Z", end: "2026-09-14T04:00:00.000Z", ids: ["tomorrow"] },
  ]);
});

test("the block hours are configurable", () => {
  const [b] = plan([a()], { startHour: 18, endHour: 21 });
  assert.deepEqual([b.start, b.end], ["2026-09-12T23:00:00.000Z", "2026-09-13T02:00:00.000Z"]);
});

test("toEvent names one assignment and counts several", () => {
  const [one] = plan([a()]);
  const e = toEvent(one);
  assert.equal(e.summary, "Homework block: HW1 Proofs · CS 173");
  assert.equal(e.description, "• HW1 Proofs · CS 173 · due Sep 12, 11:59 PM\n  https://pl/x");
  assert.deepEqual(e.start, { dateTime: "2026-09-13T01:00:00.000Z", timeZone: "America/Chicago" });
  assert.deepEqual(e.end, { dateTime: "2026-09-13T04:00:00.000Z", timeZone: "America/Chicago" });
  assert.deepEqual(e.extendedProperties, { private: { uiucBlock: "2026-09-12" } });

  const [many] = plan([a(), a({ id: "pl:1:3", title: "MP3", course: "CS 128", url: "" })]);
  const em = toEvent(many);
  assert.equal(em.summary, "Homework block: 2 due");
  assert.equal(em.description, "• HW1 Proofs · CS 173 · due Sep 12, 11:59 PM\n  https://pl/x\n• MP3 · CS 128 · due Sep 12, 11:59 PM", "an assignment with no link contributes no link line");
});

test("diffBlocks creates, patches and removes, and leaves an unchanged evening alone", () => {
  const blocks = plan([a(), a({ id: "pl:1:3", title: "MP3", dueAt: "2026-09-14T02:00:00.000Z" })], { now: new Date("2026-09-13T02:30:00Z") });
  const wanted = toEvent(blocks[0]);
  const untouched = { id: "SAME", ...wanted, start: { dateTime: "2026-09-12T20:00:00-05:00" }, end: { dateTime: "2026-09-12T23:00:00-05:00" } };
  assert.deepEqual(diffBlocks([blocks[0]], [untouched]), { create: [], patch: [], remove: [] }, "same instant written with an offset is not a change");

  const stale = { id: "OLD", summary: "Homework block: 9 due", description: "gone", start: { dateTime: "2026-09-10T20:00:00-05:00" }, end: { dateTime: "2026-09-10T23:00:00-05:00" }, extendedProperties: { private: { uiucBlock: "2026-09-10" } } };
  const drifted = { ...untouched, summary: "Homework block: 5 due", start: { dateTime: "2026-09-12T19:00:00-05:00" } };
  const d = diffBlocks(blocks, [stale, drifted]);
  assert.deepEqual(d.create.map((e) => e.extendedProperties.private.uiucBlock), ["2026-09-13"]);
  assert.deepEqual(d.remove, [{ id: "OLD" }], "an evening with nothing left to do loses its block");
  assert.deepEqual(d.patch, [{ id: "SAME", patch: { summary: wanted.summary, start: wanted.start } }]);
});

test("a duplicate block for the same evening is deleted", () => {
  const [block] = plan([a()]);
  const first = { id: "E1", ...toEvent(block) };
  const dupe = { id: "E2", ...toEvent(block) };
  assert.deepEqual(diffBlocks([block], [first, dupe]), { create: [], patch: [], remove: [{ id: "E2" }] });
});

function fakeApi(over = {}) {
  const calls = [];
  return {
    calls,
    ensureCalendar: async (title, cached) => { calls.push(["ensure", title, cached]); return "C1"; },
    listEvents: async (id, window) => { calls.push(["list", id, window]); return []; },
    insertEvent: async (id, e) => { calls.push(["insert", e.summary]); return { id: "NEW" }; },
    patchEvent: async (id, eid, p) => { calls.push(["patch", eid]); return {}; },
    deleteEvent: async (id, eid) => { calls.push(["delete", eid]); return null; },
    ...over,
  };
}
const fakeStore = () => ({ state: { google: { tasklistId: null, calendarId: null, mapping: {} }, sources: {} }, saved: 0, save() { this.saved++; } });

test("runBlockSync creates the missing block, caches the calendar and reports its counts", async () => {
  const api = fakeApi();
  const store = fakeStore();
  const now = new Date("2026-09-12T14:00:00Z");
  const r = await runBlockSync({ api, store, assignments: [a()], now });
  assert.deepEqual([r.created, r.updated, r.deleted, r.errors], [1, 0, 0, []]);
  assert.equal(store.state.google.calendarId, "C1");
  assert.deepEqual(api.calls[0], ["ensure", CALENDAR_TITLE, null]);
  assert.deepEqual(api.calls[1][2], { timeMin: "2026-09-10T14:00:00.000Z", timeMax: "2026-09-26T14:00:00.000Z" }, "two days back, two weeks ahead");
  assert.deepEqual(store.state.sources.googleCalendar, { state: "ok", message: "blocks: +1 ~0 -0", at: now.toISOString() });
  assert.ok(store.saved >= 1);
});

test("runBlockSync captures a per-item failure without losing the rest", async () => {
  const [block] = plan([a()]);
  const api = fakeApi({
    listEvents: async () => [{ id: "OLD", summary: "x", description: "", start: {}, end: {}, extendedProperties: { private: { uiucBlock: "2026-09-01" } } }, { id: "E1", ...toEvent(block), summary: "drifted" }],
    deleteEvent: async () => { throw new Error("gone"); },
  });
  const store = fakeStore();
  const r = await runBlockSync({ api, store, assignments: [a()], now: new Date("2026-09-12T14:00:00Z") });
  assert.deepEqual([r.created, r.updated, r.deleted], [0, 1, 0]);
  assert.equal(r.errors.length, 1);
  assert.equal(store.state.sources.googleCalendar.state, "error");
  assert.match(store.state.sources.googleCalendar.message, /blocks: \+0 ~1 -0/);
});

test("a 403 means the calendar scope was never consented to, and says so", async () => {
  const api = fakeApi({ ensureCalendar: async () => { throw Object.assign(new Error("Request had insufficient authentication scopes."), { status: 403 }); } });
  const store = fakeStore();
  const logged = [];
  const r = await runBlockSync({ api, store, assignments: [a()], now: new Date("2026-09-12T14:00:00Z"), log: (m) => logged.push(m) });
  assert.deepEqual(r.errors, [RECONSENT]);
  assert.equal(store.state.sources.googleCalendar.state, "error");
  assert.equal(store.state.sources.googleCalendar.message, RECONSENT);
  assert.match(RECONSENT, /Disconnect, then Connect Google again/);
  assert.ok(logged.some((m) => m.includes("re-consent")), "and it is written to the log");
});

test("block events carry explicit reminders and existing events without them get patched", () => {
  const [block] = plan([a()]);
  const ev = toEvent(block);
  assert.deepEqual(ev.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 30 }, { method: "popup", minutes: 0 }] });
  const existing = { id: "E1", summary: ev.summary, description: ev.description, start: ev.start, end: ev.end, extendedProperties: ev.extendedProperties };
  const d = diffBlocks([block], [existing]);
  assert.deepEqual(d.patch.map((p) => p.patch), [{ reminders: REMINDERS }], "only the reminders are missing");
  const d2 = diffBlocks([block], [{ ...existing, reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }, { method: "popup", minutes: 30 }] } }]);
  assert.deepEqual(d2.patch, [], "same reminders in another order is not a change");
});
