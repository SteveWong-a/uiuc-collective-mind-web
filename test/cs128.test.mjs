import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGradebook, parseDueDate, fetchCs128, GRADEBOOK_URL } from "../lib/sources/cs128.mjs";

const load = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const now = new Date("2026-09-03T12:00:00Z");

test("parseDueDate", () => {
  assert.equal(parseDueDate("Due Sep 3, 2026", now), "2026-09-04T04:59:00.000Z");
  assert.equal(parseDueDate("Due Dec 5, 2026", now), "2026-12-06T05:59:00.000Z");
  assert.equal(parseDueDate("Due Sep 3", now), "2026-09-04T04:59:00.000Z");
  assert.equal(parseDueDate("no date", now), null);
});

test("gradebook rows", () => {
  const out = parseGradebook(load("cs128-my-gradebook.html"), { course: "CS 128", now });
  assert.equal(out.length, 9);
  assert.equal(new Set(out.map((a) => a.id)).size, 9);
  for (const a of out) { assert.equal(a.source, "cs128"); assert.match(a.id, /^cs128:lesson:[a-z0-9-]+$/); assert.match(a.url, /^https:\/\/cs128\.org\//); }
  const pre = out.find((a) => a.title === "The Preprocessor, the Linker, and Overloading");
  assert.equal(pre.dueAt, "2026-09-04T04:59:00.000Z");
  assert.equal(pre.status, "open");
  assert.equal(pre.url, "https://cs128.org/2026c/the-preprocessor-the-linker-and-overloading-1906");
  assert.match(pre.details, /Score 0\.00\/100\.00 \(0\.00%\)/);
  const fns = out.find((a) => a.title === "Declaring, Defining, and Calling Functions");
  assert.equal(fns.status, "graded");
  // cs128 pays nothing after the due date, so a past-due lesson with no score
  // is closed — it never shows up as overdue work.
  const howdy = out.find((a) => a.title === "Howdy, World!");
  assert.equal(howdy.status, "closed");
  assert.equal(howdy.grade, null);
  const pg = out.find((a) => a.title === "Playground & Question System");
  assert.ok(pg, "html entity in title is unescaped");
  assert.ok(!out.some((a) => /Greenhouse Controller|Cowboy's Hello|Course Number/.test(a.title)), "component sub-rows are not assignments");
});

test("fetchCs128 reads the gradebook only, waiting for its table", async () => {
  const visited = [];
  const browser = {
    withPage: async (url, fn) => {
      visited.push(url);
      return fn({ waitForSelector: async (sel) => { visited.push(sel); }, content: async () => load("cs128-my-gradebook.html") });
    },
  };
  const out = await fetchCs128({ course: "CS 128" }, { browser, now });
  assert.equal(out.length, 9);
  assert.deepEqual(visited, [GRADEBOOK_URL, "table .fw-semibold"], "one page: the gradebook, waiting for its table itself rather than any table");
  assert.ok(out.every((a) => a.id.startsWith("cs128:lesson:")), "no calendar events");
});

test("gradebook grades read score, max and percent straight off the page", () => {
  const out = parseGradebook(load("cs128-my-gradebook.html"), { course: "CS 128", now });
  const fns = out.find((a) => a.title === "Declaring, Defining, and Calling Functions");
  assert.equal(fns.grade, "100.00%");
  const pre = out.find((a) => a.title === "The Preprocessor, the Linker, and Overloading");
  assert.equal(pre.status, "open");
  assert.equal(pre.grade, null, "a 0.00 on work that is still open is not a grade");
  assert.match(pre.details, /Score 0\.00\/100\.00 \(0\.00%\)/, "the zero still shows in the details");
  const howdy = out.find((a) => a.title === "Howdy, World!");
  assert.equal(howdy.grade, null, "and neither is a 0.00 on closed work");
  assert.equal(howdy.grade, null, "a 0.00 on closed work is not a grade either");
  for (const a of out) if (a.status === "submitted" || a.status === "graded") assert.ok(a.grade, `${a.title} is ${a.status} and must show a grade`);
});
