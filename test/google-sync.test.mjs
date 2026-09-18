import { test } from "node:test";
import assert from "node:assert/strict";
import { toTask, taskDate, diffTasks, runSync, LIST_TITLE, assignmentIdOf } from "../lib/google/sync.mjs";

const a = (over = {}) => ({ id: "pl:1:2", source: "prairielearn", course: "CS 173", title: "HW1 Proofs", dueAt: "2026-09-13T04:59:00.000Z", openAt: null, url: "https://pl/x", details: "100% until 23:59, Sep 12", status: "open", seenAt: "t", ...over });

const now = new Date("2026-09-03T12:00:00Z");

test("taskDate rolls from leadDays before the deadline up to the deadline", () => {
  const due = "2026-09-13T04:59:00.000Z"; // Sep 12, 11:59 PM Chicago
  assert.equal(taskDate(due, { leadDays: 3, now: new Date("2026-09-03T12:00:00Z") }), "2026-09-09T00:00:00.000Z", "before the window: sits on X-3");
  assert.equal(taskDate(due, { leadDays: 3, now: new Date("2026-09-10T12:00:00Z") }), "2026-09-10T00:00:00.000Z", "inside the window: today");
  assert.equal(taskDate(due, { leadDays: 3, now: new Date("2026-09-12T12:00:00Z") }), "2026-09-12T00:00:00.000Z", "deadline day");
  assert.equal(taskDate(due, { leadDays: 3, now: new Date("2026-09-20T12:00:00Z") }), "2026-09-20T00:00:00.000Z", "past the deadline and still open: today, every day, until it is done");
  assert.equal(taskDate(due, { leadDays: 0, now: new Date("2026-09-03T12:00:00Z") }), "2026-09-12T00:00:00.000Z", "leadDays 0 = deadline");
});

test("toTask", () => {
  const t = toTask(a(), { now });
  assert.equal(t.title, "HW1 Proofs · CS 173 · due Sep 12, 11:59 PM");
  assert.equal(t.due, "2026-09-09T00:00:00.000Z");
  assert.equal(t.status, "needsAction");
  assert.equal(t.notes, "100% until 23:59, Sep 12\n\nhttps://pl/x\n\nuiuc:pl:1:2", "the notes end with the assignment id so any instance can recognise the task");
  assert.equal(assignmentIdOf(t), "pl:1:2");
  assert.equal(toTask(a({ dueAt: null })).title, "HW1 Proofs · CS 173");
  assert.equal(toTask(a({ source: "prairietest", title: "Quiz 2", course: "CS 128" }), { now }).title, "[Test] Quiz 2 · CS 128 · due Sep 12, 11:59 PM", "a CBTF reservation is marked as a test");
  assert.equal("due" in toTask(a({ dueAt: null })), false);
  assert.equal(toTask(a({ status: "graded" })).status, "needsAction", "mirrored tasks are always open; finished work is deleted instead");
  const long = toTask(a({ details: "x".repeat(2000) })).notes;
  assert.equal(long.length, 1024);
  assert.ok(long.endsWith("\n\nuiuc:pl:1:2"), "truncation never eats the id");
  assert.equal(assignmentIdOf({ notes: "just a note" }), null);
  assert.equal(assignmentIdOf({}), null);
});

test("diffTasks create/patch/remove/prune", () => {
  const tasks = [
    { id: "T1", title: "old", notes: "n", due: "2026-09-12T00:00:00.000Z", status: "needsAction" },
    { id: "T3", title: "HW3 · CS 173 · due Sep 20, 11:59 PM", notes: "d\n\nu\n\nuiuc:pl:1:3", due: "2026-09-17T00:00:00.000Z", status: "completed" },
    { id: "T9", title: "x", notes: "", status: "needsAction" },
  ];
  const mapping = { "pl:1:2": "T1", "pl:1:3": "T3", "pl:1:4": "TGONE", "pl:1:9": "T9" };
  const current = [a(), a({ id: "pl:1:3", title: "HW3", dueAt: "2026-09-21T04:59:00.000Z", details: "d", url: "u" }), a({ id: "pl:1:4", title: "HW4" }), a({ id: "pl:1:5", title: "HW5" })];
  const d = diffTasks(current, mapping, tasks, { now });
  assert.deepEqual(d.create.map((c) => c.assignmentId).sort(), ["pl:1:4", "pl:1:5"]);
  assert.deepEqual(d.prune, ["pl:1:4"]);
  assert.equal(d.patch.length, 1);
  assert.equal(d.patch[0].taskId, "T1");
  assert.equal(d.patch[0].patch.title, "HW1 Proofs · CS 173 · due Sep 12, 11:59 PM");
  assert.equal(d.patch[0].patch.due, "2026-09-09T00:00:00.000Z", "task moved to the start of the 3-day window");
  assert.deepEqual(d.remove, [{ assignmentId: "pl:1:9", taskId: "T9" }]);
});

test("finished assignments are deleted from Tasks, never mirrored", () => {
  const tasks = [{ id: "T1", title: "HW1 Proofs · CS 173 · due 11:59 PM", notes: "100% until 23:59, Sep 12\n\nhttps://pl/x", due: "2026-09-12T00:00:00.000Z", status: "needsAction" }];

  const done = diffTasks([a({ status: "graded" })], { "pl:1:2": "T1" }, tasks);
  assert.deepEqual(done.remove, [{ assignmentId: "pl:1:2", taskId: "T1" }], "a graded assignment's task is deleted");
  assert.deepEqual(done.create, []);
  assert.deepEqual(done.patch, []);

  const unmapped = diffTasks([a({ id: "pl:1:6", status: "submitted" })], {}, tasks);
  assert.deepEqual([unmapped.create, unmapped.patch, unmapped.remove, unmapped.prune], [[], [], [], []], "an unmapped finished assignment is left alone");

  const stale = diffTasks([a({ status: "graded" })], { "pl:1:2": "TGONE" }, tasks);
  assert.deepEqual(stale.prune, ["pl:1:2"], "a mapping whose task is already gone is pruned");
  assert.deepEqual(stale.remove, []);

  for (const status of ["submitted", "graded", "closed"]) assert.deepEqual(diffTasks([a({ status })], {}, []).create, [], `${status} is not mirrored`);
  for (const status of ["open", "unknown"]) assert.equal(diffTasks([a({ status })], {}, []).create.length, 1, `${status} is mirrored`);
});

test("manual completion is preserved", () => {
  const tasks = [{ id: "T1", title: "HW1 Proofs · CS 173 · due Sep 12, 11:59 PM", notes: "100% until 23:59, Sep 12\n\nhttps://pl/x\n\nuiuc:pl:1:2", due: "2026-09-09T00:00:00.000Z", status: "completed" }];
  const d = diffTasks([a()], { "pl:1:2": "T1" }, tasks, { now });
  assert.deepEqual(d.patch, []);
  const d2 = diffTasks([a({ title: "HW1 renamed" })], { "pl:1:2": "T1" }, tasks, { now });
  assert.equal(d2.patch[0].patch.status, undefined);
  assert.equal(d2.patch[0].patch.title, "HW1 renamed · CS 173 · due Sep 12, 11:59 PM");
});

test("runSync applies plan, updates mapping, captures errors", async () => {
  const calls = [];
  const api = {
    ensureList: async (title, cached) => { calls.push(["ensure", title, cached]); return "L1"; },
    listTasks: async () => [{ id: "T1", title: "x", notes: "", status: "needsAction" }],
    insertTask: async (l, t) => { calls.push(["insert", t.title]); if (t.title.startsWith("BAD")) throw new Error("quota"); return { id: "NEW" + calls.length }; },
    patchTask: async (l, id, p) => { calls.push(["patch", id]); return {}; },
    deleteTask: async (l, id) => { calls.push(["delete", id]); return null; },
  };
  const store = { state: { google: { tasklistId: null, mapping: { "pl:1:2": "T1", "pl:1:8": "TGONE" } } }, saved: 0, save() { this.saved++; } };
  const r = await runSync({ api, store, assignments: [a(), a({ id: "pl:1:7", title: "BAD one" })], log: () => {} });
  assert.equal(store.state.google.tasklistId, "L1");
  assert.equal(r.updated, 1);
  assert.equal(r.created, 0);
  assert.equal(r.errors.length, 1);
  assert.equal(store.state.google.mapping["pl:1:8"], undefined);
  assert.ok(store.saved >= 1);
  assert.equal(calls[0][1], LIST_TITLE);
});


test("rolling date: an open task is re-dated each day inside its window", () => {
  const tasks = [{ id: "T1", title: "HW1 Proofs · CS 173 · due Sep 12, 11:59 PM", notes: "100% until 23:59, Sep 12\n\nhttps://pl/x\n\nuiuc:pl:1:2", due: "2026-09-09T00:00:00.000Z", status: "needsAction" }];
  const d = diffTasks([a()], { "pl:1:2": "T1" }, tasks, { now: new Date("2026-09-10T15:00:00Z") });
  assert.deepEqual(d.patch.map((p) => p.patch), [{ due: "2026-09-10T00:00:00.000Z" }]);
});

// Two Macs run the app against the same Google account (see README): each has
// its own mapping, so without the id in the task itself every assignment ended
// up in the list once per machine.
const tagged = (id, over = {}) => ({ id, title: "HW1 Proofs · CS 173 · due Sep 12, 11:59 PM", notes: "100% until 23:59, Sep 12\n\nhttps://pl/x\n\nuiuc:pl:1:2", due: "2026-09-09T00:00:00.000Z", status: "needsAction", ...over });

test("an unmapped task carrying the assignment id is adopted, not duplicated", () => {
  const d = diffTasks([a()], {}, [tagged("T7", { due: "2026-09-08T00:00:00.000Z" })], { now });
  assert.deepEqual(d.create, []);
  assert.deepEqual(d.adopt, [{ assignmentId: "pl:1:2", taskId: "T7" }]);
  assert.deepEqual(d.patch.map((p) => [p.taskId, p.patch]), [["T7", { due: "2026-09-09T00:00:00.000Z" }]], "and then kept up to date like any mapped task");
  assert.deepEqual(d.remove, []);
});

test("several tasks for one assignment collapse to the one with the smallest id, on every machine alike", () => {
  const tasks = [tagged("TB"), tagged("TA"), tagged("TC")];
  const mine = diffTasks([a()], { "pl:1:2": "TB" }, tasks, { now });
  assert.deepEqual(mine.adopt, [{ assignmentId: "pl:1:2", taskId: "TA" }], "the mapping moves off my own copy when it is not the survivor");
  assert.deepEqual(mine.remove.map((r) => r.taskId).sort(), ["TB", "TC"]);
  const other = diffTasks([a()], { "pl:1:2": "TC" }, tasks, { now });
  assert.deepEqual(other.remove.map((r) => r.taskId).sort(), ["TB", "TC"], "the other machine reaches the same verdict");
  assert.deepEqual(mine.create, []);
  assert.deepEqual(mine.prune, []);
});

test("a stale mapping is pruned and replaced by the tagged survivor in one pass", () => {
  const d = diffTasks([a()], { "pl:1:2": "TGONE" }, [tagged("T7")], { now });
  assert.deepEqual(d.prune, ["pl:1:2"]);
  assert.deepEqual(d.adopt, [{ assignmentId: "pl:1:2", taskId: "T7" }]);
  assert.deepEqual(d.create, []);
});

test("legacy twins (same title, no id yet) are collapsed too; unrelated tasks are never touched", () => {
  const legacy = { id: "T2", title: "HW1 Proofs · CS 173 · due Sep 12, 11:59 PM", notes: "100% until 23:59, Sep 12\n\nhttps://pl/x", due: "2026-09-09T00:00:00.000Z", status: "needsAction" };
  const foreign = { id: "T5", title: "Buy milk", notes: "", status: "needsAction" };
  const d = diffTasks([a()], { "pl:1:2": "T1" }, [tagged("T1"), legacy, foreign], { now });
  assert.deepEqual(d.remove, [{ assignmentId: "pl:1:2", taskId: "T2" }]);
  assert.deepEqual(d.adopt, []);
  assert.deepEqual(d.create, []);
  // Legacy twin only, from the other machine, before either side has stamped ids: it is adopted and stamped.
  const d2 = diffTasks([a()], {}, [legacy, foreign], { now });
  assert.deepEqual(d2.adopt, [{ assignmentId: "pl:1:2", taskId: "T2" }]);
  assert.equal(d2.patch[0].patch.notes, "100% until 23:59, Sep 12\n\nhttps://pl/x\n\nuiuc:pl:1:2");
  assert.deepEqual(d2.create, []);
});

test("runSync adopts, dedupes, and shrugs off a delete the other machine already did", async () => {
  const calls = [];
  const api = {
    ensureList: async () => "L1",
    listTasks: async () => [tagged("TB"), tagged("TA")],
    insertTask: async () => { throw new Error("should not create"); },
    patchTask: async () => ({}),
    deleteTask: async (l, id) => { calls.push(["delete", id]); const e = new Error("Not Found"); e.status = 404; throw e; },
  };
  const store = { state: { google: { tasklistId: "L1", mapping: { "pl:1:2": "TB" } } }, save() {} };
  const r = await runSync({ api, store, assignments: [a()], now, log: () => {} });
  assert.deepEqual(calls, [["delete", "TB"]]);
  assert.equal(store.state.google.mapping["pl:1:2"], "TA");
  assert.equal(r.created, 0);
  assert.deepEqual(r.errors, [], "a 404 on delete means it is already gone");
});
