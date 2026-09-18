import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/store.mjs";

const dir = mkdtempSync(join(tmpdir(), "ucm-"));

test("empty by default, persists roundtrip", () => {
  const s = new Store(join(dir, "state.json"));
  assert.deepEqual(s.state.assignments, []);
  assert.equal(s.state.google.tasklistId, null);
  assert.equal(s.state.google.calendarId, null);
  s.state.assignments.push({ id: "x" });
  s.state.google.mapping.x = "t1";
  s.save();
  const s2 = new Store(join(dir, "state.json"));
  assert.equal(s2.state.assignments[0].id, "x");
  assert.equal(s2.state.google.mapping.x, "t1");
});

test("corrupt file starts empty with loadError", () => {
  writeFileSync(join(dir, "bad.json"), "{nope");
  const s = new Store(join(dir, "bad.json"));
  assert.deepEqual(s.state.assignments, []);
  assert.match(s.loadError, /JSON/);
});

test("pushChanges caps at 200 newest-first", () => {
  const s = new Store(join(dir, "c.json"));
  s.pushChanges(Array.from({ length: 150 }, (_, i) => ({ type: "added", id: String(i) })));
  s.pushChanges(Array.from({ length: 100 }, (_, i) => ({ type: "added", id: "n" + i })));
  assert.equal(s.state.changes.length, 200);
  assert.equal(s.state.changes[0].id, "n0");
});
