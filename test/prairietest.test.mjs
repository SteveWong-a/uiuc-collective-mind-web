import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePrairieTest, fetchPrairieTest, PRAIRIETEST_URL, PRAIRIETEST_AUTH_URL, splitExam } from "../lib/sources/prairietest.mjs";
import { LoginRequiredError } from "../lib/browser.mjs";

const load = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const now = new Date("2026-09-06T17:00:00.000Z");

test("splitExam separates course, term and exam title", () => {
  assert.deepEqual(splitExam("CS 128 (Fa26): Quiz 2"), { course: "CS 128", term: "Fa26", title: "Quiz 2" });
  assert.deepEqual(splitExam("ENG 100/101/300/398 (Fa26): Intro to CBTF"), { course: "ENG 100", term: "Fa26", title: "Intro to CBTF" });
  assert.deepEqual(splitExam("CS 124 (Fa26): Q2: Loops and Arrays (Q1 Retakes)"), { course: "CS 124", term: "Fa26", title: "Q2: Loops and Arrays (Q1 Retakes)" });
  assert.deepEqual(splitExam("Weird heading"), { course: "Weird heading", term: null, title: "Weird heading" });
});

test("upcoming reservations become [Test] items with slot, duration and room", () => {
  const { assignments, reservable } = parsePrairieTest(load("prairietest-home.html"), { now });
  assert.deepEqual(assignments.map((a) => a.title), ["Intro to CBTF", "Quiz 2", "Midterm 1", "Quiz 3"]);
  const q2 = assignments.find((a) => a.title === "Quiz 2");
  assert.equal(q2.id, "prairietest:reservation:3576802");
  assert.equal(q2.source, "prairietest");
  assert.equal(q2.course, "CS 128");
  assert.equal(q2.dueAt, "2026-09-11T23:00:00.000Z");
  assert.equal(q2.openAt, null);
  assert.equal(q2.url, "https://us.prairietest.com/pt/student/reservation/3576802");
  assert.equal(q2.status, "open");
  assert.equal(q2.grade, null);
  const lines = q2.details.split("\n");
  assert.equal(lines[0], "50min · CBTF: Grainger Library 057", "first line is the compact summary the UI shows inline");
  assert.equal(lines[1], "Room 057 in the basement of Grainger Library");
  assert.equal(lines[2], "In-person, No accommodations");
  const eng = assignments.find((a) => a.title === "Intro to CBTF");
  assert.equal(eng.course, "ENG 100");
  assert.equal(eng.dueAt, "2026-09-08T23:15:00.000Z");
  // "Past exam reservations" (three rows in the fixture) are never read.
  assert.ok(!assignments.some((a) => /Proficiency|Quiz 1$/.test(a.title)));
  // Both reservable exams on the page are CS 124, which is filtered out.
  assert.deepEqual(reservable, []);
});

test("reservable exams are listed with their window, minus anything CS 124", () => {
  const html = load("prairietest-home.html").replace(/CS 124 \(Fa26\): Q3: Functions \(Q2 Retakes\)/g, "MATH 257 (Fa26): Midterm 2");
  const { reservable } = parsePrairieTest(html, { now });
  assert.deepEqual(reservable, [{
    id: "76709",
    course: "MATH 257",
    title: "Midterm 2",
    start: "2026-09-14T05:01:00.000Z",
    end: "2026-09-16T04:59:00.000Z",
    url: "https://us.prairietest.com/pt/student/exam/76709",
  }]);
});

test("a CS 124 reservation is dropped too", () => {
  const html = load("prairietest-home.html").replace("MATH 257 (Fa26): Midterm 1", "CS 124 (Fa26): Q1: Variables");
  const { assignments } = parsePrairieTest(html, { now });
  assert.deepEqual(assignments.map((a) => a.title), ["Intro to CBTF", "Quiz 2", "Quiz 3"]);
});

test("a reservation whose slot has passed is closed, not open", () => {
  const { assignments } = parsePrairieTest(load("prairietest-home.html"), { now: new Date("2026-09-12T12:00:00.000Z") });
  assert.equal(assignments.find((a) => a.title === "Quiz 2").status, "closed");
  assert.equal(assignments.find((a) => a.title === "Quiz 3").status, "open");
});

test("no reservations and no reservable exams is a real, trusted empty result", () => {
  const html = load("prairietest-home.html").replace(/<li class="list-group-item">[\s\S]*?<\/li>/g, "");
  const { assignments, reservable } = parsePrairieTest(html, { now });
  assert.deepEqual(assignments, []);
  assert.deepEqual(reservable, []);
});

// A fake Playwright page over `pages` (URL -> HTML). Selectors are answered by
// grepping the HTML for the two things the fetcher asks about: the reservations
// heading and the Login link. `handoff(pages)` says where the PrairieLearn
// sign-in handoff lands, so each test can model one outcome of it.
function fakeBrowser(pages, handoff = () => PRAIRIETEST_URL) {
  const visited = [];
  let url;
  const has = (sel) => (/Exam reservations/.test(sel) ? /<h2[^>]*>\s*Exam reservations\s*</.test(pages[url] ?? "") : /prairietest\/auth/.test(pages[url] ?? ""));
  const page = {
    url: () => url,
    goto: async (u) => { url = u === PRAIRIETEST_AUTH_URL ? handoff(pages) : u; visited.push(u); },
    waitForLoadState: async () => {},
    $: async (sel) => (has(sel) ? {} : null),
    waitForSelector: async (sel) => { if (!has(sel)) throw new Error(`page.waitForSelector: Timeout 20000ms exceeded.\n  - waiting for locator('${sel}') to be visible`); },
    content: async () => pages[url] ?? "",
  };
  const browser = { withPage: async (start, fn) => { await page.goto(start); return fn(page); } };
  return { browser, visited };
}

test("fetchPrairieTest reads the reservations card straight off a signed-in home page", async () => {
  const { browser, visited } = fakeBrowser({ [PRAIRIETEST_URL]: load("prairietest-home.html") });
  const out = await fetchPrairieTest({ course: "CBTF" }, { browser, now });
  assert.deepEqual(visited, [PRAIRIETEST_URL], "no detour through the PrairieLearn handoff when already signed in");
  assert.equal(out.length, 4);
  assert.equal(out.trustedEmpty, true, "an empty reservations list is legitimate, not a half-rendered page");
  assert.deepEqual(out.reservable, []);
});

test("fetchPrairieTest signs in through the PrairieLearn handoff when /pt is the anonymous home", async () => {
  // A live PrairieLearn session: the handoff bounces back to /pt, now signed in.
  const { browser, visited } = fakeBrowser({ [PRAIRIETEST_URL]: load("prairietest-anon.html") }, (pages) => { pages[PRAIRIETEST_URL] = load("prairietest-home.html"); return PRAIRIETEST_URL; });
  const out = await fetchPrairieTest({ course: "CBTF" }, { browser, now });
  assert.deepEqual(visited, [PRAIRIETEST_URL, PRAIRIETEST_AUTH_URL]);
  assert.equal(out.length, 4);
  assert.equal(out.trustedEmpty, true);
});

test("fetchPrairieTest reports needs-login when the handoff parks on PrairieLearn's login page", async () => {
  const login = "https://us.prairielearn.com/pl/login";
  const { browser } = fakeBrowser({ [PRAIRIETEST_URL]: load("prairietest-anon.html"), [login]: "<html><body><h1>Sign in</h1></body></html>" }, () => login);
  await assert.rejects(fetchPrairieTest({ course: "CBTF" }, { browser, now }), (e) => e instanceof LoginRequiredError && e.url === login);
});

test("fetchPrairieTest reports needs-login when the handoff lands back on the anonymous home", async () => {
  const { browser } = fakeBrowser({ [PRAIRIETEST_URL]: load("prairietest-anon.html") });
  await assert.rejects(fetchPrairieTest({ course: "CBTF" }, { browser, now }), (e) => e instanceof LoginRequiredError && e.url === PRAIRIETEST_URL);
});
