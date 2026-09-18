import { JSDOM, VirtualConsole } from "jsdom";
import { normalize, zonedToISO, TZ } from "../model.mjs";
import { LoginRequiredError, isLoginUrl } from "../browser.mjs";

export function SMARTPHYSICS_URL(enrollmentId) {
  return `https://smart.physics.illinois.edu/Course?enrollmentID=${enrollmentId}`;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function slug(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseDateText(text, year) {
  const m = text.match(/([A-Za-z]+)\.?\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i);
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  let hour = Number(m[3]);
  const minute = Number(m[4]);
  const ampm = m[5].toUpperCase();
  if (ampm === "AM") hour = hour % 12;
  else if (ampm === "PM") hour = (hour % 12) + 12;
  
  return zonedToISO({ year, month, day, hour, minute }, TZ);
}

export function parseSmartPhysics(html, { course, enrollmentId, now = new Date() }) {
  const doc = new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;
  const titleEl = doc.querySelector("title");
  let year = now.getFullYear();
  if (titleEl) {
    const m = titleEl.textContent.match(/\b(20\d{2})\b/);
    if (m) year = Number(m[1]);
  }

  const out = [];
  const units = doc.querySelectorAll(".accordion-body.unit");
  for (const unit of units) {
    const unitTitleEl = unit.querySelector("h3 button .UnitTitle");
    const unitTitle = unitTitleEl ? unitTitleEl.textContent.trim() : "";

    const items = unit.querySelectorAll(".unit-assignment");
    for (const item of items) {
      const titleEl = item.querySelector(".unit-assignment-title");
      if (!titleEl) continue;
      const titleText = titleEl.textContent.trim();
      const title = `${unitTitle}: ${titleText}`.replace(/^:\s*/, "");
      
      const a = titleEl.querySelector("a");
      const url = a ? new URL(a.getAttribute("href"), "https://smart.physics.illinois.edu").toString() : SMARTPHYSICS_URL(enrollmentId);

      let dueAt = null;
      let creditLine = null;
      const duedateEl = item.querySelector(".duedate");
      if (duedateEl) {
        creditLine = duedateEl.textContent.trim().replace(/\s+/g, " ");
        const dueStrMatch = creditLine.match(/Due:\s*(.*?)(?:\s*for \d+% credit)?$/i);
        if (dueStrMatch) {
          dueAt = parseDateText(dueStrMatch[1].trim(), year);
        }
      }

      const bar = item.querySelector(".scorebars .bar");
      let scoreVal = null;
      let scoreText = null;
      if (bar) {
        const val = bar.getAttribute("aria-valuenow");
        if (val != null) {
          scoreVal = Number(val);
          scoreText = `${val}%`;
        }
      }

      let status;
      if (scoreVal != null && scoreVal >= 100) status = "graded";
      else if (scoreVal != null && scoreVal > 0) status = "submitted";
      else if (dueAt != null && Date.parse(dueAt) < now.getTime()) status = "closed";
      else status = "open";

      const grade = (scoreVal == null || (scoreVal === 0 && status !== "submitted" && status !== "graded")) ? null : scoreText;
      const details = [
        creditLine || null,
        scoreText ? `Score: ${scoreText}` : null
      ].filter(Boolean).join("\n");

      out.push(normalize({
        id: `smartphysics:${enrollmentId}:${slug(unitTitle)}:${slug(titleText)}`,
        source: "smartphysics",
        course,
        title,
        dueAt,
        url,
        details,
        status,
        grade,
        seenAt: now.toISOString(),
      }));
    }
  }
  return out;
}

export async function fetchSmartPhysics({ course, enrollmentId }, { browser, now = new Date() }) {
  const url = SMARTPHYSICS_URL(enrollmentId);
  const html = await browser.withPage(url, async (page) => {
    const curUrl = page.url();
    if (isLoginUrl(curUrl) || /lassso|shibboleth|login|logon|account/i.test(curUrl)) {
      throw new LoginRequiredError(curUrl);
    }
    try {
      await page.waitForSelector(".accordion-body.unit", { timeout: 15_000 });
    } catch (e) {
      const finalUrl = page.url();
      if (isLoginUrl(finalUrl) || /lassso|shibboleth|login|logon|account/i.test(finalUrl) || !finalUrl.includes("smart.physics.illinois.edu/Course")) {
        throw new LoginRequiredError(finalUrl);
      }
      throw e;
    }
    return page.content();
  });
  return parseSmartPhysics(html, { course, enrollmentId, now });
}
