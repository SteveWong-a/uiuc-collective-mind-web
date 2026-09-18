import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCanvas, fetchCanvas, parseLinkNext } from "../lib/sources/canvas.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/canvas-assignments.json", import.meta.url), "utf8"));
const ctx = { course: "MATH 580", courseId: "74998", base: "https://canvas.illinois.edu", now: new Date("2026-09-03T12:00:00Z") };

test("parse maps fields, status, details", () => {
  const out = parseCanvas(rows, ctx);
  assert.equal(out.length, 4);
  const [hw, essay, quiz, reading] = out;
  assert.equal(hw.id, "canvas:74998:101");
  assert.equal(hw.course, "MATH 580");
  assert.equal(hw.dueAt, "2026-09-13T04:59:59.000Z");
  assert.equal(hw.openAt, "2026-09-01T05:00:00.000Z");
  assert.equal(hw.status, "open");
  assert.match(hw.details, /10 pts/);
  assert.match(hw.details, /Do problems 1-5\./);
  assert.doesNotMatch(hw.details, /<b>/);
  assert.equal(essay.status, "submitted");
  assert.equal(quiz.status, "graded");
  assert.equal(reading.status, "closed");
  assert.equal(reading.dueAt, null);
});

test("Link header next", () => {
  assert.equal(parseLinkNext('<https://x/api?page=2>; rel="next", <https://x/api?page=1>; rel="first"'), "https://x/api?page=2");
  assert.equal(parseLinkNext('<https://x/api?page=1>; rel="first"'), null);
  assert.equal(parseLinkNext(undefined), null);
});

test("fetch follows pagination and sends bearer", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization });
    if (calls.length === 1) return { ok: true, status: 200, headers: new Headers({ link: '<https://canvas.illinois.edu/api/v1/courses/74998/assignments?page=2>; rel="next"' }), json: async () => rows.slice(0, 2) };
    return { ok: true, status: 200, headers: new Headers(), json: async () => rows.slice(2) };
  };
  const out = await fetchCanvas({ course: "MATH 580", courseId: "74998" }, { base: "https://canvas.illinois.edu", token: "tok", fetchImpl });
  assert.equal(out.length, 4);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer tok");
  assert.match(calls[0].url, /include%5B%5D=submission|include\[\]=submission/);
});

test("fetch errors on non-ok", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, headers: new Headers(), text: async () => "Invalid access token" });
  await assert.rejects(fetchCanvas({ course: "X", courseId: "1" }, { base: "https://c", token: "bad", fetchImpl }), /401/);
});

test("fetch limits pagination to prevent infinite loops", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    return { ok: true, status: 200, headers: new Headers({ link: '<https://canvas.illinois.edu/api/v1/courses/74998/assignments?page=next>; rel="next"' }), json: async () => [] };
  };
  await assert.rejects(fetchCanvas({ course: "X", courseId: "1" }, { base: "https://c", token: "tok", fetchImpl }), /pagination exceeded/);
  assert.equal(calls.length, 50);
});

import { fetchCanvasViaBrowser, fetchCanvasAuto, browserFetchAssignments } from "../lib/sources/canvas.mjs";
import { LoginRequiredError } from "../lib/browser.mjs";

test("fetchCanvasViaBrowser evaluates in the course page and parses rows", async () => {
  const visited = [];
  const browser = {
    withPage: async (url, fn) => {
      visited.push(url);
      return fn({ evaluate: async (f, arg) => { visited.push(arg); return rows; } });
    },
  };
  const out = await fetchCanvasViaBrowser({ course: "MATH 580", courseId: "74998" }, { base: "https://canvas.illinois.edu", browser, now: new Date("2026-09-03T12:00:00Z") });
  assert.equal(out.length, 4);
  assert.equal(out[0].id, "canvas:74998:101");
  assert.equal(visited[0], "https://canvas.illinois.edu/courses/74998");
  assert.deepEqual(visited[1], { courseId: "74998", maxPages: 50 });
});

test("fetchCanvasAuto prefers token, falls back to browser", async () => {
  let tokenCalls = 0, browserCalls = 0;
  const fetchImpl = async () => { tokenCalls++; return { ok: true, status: 200, headers: new Headers(), json: async () => rows.slice(0, 1) }; };
  const browser = { withPage: async (url, fn) => { browserCalls++; return fn({ evaluate: async () => rows }); } };
  await fetchCanvasAuto({ course: "X", courseId: "1" }, { base: "https://c", token: "tok", browser, fetchImpl });
  assert.deepEqual([tokenCalls, browserCalls], [1, 0]);
  await fetchCanvasAuto({ course: "X", courseId: "1" }, { base: "https://c", token: "", browser, fetchImpl });
  assert.deepEqual([tokenCalls, browserCalls], [1, 1]);
});

test("browserFetchAssignments paginates via Link header and strips while(1); prefix", async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url) => {
      calls.push(url);
      if (calls.length === 1) {
        return {
          ok: true,
          headers: new Headers({ link: '<https://canvas.illinois.edu/api/v1/courses/74998/assignments?page=2>; rel="next"' }),
          text: async () => `while(1);${JSON.stringify(rows.slice(0, 2))}`,
        };
      }
      return { ok: true, headers: new Headers(), text: async () => JSON.stringify(rows.slice(2)) };
    };
    const out = await browserFetchAssignments({ courseId: "74998", maxPages: 50 });
    assert.equal(calls.length, 2);
    assert.equal(out.length, 4);
    assert.equal(out[0].id, 101);
  } finally {
    globalThis.fetch = original;
  }
});

test("browserFetchAssignments rejects with non-JSON message on HTML body (session expired)", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers(),
      text: async () => "<!DOCTYPE html><html><body>Please log in</body></html>",
    });
    await assert.rejects(browserFetchAssignments({ courseId: "74998", maxPages: 50 }), /non-JSON/);
  } finally {
    globalThis.fetch = original;
  }
});

test("browserFetchAssignments rejects with pagination exceeded after maxPages calls", async () => {
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        headers: new Headers({ link: '<https://canvas.illinois.edu/api/v1/courses/74998/assignments?page=next>; rel="next"' }),
        text: async () => "[]",
      };
    };
    await assert.rejects(browserFetchAssignments({ courseId: "74998", maxPages: 3 }), /pagination exceeded/);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchCanvasViaBrowser reports auth-shaped failures as LoginRequiredError", async () => {
  const failing = (message) => ({ withPage: async (url, fn) => fn({ evaluate: async () => { throw new Error(message); } }) });
  const cfg = { course: "MATH 580", courseId: "74998" };
  const deps = (browser) => ({ base: "https://canvas.illinois.edu", browser, now: new Date("2026-09-03T12:00:00Z") });

  for (const message of ["Canvas returned non-JSON for /api/v1/x (session expired? log in again)", "Canvas 401: Invalid access token", "Canvas 403: forbidden"]) {
    const e = await fetchCanvasViaBrowser(cfg, deps(failing(message))).then(() => null, (err) => err);
    assert.ok(e instanceof LoginRequiredError, `${message} should become LoginRequiredError`);
    assert.equal(e.url, "https://canvas.illinois.edu/courses/74998");
  }

  await assert.rejects(fetchCanvasViaBrowser(cfg, deps(failing("Canvas 500: server exploded"))), (e) => !(e instanceof LoginRequiredError) && /500/.test(e.message));
});

import { unfoldIcs, parseIcsEvents, parseCanvasFeed, fetchCanvasFeed, mergeCanvas } from "../lib/sources/canvas.mjs";

const ics = readFileSync(new URL("./fixtures/canvas-feed.ics", import.meta.url), "utf8");
const feedCourses = [
  { course: "MATH 580", source: "canvas", courseId: "74998" },
  { course: "RHET 105", source: "canvas", courseId: "72592" },
];

test("unfoldIcs normalises line endings and joins continuation lines", () => {
  assert.equal(unfoldIcs("A:1\r\nB:2\r\n 3\r\n"), "A:1\nB:23\n");
  assert.equal(unfoldIcs("A:1\rB:2\n\t3"), "A:1\nB:23");
  assert.equal(unfoldIcs(""), "");
});

test("parseIcsEvents reads every VEVENT and unfolds folded URL lines", () => {
  const events = parseIcsEvents(ics);
  assert.equal(events.length, 3);

  const hw = events.find((e) => e.uid === "event-assignment-1763420");
  assert.equal(hw.summary, "homework 1 [math_580_120268_266429]");
  assert.match(hw.url, /^https:\/\/canvas\.illinois\.edu\/calendar\?include_contexts=course_74998&month=09&year=2026#assignment_1763420$/);
  assert.deepEqual(hw.dtstart, { datetime: "2026-09-10T15:00:00.000Z" });
  assert.match(hw.description, /Homework 1: due September 10, Thursday 10am sharp\./);

  const quiz = events.find((e) => e.uid === "event-assignment-1710786");
  assert.equal(quiz.description, "");

  assert.ok(events.some((e) => e.uid === "event-calendar-event-773567"), "plain calendar events are still parsed at this level");
});

test("parseCanvasFeed keeps configured assignments and drops calendar events", () => {
  const out = parseCanvasFeed(ics, { courses: feedCourses, now: new Date("2026-09-03T12:00:00Z") });
  assert.equal(out.length, 2);

  const hw = out.find((a) => a.id === "canvas:74998:1763420");
  assert.equal(hw.title, "homework 1");
  assert.equal(hw.course, "MATH 580");
  assert.equal(hw.source, "canvas");
  assert.equal(hw.dueAt, "2026-09-10T15:00:00.000Z");
  assert.equal(hw.status, "open");
  assert.equal(hw.url, "https://canvas.illinois.edu/courses/74998/assignments/1763420");
  assert.match(hw.details, /Homework 1: due September 10, Thursday/);

  assert.ok(!out.some((a) => a.id.includes("59107")), "the vcstud calendar event is dropped");
});

test("parseCanvasFeed ignores courses that are not configured", () => {
  const out = parseCanvasFeed(ics, { courses: [{ course: "MATH 580", courseId: "74998" }], now: new Date("2026-09-03T12:00:00Z") });
  assert.deepEqual(out.map((a) => a.id), ["canvas:74998:1763420"]);
});

test("fetchCanvasFeed GETs the feed and throws on non-ok", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 200, text: async () => ics }; };
  const out = await fetchCanvasFeed({ feedUrl: "https://canvas.illinois.edu/feeds/calendars/user_abc123.ics", courses: feedCourses, fetchImpl, now: new Date("2026-09-03T12:00:00Z") });
  assert.equal(out.length, 2);
  assert.deepEqual(calls, ["https://canvas.illinois.edu/feeds/calendars/user_abc123.ics"]);

  const bad = async () => ({ ok: false, status: 404, text: async () => "not found" });
  await assert.rejects(fetchCanvasFeed({ feedUrl: "https://x/feeds/calendars/user_a.ics", courses: feedCourses, fetchImpl: bad }), /404/);
});

test("mergeCanvas takes status and details from the session, keeps feed-only and session-only items", () => {
  const feed = [
    { id: "canvas:1:10", source: "canvas", course: "A", title: "hw", dueAt: "2026-09-01T04:59:00.000Z", details: "feed details", status: "open", dueDateOnly: true },
    { id: "canvas:1:11", source: "canvas", course: "A", title: "feed only", dueAt: null, details: "", status: "open" },
  ];
  const session = [
    { id: "canvas:1:10", source: "canvas", course: "A", title: "hw", dueAt: "2026-09-01T04:59:59.000Z", details: "10 pts", status: "submitted" },
    { id: "canvas:1:12", source: "canvas", course: "A", title: "session only", dueAt: null, details: "", status: "graded" },
  ];
  const out = mergeCanvas(feed, session);
  assert.deepEqual(out.map((a) => a.id), ["canvas:1:10", "canvas:1:11", "canvas:1:12"]);
  const merged = out[0];
  assert.equal(merged.status, "submitted");
  assert.equal(merged.details, "10 pts");
  assert.equal(merged.dueAt, "2026-09-01T04:59:59.000Z", "date-only feed due time yields to the exact session time");
  assert.equal(merged.title, "hw");
  assert.equal(out[2].status, "graded");
});

test("mergeCanvas keeps an exact feed dueAt even when the session disagrees", () => {
  const feed = [{ id: "canvas:1:10", source: "canvas", course: "A", title: "hw", dueAt: "2026-09-10T15:00:00.000Z", details: "d", status: "open" }];
  const session = [{ id: "canvas:1:10", source: "canvas", course: "A", title: "hw", dueAt: "2026-09-11T15:00:00.000Z", details: "s", status: "open" }];
  assert.equal(mergeCanvas(feed, session)[0].dueAt, "2026-09-10T15:00:00.000Z");
});

test("fetchCanvasAuto with a feed survives a login-required session and fetches the feed once per run", async () => {
  const now = new Date("2026-09-03T12:00:00Z");
  const logged = [];
  let feedFetches = 0;
  const fetchImpl = async () => { feedFetches++; return { ok: true, status: 200, text: async () => ics }; };
  const browser = { withPage: async (url) => { throw new LoginRequiredError(url); } };
  const deps = {
    base: "https://canvas.illinois.edu", token: "", browser, fetchImpl, now,
    feedUrl: "https://canvas.illinois.edu/feeds/calendars/user_login.ics", courses: feedCourses, log: (m) => logged.push(m),
  };
  const math = await fetchCanvasAuto({ course: "MATH 580", courseId: "74998" }, deps);
  assert.deepEqual(math.map((a) => a.id), ["canvas:74998:1763420"]);
  assert.match(math.warning, /^status via login unavailable: login required \(canvas\.illinois\.edu\)$/);
  const rhet = await fetchCanvasAuto({ course: "RHET 105", courseId: "72592" }, deps);
  assert.deepEqual(rhet.map((a) => a.id), ["canvas:72592:1710786"]);
  assert.equal(feedFetches, 1, "the feed is fetched once for the whole run");
  assert.ok(logged.some((m) => /74998/.test(m)), "the session failure is logged, not thrown");
});

test("fetchCanvasAuto with a feed and a working session merges statuses", async () => {
  const now = new Date("2026-09-04T12:00:00Z");
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => ics });
  const sessionRows = [{ id: 1763420, name: "homework 1", due_at: "2026-09-10T15:00:00Z", html_url: "https://canvas.illinois.edu/courses/74998/assignments/1763420", points_possible: 20, submission: { workflow_state: "submitted" } }];
  const browser = { withPage: async (url, fn) => fn({ evaluate: async () => sessionRows }) };
  const out = await fetchCanvasAuto({ course: "MATH 580", courseId: "74998" }, {
    base: "https://canvas.illinois.edu", token: "", browser, fetchImpl, now,
    feedUrl: "https://canvas.illinois.edu/feeds/calendars/user_merge.ics", courses: feedCourses,
  });
  assert.deepEqual(out.map((a) => a.id), ["canvas:74998:1763420"]);
  assert.equal(out[0].status, "submitted");
  assert.match(out[0].details, /20 pts/);
  assert.equal(out.warning, undefined);
});

test("fetchCanvasAuto without a feed url keeps the token-then-browser path", async () => {
  let tokenCalls = 0, browserCalls = 0;
  const fetchImpl = async () => { tokenCalls++; return { ok: true, status: 200, headers: new Headers(), json: async () => rows.slice(0, 1) }; };
  const browser = { withPage: async (url, fn) => { browserCalls++; return fn({ evaluate: async () => rows }); } };
  await fetchCanvasAuto({ course: "X", courseId: "1" }, { base: "https://c", token: "tok", browser, fetchImpl, feedUrl: "" });
  await fetchCanvasAuto({ course: "X", courseId: "1" }, { base: "https://c", token: "", browser, fetchImpl, feedUrl: "" });
  assert.deepEqual([tokenCalls, browserCalls], [1, 1]);
});

test("parseIcsEvents unescapes backslashes as well as commas, semicolons and newlines", () => {
  const min = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:event-assignment-1", "SUMMARY:a\;b [X]", "DESCRIPTION:a\\\\b\\, c\\nnext", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const [ev] = parseIcsEvents(min);
  assert.equal(ev.description, "a\\b, c\nnext");
  assert.equal(ev.summary, "a;b [X]");
});

test("fetchCanvasAuto keeps the login-failure note short instead of echoing a SAML url", async () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const logged = [];
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => ics });
  const samlUrl = "https://login.microsoftonline.com/x?SAMLRequest=" + "A".repeat(3000);
  const browser = { withPage: async () => { throw new LoginRequiredError(samlUrl); } };
  const out = await fetchCanvasAuto({ course: "MATH 580", courseId: "74998" }, {
    base: "https://canvas.illinois.edu", token: "", browser, fetchImpl, now,
    feedUrl: "https://canvas.illinois.edu/feeds/calendars/user_saml.ics", courses: feedCourses, log: (m) => logged.push(m),
  });
  assert.deepEqual(out.map((a) => a.id), ["canvas:74998:1763420"]);
  assert.ok(out.warning.length < 200, `warning was ${out.warning.length} chars`);
  assert.match(out.warning, /status via login unavailable/);
  assert.match(out.warning, /login\.microsoftonline\.com/);
  assert.doesNotMatch(out.warning, /SAMLRequest/);
  assert.equal(logged.length, 1);
  assert.ok(logged[0].length < 200, `log line was ${logged[0].length} chars`);
  assert.match(logged[0], /login\.microsoftonline\.com/);
});

test("fetchCanvasAuto truncates a non-login session failure to a short note", async () => {
  const now = new Date("2026-09-06T12:00:00Z");
  const logged = [];
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => ics });
  const browser = { withPage: async () => { throw new Error("Canvas 500: " + "B".repeat(3000)); } };
  const out = await fetchCanvasAuto({ course: "RHET 105", courseId: "72592" }, {
    base: "https://canvas.illinois.edu", token: "", browser, fetchImpl, now,
    feedUrl: "https://canvas.illinois.edu/feeds/calendars/user_boom.ics", courses: feedCourses, log: (m) => logged.push(m),
  });
  assert.deepEqual(out.map((a) => a.id), ["canvas:72592:1710786"]);
  assert.ok(out.warning.length < 200, `warning was ${out.warning.length} chars`);
  assert.match(out.warning, /Canvas 500/);
  assert.ok(logged[0].length < 200);
});

test("grades come off the submission: score/points, then the letter grade", () => {
  const [hw, essay, quiz, reading] = parseCanvas(rows, ctx);
  assert.equal(hw.grade, null, "nothing submitted, nothing to show");
  assert.equal(essay.grade, null, "turned in but not scored");
  assert.equal(quiz.grade, "9/10");
  assert.equal(reading.grade, null, "a submission without score or grade");

  const row = (submission, over = {}) => ({ id: 900, name: "Synthetic", html_url: "https://c/a/900", points_possible: 100, submission, ...over });
  const grades = parseCanvas([
    row({ workflow_state: "graded", score: 95.5 }),
    row({ workflow_state: "graded", score: 9.0 }, { points_possible: 10.0 }),
    row({ workflow_state: "graded", score: 0 }, { points_possible: 10 }),
    row({ workflow_state: "graded", score: null, grade: "A" }),
    row({ workflow_state: "graded", score: null, grade: "complete" }),
    row({ workflow_state: "graded", score: null, grade: "  " }),
    row({ workflow_state: "graded", score: 7 }, { points_possible: null }),
  ], ctx).map((a) => a.grade);
  assert.deepEqual(grades, ["95.5/100", "9/10", "0/10", "A", "complete", null, "7"]);
});

test("a score marks work graded even when the workflow state has not caught up", () => {
  const row = (submission) => ({ id: 901, name: "Synthetic", html_url: "https://c/a/901", points_possible: 10, lock_at: "2026-08-01T04:59:59Z", submission });
  const status = (submission) => parseCanvas([row(submission)], ctx)[0].status;
  assert.equal(status({ workflow_state: "pending_review", score: 8 }), "graded", "a score wins over pending_review");
  assert.equal(status({ workflow_state: "pending_review" }), "submitted");
  assert.equal(status({ workflow_state: "unsubmitted", submitted_at: "2026-09-01T00:00:00Z" }), "submitted", "submitted_at alone counts as turned in");
  assert.equal(status({ workflow_state: "unsubmitted", submitted_at: null }), "closed", "past lock_at with nothing handed in");
  assert.equal(status({ workflow_state: "graded", score: null, grade: "A" }), "graded");
});

test("mergeCanvas takes the grade from the session, which is the only side that has one", () => {
  const feed = [
    { id: "canvas:1:10", source: "canvas", course: "A", title: "hw", dueAt: null, details: "", status: "open", grade: null },
    { id: "canvas:1:11", source: "canvas", course: "A", title: "feed only", dueAt: null, details: "", status: "open", grade: null },
  ];
  const session = [{ id: "canvas:1:10", source: "canvas", course: "A", title: "hw", dueAt: null, details: "", status: "graded", grade: "9/10" }];
  const out = mergeCanvas(feed, session);
  assert.equal(out[0].status, "graded");
  assert.equal(out[0].grade, "9/10");
  assert.equal(out[1].grade, null, "a feed-only item has no grade");
});

test("an auto-zero on unsubmitted work is not 'graded' (Canvas missing-work policy)", () => {
  const row = { ...rows[0], id: 999, due_at: "2026-08-20T04:59:59Z", lock_at: "2026-08-20T04:59:59Z", submission: { workflow_state: "unsubmitted", submitted_at: null, score: 0 } };
  const [a] = parseCanvas([row], ctx);
  assert.equal(a.status, "closed", "locked, never turned in");
  assert.equal(a.grade, "0/10", "the zero is still shown as information");
  const [b] = parseCanvas([{ ...row, lock_at: null, due_at: "2026-09-20T04:59:59Z" }], ctx);
  assert.equal(b.status, "open");
});
