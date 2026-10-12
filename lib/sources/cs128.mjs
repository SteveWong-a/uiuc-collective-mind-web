import { JSDOM, VirtualConsole } from "jsdom";
import { normalize, zonedToISO, inferYear, TZ } from "../model.mjs";
import { slug } from "./prairielearn.mjs";

const BASE = "https://cs128.org";
export const GRADEBOOK_URL = "https://cs128.org/my/gradebook";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Parses "Due Mon D[, YYYY]" -> 23:59 America/Chicago that day. Returns ISO string or null.
export function parseDueDate(text, now = new Date()) {
  const t = String(text ?? "").trim();
  const m = t.match(/^Due\s+([A-Za-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/i);
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = m[3] ? Number(m[3]) : inferYear(month, day, now);
  return zonedToISO({ year, month, day, hour: 23, minute: 59 }, TZ);
}

export function parseGradebook(html, { course, now = new Date() }) {
  const doc = new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
  const out = [];
  for (const tr of doc.querySelectorAll("table tr")) {
    const tds = tr.querySelectorAll("td");
    if (!tds.length) continue;
    const firstTd = tds[0];
    const titleEl = firstTd.querySelector(".fw-semibold");
    if (!titleEl) continue;
    const dueDiv = [...firstTd.querySelectorAll("div")].find((d) => /^Due\s/i.test(d.textContent.trim()));
    if (!dueDiv) continue;

    const title = titleEl.textContent.replace(/\s+/g, " ").trim();
    const dueAt = parseDueDate(dueDiv.textContent.trim(), now);

    const scoreCell = tds[1] ? tds[1].textContent.replace(/\s+/g, " ").trim() : "";
    const percentCell = tds[2] ? tds[2].textContent.replace(/\s+/g, " ").trim() : "";
    const percent = Number.parseFloat(percentCell);

    const link = [...tr.querySelectorAll("a[href]")].find((a) => !a.getAttribute("href").startsWith("#"));
    const url = link ? new URL(link.getAttribute("href"), BASE).toString() : GRADEBOOK_URL;

    // cs128 gives no credit after the due date, so a past-due lesson with
    // nothing earned is closed: not worth nagging about, never overdue.
    let status;
    if (!Number.isNaN(percent) && percent >= 100) status = "graded";
    else if (!Number.isNaN(percent) && percent > 0) status = "submitted";
    else status = "open";
    if (dueAt != null && Date.parse(dueAt) < now.getTime() && status === "open") status = "closed";

    // The numbers exactly as the gradebook prints them ("100.00/100.00 (100.00%)").
    // A zero on work that is merely open or already closed means "not handed in",
    // so it stays in the details instead of masquerading as a grade.
    const nothingEarned = !(Number.parseFloat(scoreCell) > 0) && (status === "open" || status === "closed");
    const grade = scoreCell && percentCell && !nothingEarned ? percentCell : null;

    out.push(normalize({
      id: `cs128:lesson:${slug(title)}`,
      source: "cs128",
      course,
      title,
      dueAt,
      url,
      details: `Score ${scoreCell} (${percentCell})`,
      status,
      grade,
      seenAt: now.toISOString(),
    }));
  }
  return out;
}

// CS 128 loads the lessons table dynamically via an AJAX loader, but has an
// attendance table already in the shell HTML. The attendance table is marked
// with data-sortable-table and does not live inside a gb_table_* accordion.
// Waiting specifically for the lessons table prevents prematurely returning
// 0 items before the asynchronous gradebook payload finishes rendering.
export const GRADEBOOK_TABLE_SELECTOR = 'div[id^="gb_table_"] table .fw-semibold, .portal-card table:not([data-sortable-table]) .fw-semibold';

export async function fetchCs128({ course }, { browser, now = new Date() }) {
  const gradebookHtml = await browser.withPage(GRADEBOOK_URL, async (page) => {
    try {
      await page.waitForSelector(GRADEBOOK_TABLE_SELECTOR, { timeout: 20_000 });
    } catch (err) {
      // If we time out, it's very likely the session expired and we're looking
      // at a generic "Please log in" screen that our URL-based detector missed.
      const text = await page.evaluate(() => document.body.textContent);
      if (/log\s*in|sign\s*in/i.test(text)) {
        const { LoginRequiredError } = await import("../browser.mjs");
        throw new LoginRequiredError(page.url());
      }
      throw err;
    }
    return page.content();
  });
  // Only the gradebook. cs128.org's calendar feed used to be read too, but it
  // holds nothing except CBTF quiz windows, which PrairieTest covers with the
  // actual reserved slot.
  return parseGradebook(gradebookHtml, { course, now });
}
