import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, zonedToISO, inferYear, formatChicago, chicagoDate } from "../lib/model.mjs";

test("zonedToISO handles CDT and CST", () => {
  assert.equal(zonedToISO({ year: 2026, month: 9, day: 12, hour: 23, minute: 59 }), "2026-09-13T04:59:00.000Z");
  assert.equal(zonedToISO({ year: 2026, month: 12, day: 5, hour: 23, minute: 59 }), "2026-12-06T05:59:00.000Z");
});

test("inferYear wraps around new year", () => {
  const now = new Date("2026-09-03T12:00:00Z");
  assert.equal(inferYear(9, 12, now), 2026);
  assert.equal(inferYear(1, 20, now), 2027);
  assert.equal(inferYear(8, 1, now), 2026);
  assert.equal(inferYear(11, 30, new Date("2027-01-10T12:00:00Z")), 2026);
});

test("format helpers", () => {
  assert.equal(formatChicago("2026-09-13T04:59:00.000Z"), "Sep 12, 11:59 PM");
  assert.equal(chicagoDate("2026-09-13T04:59:00.000Z"), "2026-09-12");
});

test("normalize fills defaults and validates", () => {
  const a = normalize({ id: "canvas:1:2", source: "canvas", course: "X", title: "  HW 1 ", url: "u", details: "d".repeat(3000) });
  assert.equal(a.title, "HW 1");
  assert.equal(a.dueAt, null);
  assert.equal(a.status, "unknown");
  assert.equal(a.details.length, 2000);
  assert.throws(() => normalize({ id: "x", source: "nope", course: "X", title: "t" }), /source/);
  assert.throws(() => normalize({ id: "canvas:1:2", source: "canvas", course: "X", title: "t", dueAt: "garbage" }), /dueAt/);
});

test("normalize carries an optional grade, trimmed and capped", () => {
  const base = { id: "canvas:1:2", source: "canvas", course: "X", title: "t" };
  assert.equal(normalize(base).grade, null, "absent grade is null");
  assert.equal(normalize({ ...base, grade: "  9/10 " }).grade, "9/10");
  assert.equal(normalize({ ...base, grade: "   " }).grade, null, "blank grade is null");
  assert.equal(normalize({ ...base, grade: null }).grade, null);
  assert.equal(normalize({ ...base, grade: "A".repeat(60) }).grade, "A".repeat(40), "capped at 40 chars");
  const a = normalize({ ...base, grade: "110%", status: "graded", dueAt: "2026-09-10T04:59:00.000Z", url: "u", details: "d" });
  assert.deepEqual(Object.keys(a).sort(), ["course", "details", "dueAt", "grade", "id", "openAt", "seenAt", "source", "status", "title", "url"]);
});
