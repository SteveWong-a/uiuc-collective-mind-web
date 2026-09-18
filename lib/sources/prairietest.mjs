import { JSDOM, VirtualConsole } from "jsdom";
import { normalize } from "../model.mjs";
import { LoginRequiredError, isLoginUrl } from "../browser.mjs";

// PrairieTest (CBTF exam reservations). Not a course: one login covers every
// course that tests in the CBTF, so a single settings entry
// `{ source: "prairietest" }` feeds items for several courses at once.
const BASE = "https://us.prairietest.com";
export const PRAIRIETEST_URL = `${BASE}/pt`;
export const RESERVATIONS_SELECTOR = 'h2:text-is("Exam reservations")';
// PrairieTest has no login form of its own: its Login button hands off to
// PrairieLearn, which signs the student in from the PrairieLearn session the
// other sources keep alive and bounces back to /pt.
export const PRAIRIETEST_AUTH_URL = "https://us.prairielearn.com/pl/prairietest/auth";
const LOGIN_LINK_SELECTOR = 'a[href*="/pl/prairietest/auth"]';

// Rows mentioning CS 124 are an enrollment error on PrairieTest's side (the
// student is not in CS 124), so they are dropped everywhere: reservations and
// reservable exams alike. Remove this once PrairieTest stops listing them.
const EXCLUDED = /\bCS\s*124\b/i;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// "CS 128 (Fa26): Quiz 2" -> course "CS 128", term "Fa26", title "Quiz 2".
// A cross-listed course reads "ENG 100/101/300/398": the first number is the
// one students know it by, and the one that matches a course chip.
export function splitExam(text) {
  const t = clean(text);
  const m = t.match(/^(.*?)\s*\(([^)]*)\):\s*(.+)$/);
  if (!m) return { course: t, term: null, title: t };
  return { course: m[1].split("/")[0].trim(), term: m[2].trim(), title: m[3].trim() };
}

// The page stamps every date as JSON on the element that formats it, so the
// exact instant is read straight off the attribute — no "6:15pm (CDT)" parsing.
function jsonAttr(el, attr) {
  if (!el) return null;
  try { return JSON.parse(el.getAttribute(attr)); } catch { return null; }
}
const iso = (v) => { const ms = Date.parse(v ?? ""); return Number.isNaN(ms) ? null : new Date(ms).toISOString(); };

function cardByHeading(doc, heading) {
  return [...doc.querySelectorAll(".card")].find((c) => clean(c.querySelector("h2")?.textContent) === heading) ?? null;
}

export function parsePrairieTest(html, { now = new Date() } = {}) {
  const doc = new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
  const assignments = [];
  const reservable = [];

  // "Exam reservations" only — the "Past exam reservations" card is skipped on
  // purpose: a taken exam is not something left to do.
  const upcoming = cardByHeading(doc, "Exam reservations");
  for (const li of upcoming?.querySelectorAll("li.list-group-item") ?? []) {
    const examText = clean(li.querySelector('[data-testid="exam"]')?.textContent);
    if (!examText || EXCLUDED.test(examText)) continue;
    const { course, title } = splitExam(examText);
    const link = li.querySelector('[data-testid="exam"] a[href]');
    const href = link ? new URL(link.getAttribute("href"), BASE).toString() : PRAIRIETEST_URL;
    const idMatch = href.match(/\/reservation\/(\d+)/);
    const dueAt = iso(jsonAttr(li.querySelector("[data-format-date]"), "data-format-date")?.date);
    const locEl = li.querySelector('[data-testid="location"]');
    const room = clean(locEl?.querySelector("small")?.textContent);
    const place = clean([...locEl?.childNodes ?? []].filter((n) => n.nodeName !== "SMALL" && n.nodeName !== "BR").map((n) => n.textContent).join(""));
    const specs = clean(li.querySelector('[data-testid="location"] ~ div')?.textContent).split(/,\s*/).filter(Boolean);
    const [duration, ...rest] = specs;
    const summary = [duration, place].filter(Boolean).join(" · ");
    const details = [summary, room, rest.join(", ")].filter(Boolean).join("\n");
    const status = dueAt && Date.parse(dueAt) < now.getTime() ? "closed" : "open";
    assignments.push(normalize({
      id: `prairietest:reservation:${idMatch ? idMatch[1] : slugOf(examText)}`,
      source: "prairietest",
      course,
      title,
      dueAt,
      openAt: null,
      url: href,
      details,
      status,
      grade: null,
      seenAt: now.toISOString(),
    }));
  }

  const open = cardByHeading(doc, "Exams available for reservations");
  for (const li of open?.querySelectorAll("li.list-group-item") ?? []) {
    const examText = clean(li.querySelector('[data-testid="exam"]')?.textContent);
    if (!examText || EXCLUDED.test(examText)) continue;
    const { course, title } = splitExam(examText);
    const link = li.querySelector('[data-testid="action"] a[href]');
    const url = link ? new URL(link.getAttribute("href"), BASE).toString() : PRAIRIETEST_URL;
    const range = jsonAttr(li.querySelector("[data-format-date-range]"), "data-format-date-range");
    reservable.push({ id: (url.match(/\/exam\/(\d+)/) ?? [])[1] ?? slugOf(examText), course, title, start: iso(range?.start), end: iso(range?.end), url });
  }

  return { assignments, reservable };
}

function slugOf(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

export async function fetchPrairieTest(_cfg, { browser, now = new Date() }) {
  const html = await browser.withPage(PRAIRIETEST_URL, async (page) => {
    // Signed out, /pt is still a 200 "Home" page with a Login button and no
    // password field, so the browser's login-URL check cannot tell it from the
    // real home: only the server-rendered reservations card proves a session.
    // Missing it, follow the handoff once, which signs in on its own whenever
    // PrairieLearn is logged in.
    if (!(await page.$(RESERVATIONS_SELECTOR)) && (await page.$(LOGIN_LINK_SELECTOR))) {
      await page.goto(PRAIRIETEST_AUTH_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    }
    try {
      await page.waitForSelector(RESERVATIONS_SELECTOR, { timeout: 20_000 });
    } catch (e) {
      if (isLoginUrl(page.url()) || (await page.$(LOGIN_LINK_SELECTOR))) throw new LoginRequiredError(page.url());
      throw e;
    }
    return page.content();
  });
  const { assignments, reservable } = parsePrairieTest(html, { now });
  // Having no upcoming reservation is normal (it is the state between exams),
  // so an empty list here is trustworthy, unlike an empty gradebook.
  assignments.trustedEmpty = true;
  assignments.reservable = reservable;
  return assignments;
}
