import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const item = (over = {}) => ({ id: "pl:1:hw1", source: "prairielearn", course: "CS 173", title: "HW1", dueAt: "2099-09-10T04:59:00.000Z", openAt: null, url: "https://us.prairielearn.com/x", details: "", status: "open", grade: null, seenAt: "t", ...over });

const baseState = (over = {}) => ({
  settings: { courses: [{ course: "CS 173", source: "prairielearn", instanceId: "1" }], pollMinutes: 30, canvasFeedUrl: "", google: { clientId: "" } },
  assignments: [],
  sources: {},
  changes: [],
  log: [],
  google: { connected: true },
  polling: false,
  lastPoll: "2026-09-03T12:00:00.000Z",
  nextPoll: "2026-09-03T12:30:00.000Z",
  ...over,
});

// Loads the real page and hands it a state over a stubbed EventSource, exactly
// the way the server does. Evaluating the inline script is also its syntax check.
function mount(state) {
  const dom = new JSDOM(html, { runScripts: "outside-only", virtualConsole: new VirtualConsole(), url: "http://course.localhost/" });
  const { window } = dom;
  const listeners = new Map();
  window.EventSource = class {
    constructor() { this.onerror = null; }
    addEventListener(type, fn) { listeners.set(type, fn); }
    close() {}
  };
  window.fetch = async () => ({ ok: true, json: async () => ({}) });
  window.eval(script);
  listeners.get("state")({ data: JSON.stringify(state) });
  return window;
}

const rows = (window, sel) => [...window.document.querySelectorAll(`${sel} .item`)];
const cell = (row, sel) => row.querySelector(sel);

test("the inline script parses and renders a state", () => {
  const window = mount(baseState({ assignments: [item()] }));
  try {
    assert.equal(rows(window, "#upcoming").length, 1);
    assert.match(window.document.querySelector("#upcoming .title a").textContent, /HW1/);
  } finally { window.close(); }
});

test("each status has its own glyph, titled, with graded set in bold", () => {
  const window = mount(baseState({
    assignments: [
      item({ id: "a", title: "open one", status: "open" }),
      item({ id: "b", title: "submitted one", status: "submitted" }),
      item({ id: "c", title: "graded one", status: "graded", grade: "9/10" }),
      item({ id: "d", title: "closed one", status: "closed" }),
    ],
  }));
  try {
    const glyphs = rows(window, "#upcoming").map((r) => cell(r, ".glyph"));
    assert.deepEqual(glyphs.map((g) => g.textContent), ["○", "✓", "✓", "⊘"]);
    for (const g of glyphs) assert.ok(g.getAttribute("title"), "every glyph explains itself");
    assert.match(glyphs[2].getAttribute("title"), /graded/i);
    assert.ok(glyphs[2].classList.contains("graded"), "the graded check is marked so CSS can bold it");
    assert.ok(!glyphs[1].classList.contains("graded"));
    assert.match(html, /\.glyph\.graded\s*\{[^}]*font-weight:\s*(700|800|bold)/, "and the CSS actually bolds it");
  } finally { window.close(); }
});

test("done work keeps its strike-through and shows the grade after the time", () => {
  const window = mount(baseState({
    assignments: [
      item({ id: "a", title: "graded one", status: "graded", grade: "9/10" }),
      item({ id: "b", title: "no grade", status: "graded", grade: null }),
      item({ id: "c", title: "still open", status: "open" }),
    ],
  }));
  try {
    const [graded, ungraded, open] = rows(window, "#upcoming");
    assert.ok(graded.classList.contains("done"), "graded work stays struck through");
    assert.equal(cell(graded, ".grade").textContent, "9/10");
    assert.equal(cell(ungraded, ".grade").textContent, "", "graded with no grade text shows nothing extra");
    assert.equal(cell(open, ".grade").textContent, "");
    // The grade sits after the time column, in ink rather than the muted grey.
    assert.equal(graded.querySelector(".time").nextElementSibling, cell(graded, ".grade"));
    assert.match(html, /\.grade\s*\{[^}]*color:\s*var\(--ink\)/);
  } finally { window.close(); }
});

test("past work shows its grade too", () => {
  const window = mount(baseState({ assignments: [item({ dueAt: "2020-01-02T04:59:00.000Z", status: "graded", grade: "110%" })] }));
  try {
    assert.equal(rows(window, "#upcoming").length, 0);
    const [past] = rows(window, "#past");
    assert.equal(cell(past, ".grade").textContent, "110%");
    assert.ok(past.classList.contains("done"));
  } finally { window.close(); }
});

test("overdue work that can still be turned in sits under Today with a negative countdown", () => {
  const window = mount(baseState({
    assignments: [
      item({ id: "late", title: "missed one", dueAt: "2020-01-02T05:59:00.000Z", status: "open" }),
      item({ id: "closed", title: "closed one", dueAt: "2020-01-02T05:59:00.000Z", status: "closed" }),
      item({ id: "soon", title: "future one", status: "open" }),
    ],
  }));
  try {
    const days = [...window.document.querySelectorAll("#upcoming .day")];
    assert.equal(days.length, 2);
    assert.ok(days[0].classList.contains("today"), "overdue work heads the list, under Today");
    assert.equal(days[0].querySelector(".wd").textContent, "Today");
    const [late] = rows(window, "#upcoming .day.today");
    assert.match(cell(late, ".title").textContent, /missed one/);
    assert.ok(cell(late, ".flag"), "still flagged overdue");
    assert.match(cell(late, ".time").textContent, /^11:59 PM -\d+ d$/, "same time cell as everything else, counted down past zero");
    assert.deepEqual(rows(window, "#past").map((r) => cell(r, ".title").textContent.trim()), ["closed one"], "closed work cannot be turned in, so it stays in Past");
  } finally { window.close(); }
});

test("past-due work with 0/100 or details zero score is marked overdue, while empty score is not", () => {
  const window = mount(baseState({
    assignments: [
      item({ id: "cs128_missed", title: "CS128 Ref Passing", dueAt: "2020-01-02T05:59:00.000Z", status: "closed", grade: null, details: "Score 0.00/100.00 (0.00%)" }),
      item({ id: "canvas_zero", title: "Canvas Zero", dueAt: "2020-01-02T05:59:00.000Z", status: "graded", grade: "0/100" }),
      item({ id: "te200_pending", title: "TE200 Submitted", dueAt: "2020-01-02T05:59:00.000Z", status: "graded", grade: null }),
    ],
  }));
  try {
    const upcomingRows = rows(window, "#upcoming");
    assert.equal(upcomingRows.length, 2, "0/100 and details zero score go to upcoming as overdue");
    assert.match(cell(upcomingRows[0], ".title").textContent, /CS128 Ref Passing/);
    assert.ok(cell(upcomingRows[0], ".flag"), "CS128 item has overdue flag");
    assert.equal(cell(upcomingRows[0], ".grade").textContent, "0.00%", "extracts display grade from details");
    assert.ok(!upcomingRows[0].classList.contains("done"), "overdue work is not marked done with strikethrough");

    assert.match(cell(upcomingRows[1], ".title").textContent, /Canvas Zero/);
    assert.ok(cell(upcomingRows[1], ".flag"), "Canvas zero item has overdue flag");
    assert.equal(cell(upcomingRows[1], ".grade").textContent, "0/100");
    assert.ok(!upcomingRows[1].classList.contains("done"), "overdue canvas work is not struck through");

    const pastRows = rows(window, "#past");
    assert.equal(pastRows.length, 1, "graded work with empty score stays in past");
    assert.match(cell(pastRows[0], ".title").textContent, /TE200 Submitted/);
    assert.ok(!pastRows[0].querySelector(".flag"), "empty score work has no overdue flag");
  } finally { window.close(); }
});

test("grades are escaped like every other string from a site", () => {
  const window = mount(baseState({ assignments: [item({ status: "graded", grade: '<img src=x onerror="boom">' })] }));
  try {
    const [row] = rows(window, "#upcoming");
    assert.equal(cell(row, ".grade").textContent, '<img src=x onerror="boom">');
    assert.equal(row.querySelector("img"), null, "the grade is text, never markup");
  } finally { window.close(); }
});

test("the changes feed reads graded: 9/10", () => {
  const window = mount(baseState({
    changes: [
      { type: "status_changed", id: "a", course: "CS 173", title: "HW1", from: "submitted", to: "graded", grade: "9/10", at: "2026-09-03T12:00:00.000Z" },
      { type: "status_changed", id: "b", course: "CS 173", title: "HW2", from: "open", to: "submitted", grade: null, at: "2026-09-03T12:00:00.000Z" },
      { type: "status_changed", id: "c", course: "CS 173", title: "HW3", from: "submitted", to: "graded", grade: null, at: "2026-09-03T12:00:00.000Z" },
    ],
  }));
  try {
    const what = [...window.document.querySelectorAll("#changes .what")].map((e) => e.textContent);
    assert.match(what[0], /graded: 9\/10/);
    assert.match(what[1], /submitted/);
    assert.doesNotMatch(what[1], /:\s*null/);
    assert.match(what[2], /graded/);
    assert.doesNotMatch(what[2], /graded:/, "no grade, no colon");
  } finally { window.close(); }
});

const notices = (window) => [...window.document.querySelectorAll("#banners .notice")].map((n) => n.textContent);

test("the header reports both halves of Google", () => {
  const window = mount(baseState({
    sources: { google: { state: "ok", message: "tasks: +1 ~0 -0", at: "t" }, googleCalendar: { state: "ok", message: "blocks: +2 ~0 -1", at: "t" } },
  }));
  try {
    const status = window.document.querySelector("#gstatus").textContent;
    assert.match(status, /Google Tasks synced/);
    assert.match(status, /Calendar blocks ok/);
    assert.equal(window.document.querySelectorAll("#sources .src").length, 0, "Google is a header status, not a source row");
  } finally { window.close(); }
});

test("a calendar-blocks failure names the one fix", () => {
  const window = mount(baseState({
    sources: { googleCalendar: { state: "error", message: "Google Calendar needs re-consent: click Disconnect, then Connect Google again", at: "t" } },
  }));
  try {
    const found = notices(window).filter((t) => /re-consent/.test(t));
    assert.equal(found.length, 1);
    assert.match(found[0], /Disconnect, then Connect Google again/);
    assert.match(window.document.querySelector("#gstatus").textContent, /Calendar blocks/);
  } finally { window.close(); }
});

test("every source failing on the network is one offline notice, not five", () => {
  const window = mount(baseState({
    assignments: [item()],
    sources: {
      "prairielearn:1": { state: "error", message: "fetch failed", at: "t", count: 3 },
      "canvas:2": { state: "error", message: "page.goto: net::ERR_INTERNET_DISCONNECTED at https://canvas.illinois.edu", at: "t", count: 2 },
      cs128: { state: "error", message: "getaddrinfo ENOTFOUND cs128.org", at: "t", count: 1 },
      google: { state: "error", message: "fetch failed", at: "t" },
      googleCalendar: { state: "error", message: "fetch failed", at: "t" },
    },
  }));
  try {
    const all = notices(window);
    assert.equal(all.length, 1, "one notice for one fact");
    assert.match(all[0], /Offline — showing what was pulled at/);
    assert.ok(window.document.querySelector("#banners .notice").classList.contains("soft"), "offline is a note, not an alarm");
    assert.equal(window.document.querySelectorAll("#sources .src").length, 3, "the sources list still shows each one");
    assert.equal(rows(window, "#upcoming").length, 1, "and the last pull is still on screen");
  } finally { window.close(); }
});

test("a real failure is still reported per source, offline or not", () => {
  const window = mount(baseState({
    sources: {
      "prairielearn:1": { state: "error", message: "fetch failed", at: "t", count: 3 },
      "canvas:2": { state: "error", message: "Canvas feed 500", at: "t", count: 2 },
    },
  }));
  try {
    const all = notices(window);
    assert.equal(all.length, 2, "not every source is offline, so each error speaks for itself");
    assert.ok(all.some((t) => /Canvas feed 500/.test(t)));
    assert.ok(!all.some((t) => /Offline/.test(t)));
  } finally { window.close(); }
});

test("the settings dialog carries the evening block fields", async () => {
  const window = mount(baseState({ settings: { ...baseState().settings, blockStartHour: 19, blockEndHour: 22, blockWithinHours: 48, taskLeadDays: 3 } }));
  try {
    const dialog = window.document.querySelector("#settings");
    dialog.showModal = () => { dialog.open = true; };   // jsdom has no modal dialogs
    dialog.close = () => { dialog.open = false; };
    window.document.querySelector("#settingsbtn").onclick();
    assert.ok(dialog.open, "the dialog actually opens");
    const f = window.document.querySelector("#sform").elements;
    assert.equal(f.blockStartHour.value, "19");
    assert.equal(f.blockEndHour.value, "22");
    assert.equal(f.blockWithinHours.value, "48");
    let sent = null;
    window.fetch = async (url, opts) => { sent = JSON.parse(opts.body); return { ok: true, json: async () => ({}) }; };
    f.blockStartHour.value = "20";
    await window.document.querySelector("#sform").onsubmit({ preventDefault() {}, target: window.document.querySelector("#sform") });
    assert.deepEqual([sent.blockStartHour, sent.blockEndHour, sent.blockWithinHours], [20, 22, 48]);
  } finally { window.close(); }
});

const testItem = (over = {}) => item({ id: "prairietest:reservation:1", source: "prairietest", course: "CS 128", title: "Quiz 2", url: "https://us.prairietest.com/pt/student/reservation/1", details: "50min · CBTF: Grainger Library 057\nRoom 057 in the basement of Grainger Library\nIn-person, No accommodations", ...over });
const ptState = (over = {}) => baseState({ settings: { courses: [{ course: "CS 128", source: "cs128" }, { course: "CBTF", source: "prairietest" }], pollMinutes: 30, canvasFeedUrl: "", google: { clientId: "" } }, ...over });

test("a CBTF reservation is marked [Test] and shows its duration and room inline, upcoming and past", () => {
  const window = mount(ptState({ assignments: [testItem(), testItem({ id: "prairietest:reservation:0", title: "Quiz 1", dueAt: "2026-09-04T21:15:00.000Z", status: "closed" }), item()] }));
  try {
    const [hw, test] = [rows(window, "#upcoming").find((r) => /HW1/.test(r.textContent)), rows(window, "#upcoming").find((r) => /Quiz 2/.test(r.textContent))];
    assert.equal(cell(test, ".kind").textContent, "[Test]");
    assert.equal(cell(hw, ".kind"), null, "homework carries no test mark");
    assert.equal(cell(test, ".meta").textContent, "50min · CBTF: Grainger Library 057");
    assert.match(cell(test, ".course").textContent, /CS 128/);
    const past = window.document.querySelector("#past");
    assert.match(past.textContent, /\[Test\]/, "past reservations keep the mark");
    assert.match(past.textContent, /Quiz 1/);
  } finally { window.close(); }
});

test("the PrairieTest entry is not a course chip; its items still filter under their own course", () => {
  const window = mount(ptState({ assignments: [testItem()] }));
  try {
    const chips = [...window.document.querySelectorAll(".chip")].map((c) => c.textContent);
    assert.deepEqual(chips, ["All courses", "CS 128"]);
    window.document.querySelector('.chip[data-c="CS 128"]').click();
    assert.equal(rows(window, "#upcoming").length, 1, "the reservation shows under CS 128");
  } finally { window.close(); }
});

test("exams open for reservation are listed above Sources with a Reserve link, and PrairieTest is named", () => {
  const sources = { prairietest: { state: "ok", message: "1 items", at: "t", count: 1, reservable: [{ id: "9", course: "MATH 257", title: "Midterm 2", start: "2026-09-14T05:01:00.000Z", end: "2026-09-16T04:59:00.000Z", url: "https://us.prairietest.com/pt/student/exam/9" }] } };
  const window = mount(ptState({ sources }));
  try {
    const panel = window.document.querySelector("#reservable");
    assert.ok(panel, "panel exists");
    assert.ok(panel.compareDocumentPosition(window.document.querySelector("#sources")) & window.Node.DOCUMENT_POSITION_FOLLOWING, "sits above Sources");
    assert.match(panel.textContent, /MATH 257/);
    assert.match(panel.textContent, /Midterm 2/);
    assert.match(panel.textContent, /Sep 14/);
    assert.match(panel.textContent, /Sep 15/, "the window's last day, not the exclusive end");
    const link = panel.querySelector("a");
    assert.equal(link.textContent, "Reserve");
    assert.equal(link.getAttribute("href"), "https://us.prairietest.com/pt/student/exam/9");
    assert.match(window.document.querySelector("#sources").textContent, /PrairieTest/);
  } finally { window.close(); }
});

test("with nothing to reserve the panel says so", () => {
  const window = mount(ptState({ sources: { prairietest: { state: "ok", message: "0 items", at: "t", count: 0, reservable: [] } } }));
  try { assert.match(window.document.querySelector("#reservable").textContent, /Nothing to reserve/); } finally { window.close(); }
});

test("hide overdue toggle removes overdue work from upcoming", () => {
  const window = mount(baseState({
    assignments: [
      item({ id: "1", title: "Past Due Work", dueAt: "2026-09-01T17:00:00.000Z", status: "open", details: "Score: 0.0/100.0" }),
      item({ id: "2", title: "Future Work", dueAt: "2026-09-20T17:00:00.000Z", status: "open" }),
    ]
  }));
  try {
    assert.equal(rows(window, "#upcoming").length, 2, "both future and overdue initially show in upcoming");
    const toggle = window.document.querySelector("#hide-overdue-toggle");
    assert.ok(toggle, "toggle exists");
    toggle.checked = true;
    toggle.onchange({ target: toggle });
    assert.equal(rows(window, "#upcoming").length, 1, "only future work shows after hiding overdue");
    assert.match(rows(window, "#upcoming")[0].textContent, /Future Work/);
    assert.ok(!window.document.querySelector("#upcoming .flag"), "no overdue flags remaining");
  } finally { window.close(); }
});
