import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots } from "../lib/diff.mjs";

const a = (over) => ({ id: "pl:1:hw1", source: "prairielearn", course: "CS 173", title: "HW1", dueAt: "2026-09-10T04:59:00.000Z", openAt: null, url: "", details: "", status: "open", grade: null, seenAt: "t", ...over });

test("added / removed", () => {
  const ch = diffSnapshots([], [a()]);
  assert.deepEqual(ch.map((c) => c.type), ["added"]);
  assert.equal(ch[0].to, "2026-09-10T04:59:00.000Z");
  assert.deepEqual(diffSnapshots([a()], []).map((c) => c.type), ["removed"]);
});

test("due and status changes", () => {
  const ch = diffSnapshots([a()], [a({ dueAt: "2026-09-12T04:59:00.000Z", status: "submitted" })]);
  assert.deepEqual(ch.map((c) => c.type).sort(), ["due_changed", "status_changed"]);
  const due = ch.find((c) => c.type === "due_changed");
  assert.equal(due.from, "2026-09-10T04:59:00.000Z");
  assert.equal(due.to, "2026-09-12T04:59:00.000Z");
});

test("no change when identical apart from seenAt/details", () => {
  assert.deepEqual(diffSnapshots([a()], [a({ seenAt: "later", details: "x" })]), []);
});

test("due dates differing only by seconds are not a change", () => {
  assert.deepEqual(diffSnapshots([a({ dueAt: "2026-09-10T04:59:59.000Z" })], [a({ dueAt: "2026-09-10T04:59:00.000Z" })]), []);
  assert.equal(diffSnapshots([a({ dueAt: "2026-09-10T04:59:59.000Z" })], [a({ dueAt: "2026-09-10T05:00:00.000Z" })]).length, 1);
});

test("a new grade on its own is not a change", () => {
  assert.deepEqual(diffSnapshots([a({ status: "graded", grade: "9/10" })], [a({ status: "graded", grade: "10/10" })]), [], "a regrade is not news");
  assert.deepEqual(diffSnapshots([a({ status: "graded", grade: null })], [a({ status: "graded", grade: "9/10" })]), []);
});

test("a status change carries the grade so the feed can say graded: 9/10", () => {
  const [ch] = diffSnapshots([a({ status: "submitted" })], [a({ status: "graded", grade: "9/10" })]);
  assert.equal(ch.type, "status_changed");
  assert.equal(ch.from, "submitted");
  assert.equal(ch.to, "graded", "`to` stays the status");
  assert.equal(ch.grade, "9/10");

  const [plain] = diffSnapshots([a()], [a({ status: "submitted" })]);
  assert.equal(plain.grade, null, "a status change without a grade carries null");

  const [added] = diffSnapshots([], [a({ status: "graded", grade: "9/10" })]);
  assert.equal(added.type, "added");
  assert.ok(!("grade" in added), "only status changes carry a grade");
});
