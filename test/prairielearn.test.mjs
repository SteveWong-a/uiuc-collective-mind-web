import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePrairieLearn, parseCreditText, parseDateText, parseAccessTable } from "../lib/sources/prairielearn.mjs";

const load = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const now = new Date("2026-09-03T12:00:00Z");

test("parseDateText formats", () => {
  assert.equal(parseDateText("08:00, Tue, Sep 8", now), "2026-09-08T13:00:00.000Z");
  assert.equal(parseDateText("23:59, Sep 12", now), "2026-09-13T04:59:00.000Z");
  assert.equal(parseDateText("11:59 PM, Fri, Sep 12 (CDT)", now), "2026-09-13T04:59:00.000Z");
  assert.equal(parseDateText("23:59, Dec 5, 2026", now), "2026-12-06T05:59:00.000Z");
  assert.equal(parseDateText("nothing here", now), null);
});

test("parseCreditText", () => {
  assert.deepEqual(parseCreditText("100% until 08:00, Tue, Sep 8", now), { dueAt: "2026-09-08T13:00:00.000Z", details: "100% until 08:00, Tue, Sep 8" });
  assert.equal(parseCreditText("110% until 23:59, Thu, Sep 3", now).dueAt, "2026-09-04T04:59:00.000Z");
  assert.equal(parseCreditText("100%", now).dueAt, null);
  assert.equal(parseCreditText("", now).dueAt, null);
});

test("parseAccessTable", () => {
  const rows = parseAccessTable(`<table><tr><th>Credit</th><th>Start</th><th>End</th></tr>
    <tr><td>110%</td><td>2026-08-24 00:00:01 (CDT)</td><td>2026-08-28 23:59:59 (CDT)</td></tr>
    <tr><td>None</td><td>2026-09-09 00:00:01 (CDT)</td><td>2026-12-31 23:59:59 (CST)</td></tr></table>`);
  assert.deepEqual(rows, [
    { credit: 110, start: "2026-08-24T05:00:01.000Z", end: "2026-08-29T04:59:59.000Z" },
    { credit: null, start: "2026-09-09T05:00:01.000Z", end: "2027-01-01T05:59:59.000Z" },
  ]);
});

test("CS 173 fixture", () => {
  const out = parsePrairieLearn(load("pl-assessments.html"), { course: "CS 173", instanceId: "223829", now });
  assert.equal(out.length, 3);
  for (const a of out) { assert.equal(a.source, "prairielearn"); assert.equal(a.course, "CS 173"); assert.match(a.id, /^pl:223829:[a-z0-9-]+$/); }
  const hw1 = out.find((a) => a.id === "pl:223829:pre-unit-homework1");
  assert.equal(hw1.title, "Pre-Unit Homework1 Week 1: Prereqs and Logic");
  assert.equal(hw1.dueAt, "2026-09-08T13:00:00.000Z");
  assert.equal(hw1.status, "graded");
  assert.equal(hw1.url, "https://us.prairielearn.com/pl/course_instance/223829/assessment_instance/14536974/");
  assert.match(hw1.details, /100% until 08:00, Tue, Sep 8/);
  assert.match(hw1.details, /Score: 100%/);
  const sandbox = out.find((a) => a.id === "pl:223829:practicel");
  assert.equal(sandbox.dueAt, null);
  assert.equal(sandbox.status, "open");
});

test("MATH 257 fixture: multi-window, not started, no deadline", () => {
  const out = parsePrairieLearn(load("pl-assessments-math257.html"), { course: "MATH 257", instanceId: "217654", now });
  assert.equal(out.length, 7);
  const hw1 = out.find((a) => a.id === "pl:217654:hw1");
  assert.equal(hw1.dueAt, "2026-09-02T04:59:59.000Z", "due = end of the 100% window even though the 80% window is current");
  assert.equal(hw1.status, "graded");
  const hw2 = out.find((a) => a.id === "pl:217654:hw2");
  assert.equal(hw2.status, "open");
  assert.match(hw2.url, /\/assessment\/\d+\/$/);
  assert.equal(hw2.dueAt, "2026-09-05T04:59:59.000Z");
  const cl1 = out.find((a) => a.id === "pl:217654:cl1");
  assert.equal(cl1.title, "CL1 Python tutorial");
  assert.equal(cl1.dueAt, null);
  assert.equal(cl1.status, "graded");
  const chw1 = out.find((a) => a.id === "pl:217654:chw1");
  // FIXTURE-VERIFIED ADJUSTMENT (see task-7-report.md): CHW1's only >=100% access-table row
  // (110%) ends 2026-09-03 23:59:59 CDT = 2026-09-04T04:59:59.000Z, which is AFTER `now`
  // (2026-09-03T12:00:00Z). The due date has not passed yet, so per the spec's own "closed
  // when dueAt is in the past relative to now" rule this must be "open", not "closed".
  assert.equal(chw1.status, "open", "0% / not started but due date has NOT passed relative to now -> open");
});

const withRow = (row) => load("pl-assessments.html").replace("</table>", `${row}</table>`);

test("past the deadline, work stays open while a late-credit window is still running", () => {
  const at = (iso) => parsePrairieLearn(load("pl-assessments-math257.html"), { course: "MATH 257", instanceId: "217654", now: new Date(iso) }).find((a) => a.id === "pl:217654:chw1");
  // CHW1: 110% until Sep 3, 80% Sep 4 – Sep 10, none after; not started.
  const late = at("2026-09-06T12:00:00Z");
  assert.equal(late.status, "open", "Sep 6: the 80% window still takes submissions, so it is overdue, not closed");
  assert.equal(late.dueAt, "2026-09-04T04:59:59.000Z", "the deadline stays the end of full credit");
  assert.equal(at("2026-09-11T03:00:00Z").status, "open", "Sep 10, 10 PM: last hours of the 80% window");
  assert.equal(at("2026-09-12T12:00:00Z").status, "closed", "Sep 12: only the no-access row is left");
  // A 0% tail row (CS 173's "0%: Sep 8 – Dec 24") is reachable but worthless: closed.
  const content = "&lt;table&gt;&lt;tr&gt;&lt;td&gt;100%&lt;/td&gt;&lt;td&gt;2026-08-01 00:00:00 (CDT)&lt;/td&gt;&lt;td&gt;2026-08-10 23:59:59 (CDT)&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;0%&lt;/td&gt;&lt;td&gt;2026-08-11 00:00:00 (CDT)&lt;/td&gt;&lt;td&gt;2026-12-24 23:59:59 (CDT)&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;";
  const zero = parsePrairieLearn(withRow(`<tr><td><span data-testid="assessment-set-badge">SYN</span></td><td>Zero tail</td><td><button data-bs-content="${content}"></button></td><td><div data-testid="scorebar">Not started</div></td></tr>`), { course: "CS 173", instanceId: "223829", now }).find((a) => a.id === "pl:223829:syn");
  assert.equal(zero.status, "closed");
});

test("CS 128 PL fixture: row with no link and no credit", () => {
  const out = parsePrairieLearn(load("pl-assessments-cs128.html"), { course: "CS 128", instanceId: "143409", now });
  assert.equal(out.length, 2);
  const q1 = out.find((a) => a.id === "pl:143409:q1");
  assert.equal(q1.title, "Q1 Quiz 1");
  assert.equal(q1.url, "https://us.prairielearn.com/pl/course_instance/143409/assessments");
  assert.equal(q1.dueAt, null);
  assert.equal(q1.status, "open");
});

// Synthetic rows appended to a real fixture: the live page has shown short rows
// (spacer / group rows carrying a badge) that used to blow up the destructuring.
test("badge rows with fewer than four cells are skipped", () => {
  const out = parsePrairieLearn(withRow('<tr><td><span data-testid="assessment-set-badge">SYN</span></td><td>Broken row</td></tr>'), { course: "CS 173", instanceId: "223829", now });
  assert.equal(out.length, 3, "the 2-cell row is ignored, the real rows still parse");
  assert.ok(!out.some((a) => a.id === "pl:223829:syn"));
});

test("details render an unparseable access timestamp as ?", () => {
  const content = "&lt;table&gt;&lt;tr&gt;&lt;td&gt;100%&lt;/td&gt;&lt;td&gt;nope&lt;/td&gt;&lt;td&gt;2026-09-08 08:00:00 (CDT)&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;";
  const out = parsePrairieLearn(withRow(`<tr><td><span data-testid="assessment-set-badge">SYN</span></td><td>Synthetic</td><td><button data-bs-content="${content}"></button></td><td>Not started</td></tr>`), { course: "CS 173", instanceId: "223829", now });
  const syn = out.find((a) => a.id === "pl:223829:syn");
  assert.ok(syn, "the 4-cell synthetic row parses");
  assert.match(syn.details, /100%: \? – Sep 8 08:00/);
  assert.doesNotMatch(syn.details, /1969|1970/);
});

test("grade is the percentage the scorebar shows, and nothing when there is no score", () => {
  const cs173 = parsePrairieLearn(load("pl-assessments.html"), { course: "CS 173", instanceId: "223829", now });
  assert.equal(cs173.find((a) => a.id === "pl:223829:pre-unit-homework1").grade, "100%");
  const sandbox = cs173.find((a) => a.id === "pl:223829:practicel");
  assert.equal(sandbox.grade, null, "0% on work that is only open is not a grade to show");
  assert.match(sandbox.details, /Score: 0%/, "the score still shows in the details");

  const math = parsePrairieLearn(load("pl-assessments-math257.html"), { course: "MATH 257", instanceId: "217654", now });
  assert.equal(math.find((a) => a.id === "pl:217654:hw1").grade, "110%");
  assert.equal(math.find((a) => a.id === "pl:217654:cl1").grade, "100%");
  assert.equal(math.find((a) => a.id === "pl:217654:hw2").grade, null, "Not started");
  assert.equal(math.find((a) => a.id === "pl:217654:chw1").grade, null, "0% and still open");

  const cs128 = parsePrairieLearn(load("pl-assessments-cs128.html"), { course: "CS 128", instanceId: "143409", now });
  assert.equal(cs128.find((a) => a.id === "pl:143409:q1").grade, null);
});

test("a 0% on work whose deadline has passed is closed with no grade", () => {
  const content = "&lt;table&gt;&lt;tr&gt;&lt;td&gt;100%&lt;/td&gt;&lt;td&gt;2026-08-01 00:00:00 (CDT)&lt;/td&gt;&lt;td&gt;2026-08-10 23:59:59 (CDT)&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;";
  const out = parsePrairieLearn(withRow(`<tr><td><span data-testid="assessment-set-badge">SYN</span></td><td>Missed it</td><td><button data-bs-content="${content}"></button></td><td><div data-testid="scorebar">0%</div></td></tr>`), { course: "CS 173", instanceId: "223829", now });
  const syn = out.find((a) => a.id === "pl:223829:syn");
  assert.equal(syn.status, "closed");
  assert.equal(syn.grade, null);
});
