import { normalize, zonedToISO, inferYear, TZ } from "../model";

const BASE = "https://us.prairielearn.com";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function slug(s: any) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function assessmentsUrl(instanceId: string | number) {
  return `${BASE}/pl/course_instance/${instanceId}/assessments`;
}

// Parses "HH:MM, [Weekday, ]Mon D[, YYYY]" or "H:MM AM/PM, [Weekday, ]Mon D[, YYYY]" (optionally
// with trailing junk like " (CDT)"), Chicago time. Returns ISO string or null if it doesn't match.
export function parseDateText(text: any, now = new Date()) {
  const t = String(text ?? "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*,\s*(?:([A-Za-z]+)\s*,\s*)?([A-Za-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "AM") hour = hour % 12;
  else if (ampm === "PM") hour = (hour % 12) + 12;
  const month = MONTHS[m[5].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(m[6]);
  const year = m[7] ? Number(m[7]) : inferYear(month, day, now);
  return zonedToISO({ year, month, day, hour, minute }, TZ);
}

// Parses a credit-line cell like "100% until 08:00, Tue, Sep 8" (or "100%" / "" with no deadline).
export function parseCreditText(text: any, now = new Date()) {
  const details = String(text ?? "").replace(/\s+/g, " ").trim();
  const m = details.match(/until\s+(.+)$/i);
  const dueAt = m ? parseDateText(m[1], now) : null;
  return { dueAt, details };
}

export interface AccessRow {
  credit: number | null;
  start: string | null;
  end: string | null;
}

// Parses the (already html-unescaped) access-details popover table:
// rows of Credit | Start | End, timestamps "YYYY-MM-DD HH:MM:SS (CDT|CST)".
export function parseAccessTable(html: string): AccessRow[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  const rows: AccessRow[] = [];
  for (const tr of doc.querySelectorAll("tr")) {
    const cells = [...tr.querySelectorAll("td")];
    if (cells.length < 3) continue; // header row (th) or malformed
    const creditText = (cells[0].textContent || "").trim();
    const credit = /none/i.test(creditText) ? null : Number.parseInt(creditText, 10);
    const start = parseAccessTimestamp((cells[1].textContent || "").trim());
    const end = parseAccessTimestamp((cells[2].textContent || "").trim());
    rows.push({ credit, start, end });
  }
  return rows;
}

function parseAccessTimestamp(text: string) {
  const m = String(text).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, year, month, day, hour, minute, second] = m.map(Number);
  return zonedToISO({ year, month, day, hour, minute, second }, TZ);
}

// Among access-table rows offering full (>=100%) credit, pick the one that matters right now:
// the soonest one that hasn't ended yet, or (if all have already ended) the most recent one.
function pickDueRow(eligibleRows: AccessRow[], now: Date): AccessRow | null {
  const nowMs = now.getTime();
  let best: AccessRow | null = null;
  for (const row of eligibleRows) {
    if (!row.end) continue;
    const endMs = Date.parse(row.end);
    if (endMs >= nowMs && (!best || !best.end || endMs < Date.parse(best.end))) best = row;
  }
  if (best) return best;
  for (const row of eligibleRows) {
    if (!row.end) continue;
    if (!best || !best.end || Date.parse(row.end) > Date.parse(best.end)) best = row;
  }
  return best;
}

function fmtChicago(iso: string | null) {
  if (!iso) return "?"; // an access row whose timestamp we could not parse
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("month")} ${get("day")} ${get("hour")}:${get("minute")}`;
}

function rowTitle(td: Element) {
  const link = td.querySelector("a");
  const el = link ?? td;
  const clone = el.cloneNode(true) as Element;
  for (const icon of clone.querySelectorAll("i")) icon.remove();
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function rowCreditLine(td: Element) {
  const clone = td.cloneNode(true) as Element;
  const btn = clone.querySelector("button");
  if (btn) btn.remove();
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

function rowScore(td: Element) {
  const bar = td.querySelector('[data-testid="scorebar"]');
  const text = ((bar ?? td).textContent || "").replace(/\s+/g, " ").trim();
  if (!text || /not started/i.test(text)) return { text: text || "Not started", value: null };
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return { text, value: m ? Number(m[1]) : null };
}

export function parsePrairieLearn(html: string, { course, instanceId, now = new Date() }: any) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [];
  for (const tr of doc.querySelectorAll('table[aria-label="Assessments"] tr')) {
    const badge = tr.querySelector('[data-testid="assessment-set-badge"]');
    if (!badge) continue;
    const label = (badge.textContent || "").replace(/\s+/g, " ").trim();
    const tds = tr.querySelectorAll("td");
    if (tds.length < 4) continue; // spacer/group row that happens to carry a badge
    const [, titleTd, creditTd, scoreTd] = tds;
    const cellTitle = rowTitle(titleTd);
    const title = `${label} ${cellTitle}`.replace(/\s+/g, " ").trim();

    const link = titleTd.querySelector("a");
    const href = link?.getAttribute("href");
    const url = href ? new URL(href, BASE).toString() : assessmentsUrl(instanceId);

    const button = creditTd.querySelector("button[data-bs-content]");
    const creditLine = rowCreditLine(creditTd);
    const bsContent = button?.getAttribute("data-bs-content");
    const accessRows = bsContent ? parseAccessTable(bsContent) : [];
    const eligible = accessRows.filter((r) => r.credit != null && r.credit >= 100);

    let dueAt: string | null = null;
    if (eligible.length) {
      const picked = pickDueRow(eligible, now);
      if (picked) dueAt = picked.end;
    }
    else if (/until/i.test(creditLine)) dueAt = parseCreditText(creditLine, now).dueAt;

    const score = rowScore(scoreTd);

    // Past the deadline, the assessment is closed only once no window paying
    // any credit is still running: a late-credit row ("80%: Sep 4 – Sep 10")
    // keeps it open — overdue, but still worth turning in.
    const nowMs = now.getTime();
    const lateWindow = accessRows.some((r) => (r.credit ?? 0) > 0 && r.start && r.end && Date.parse(r.start) <= nowMs && nowMs < Date.parse(r.end));
    let status;
    if (score.value != null && score.value >= 100) status = "graded";
    else if (score.value != null && score.value > 0) status = "submitted";
    else if (dueAt != null && Date.parse(dueAt) < nowMs && !lateWindow) status = "closed";
    else status = "open";

    // The scorebar text is the grade PrairieLearn itself shows ("110%", "100%").
    // A bare 0% on work nobody has handed in is the absence of a grade, not a
    // grade of zero, so it stays out of the row and only shows in the details.
    const grade = score.value == null || (score.value === 0 && status !== "submitted" && status !== "graded") ? null : score.text;

    const details = [
      creditLine || null,
      ...accessRows.map((r) => `${r.credit == null ? "None" : r.credit + "%"}: ${fmtChicago(r.start)} – ${fmtChicago(r.end)}`),
      `Score: ${score.text}`,
    ].filter(Boolean).join("\n");

    out.push(normalize({
      id: `pl:${instanceId}:${slug(label)}`,
      source: "prairielearn",
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
  return out;
}
