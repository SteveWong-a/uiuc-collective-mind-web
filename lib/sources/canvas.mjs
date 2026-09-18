import { normalize, zonedToISO } from "../model.mjs";
import { LoginRequiredError } from "../browser.mjs";

const MAX_PAGES = 50;

export function parseLinkNext(header) {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export function stripHtml(html) {
  return String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function status(row, now) {
  const sub = row.submission;
  const ws = sub?.workflow_state;
  // A score is the strongest signal there is: Canvas leaves the workflow state
  // on "pending_review" for quizzes that are already scored. But a score on
  // work that was never submitted is the "missing" policy's automatic zero,
  // not a grade for something the student did.
  const turnedIn = ws !== "unsubmitted" || Boolean(sub?.submitted_at);
  if (ws === "graded" || (sub?.score != null && turnedIn)) return "graded";
  if (sub?.submitted_at || ws === "submitted" || ws === "pending_review") return "submitted";
  if (row.lock_at && Date.parse(row.lock_at) < now.getTime()) return "closed";
  return "open";
}

// "9", "95.5", "10" — Number() drops the trailing .0 Canvas sends for whole
// points, and anything unparseable is passed through untouched.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? String(n) : String(v); };

// What the student reads next to the work: points out of points when there is a
// score, otherwise Canvas's display grade for letter / complete-style scales.
function grade(row) {
  const sub = row.submission;
  if (sub?.score != null) return row.points_possible != null ? `${num(sub.score)}/${num(row.points_possible)}` : num(sub.score);
  return typeof sub?.grade === "string" && sub.grade.trim() ? sub.grade.trim() : null;
}

export function parseCanvas(rows, { course, courseId, now = new Date() }) {
  return rows.map((row) => {
    const details = [
      row.points_possible != null ? `${row.points_possible} pts` : null,
      Array.isArray(row.submission_types) && row.submission_types.length ? `Submit: ${row.submission_types.join(", ").replace(/_/g, " ")}` : null,
      stripHtml(row.description).slice(0, 800) || null,
    ].filter(Boolean).join("\n");
    return normalize({
      id: `canvas:${courseId}:${row.id}`,
      source: "canvas",
      course,
      title: row.name,
      dueAt: row.due_at,
      openAt: row.unlock_at,
      url: row.html_url,
      details,
      status: status(row, now),
      grade: grade(row),
    });
  });
}

export async function fetchCanvas({ course, courseId }, { base, token, fetchImpl = fetch }) {
  if (!token) throw new Error("Canvas token not set");
  let url = `${base}/api/v1/courses/${courseId}/assignments?include[]=submission&per_page=100&order_by=due_at`;
  const rows = [];
  let pages = 0;
  while (url) {
    pages++;
    if (pages > MAX_PAGES) throw new Error(`Canvas pagination exceeded ${MAX_PAGES} pages for course ${courseId}`);
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Canvas ${res.status}: ${(await res.text()).slice(0, 200)}`);
    rows.push(...(await res.json()));
    url = parseLinkNext(res.headers.get("link"));
  }
  return parseCanvas(rows, { course, courseId });
}

export async function browserFetchAssignments({ courseId, maxPages }) {
  const rows = [];
  let url = `/api/v1/courses/${courseId}/assignments?include[]=submission&per_page=100&order_by=due_at`;
  let pages = 0;
  while (url) {
    if (++pages > maxPages) throw new Error(`Canvas pagination exceeded ${maxPages} pages for course ${courseId}`);
    const res = await fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin" });
    if (!res.ok) throw new Error(`Canvas ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    if (!/^\s*(while\(1\);)?\s*[\[{]/.test(text)) throw new Error(`Canvas returned non-JSON for ${url} (session expired? log in again)`);
    // Canvas's anti-JSON-hijacking prefix. The regex is inlined rather than
    // shared because this function is serialized into the page by page.evaluate
    // and cannot reference anything from this module.
    rows.push(...JSON.parse(text.replace(/^\s*while\(1\);/, "")));
    const link = res.headers.get("link") || "";
    const m = link.split(",").map((p) => p.match(/<([^>]+)>\s*;\s*rel="next"/)).find(Boolean);
    url = m ? m[1] : null;
  }
  return rows;
}

// Canvas answers an expired session with a 401/403 or with an HTML login page,
// and that happens inside page.evaluate, so the error arrives here as a plain
// message. Auth-shaped ones become LoginRequiredError, which is what the poller
// and the UI use to offer a "Log in" button.
const AUTH_SHAPED = /Canvas 40[13]|non-JSON/;

export async function fetchCanvasViaBrowser({ course, courseId }, { base, browser, now }) {
  const url = `${base}/courses/${courseId}`;
  let rows;
  try {
    rows = await browser.withPage(url, async (page) => page.evaluate(browserFetchAssignments, { courseId, maxPages: MAX_PAGES }));
  } catch (e) {
    if (!(e instanceof LoginRequiredError) && AUTH_SHAPED.test(e?.message ?? "")) throw new LoginRequiredError(url);
    throw e;
  }
  return parseCanvas(rows, { course, courseId, now });
}

// ---------------------------------------------------------------------------
// Personal calendar feed (.ics)
//
// UIUC disables personal API tokens, and a Canvas web session does not survive
// a restart, so the primary Canvas path is the per-user iCalendar feed:
// https://canvas.illinois.edu/feeds/calendars/user_<token>.ics — no login, one
// request, every assignment with a due date across every enrolled course. It
// carries no submission status, so the logged-in session stays as optional
// enrichment on top (see fetchCanvasAuto / mergeCanvas).
// ---------------------------------------------------------------------------

const FEED_BASE = "https://canvas.illinois.edu";

// RFC 5545 folding: a line longer than 75 octets continues on the next line,
// which starts with one space or tab. Unfolding removes the break AND the
// leading whitespace, so the two halves rejoin with nothing between them.
export function unfoldIcs(text) {
  return String(text ?? "").replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "");
}

// Property lines are NAME;PARAM=value;PARAM="quoted:value":VALUE — the value
// starts at the first colon that is not inside a quoted parameter.
function splitProperty(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) return { head: line.slice(0, i), value: line.slice(i + 1) };
  }
  return null;
}

// RFC 5545 escapes: \\ \; \, and \n / \N. The separators and the backslash
// stand for themselves; only n/N becomes a real newline.
const unescapeText = (v) => v.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

// DTSTART comes in three shapes: a bare date (Canvas's encoding for "due at
// 11:59 PM that day"), an absolute UTC timestamp, and — rarely — a floating
// local timestamp, which we read as Chicago like every other date in this app.
function parseDtStart(value, params) {
  const v = value.trim();
  if (/VALUE=DATE(?![-A-Z])/.test(params) || /^\d{8}$/.test(v)) return /^\d{8}$/.test(v) ? { date: v } : null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, year, month, day, hour, minute, second, z] = m.map((x, i) => (i === 0 || i === 7 ? x : Number(x)));
  if (z === "Z") return { datetime: new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString() };
  return { datetime: zonedToISO({ year, month, day, hour, minute, second }) };
}

export function parseIcsEvents(text) {
  const events = [];
  let cur = null;
  for (const line of unfoldIcs(text).split("\n")) {
    if (line === "BEGIN:VEVENT") { cur = { uid: "", summary: "", dtstart: null, url: "", description: "" }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const prop = splitProperty(line);
    if (!prop) continue;
    const [name, ...paramParts] = prop.head.split(";");
    const params = paramParts.join(";");
    const key = name.toUpperCase();
    if (key === "UID") cur.uid = prop.value.trim();
    else if (key === "SUMMARY") cur.summary = unescapeText(prop.value);
    else if (key === "DESCRIPTION") cur.description = unescapeText(prop.value);
    else if (key === "URL") cur.url = prop.value.trim();
    else if (key === "DTSTART") cur.dtstart = parseDtStart(prop.value, params);
  }
  return events;
}

// A date-only DTSTART means "due 11:59 PM Chicago that day" — Canvas's own
// encoding, not a guess.
function feedDueAt(dtstart) {
  if (!dtstart) return null;
  if (dtstart.datetime) return dtstart.datetime;
  const m = dtstart.date?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return zonedToISO({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: 23, minute: 59 });
}

export function parseCanvasFeed(text, { courses = [], now = new Date(), base = FEED_BASE } = {}) {
  const byCourseId = new Map(courses.map((c) => [String(c.courseId), c]));
  const out = [];
  for (const ev of parseIcsEvents(text)) {
    // Plain calendar events (UID event-calendar-event-<id>) are not homework.
    const assignmentId = ev.uid.match(/^event-assignment-(\d+)$/)?.[1];
    if (!assignmentId) continue;
    const courseId = ev.url.match(/include_contexts=course_(\d+)/)?.[1];
    const cfg = courseId && byCourseId.get(courseId);
    if (!cfg) continue;
    const dueAt = feedDueAt(ev.dtstart);
    const item = normalize({
      id: `canvas:${courseId}:${assignmentId}`,
      source: "canvas",
      course: cfg.course,
      title: ev.summary.replace(/\s*\[[^\]]*\]\s*$/, ""),
      dueAt,
      url: `${base}/courses/${courseId}/assignments/${assignmentId}`,
      details: ev.description.slice(0, 800),
      status: dueAt && Date.parse(dueAt) < now.getTime() ? "closed" : "open",
    });
    // Non-enumerable so it never reaches state.json, the diff or the UI: it
    // exists only so mergeCanvas knows this due time came from a date-only
    // DTSTART and may be replaced by the session's exact one.
    if (ev.dtstart?.date) Object.defineProperty(item, "dueDateOnly", { value: true, enumerable: false });
    out.push(item);
  }
  return out;
}

export async function fetchCanvasFeed({ feedUrl, courses, fetchImpl = fetch, now, base }) {
  if (!feedUrl) throw new Error("Canvas feed URL not set");
  const res = await fetchImpl(feedUrl);
  if (!res.ok) throw new Error(`Canvas feed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseCanvasFeed(await res.text(), { courses, now, base });
}

// The feed knows what is due; the session knows whether it was handed in.
// Union by id, session wins on the fields only it can know.
export function mergeCanvas(feedItems, sessionItems) {
  const session = new Map((sessionItems ?? []).map((a) => [a.id, a]));
  const out = [];
  for (const f of feedItems ?? []) {
    const s = session.get(f.id);
    if (!s) { out.push(f); continue; }
    session.delete(f.id);
    out.push({
      ...f,
      status: s.status,
      // Only the session sees a grade at all — the feed carries due dates.
      grade: s.grade ?? null,
      // The session's details carry points and submission types; fall back to
      // the feed's description when the session has nothing to say.
      details: s.details || f.details,
      dueAt: f.dueDateOnly && s.dueAt ? s.dueAt : f.dueAt,
    });
  }
  out.push(...session.values());
  return out;
}

const hostOf = (u) => { try { return new URL(u).host; } catch { return "the login page"; } };
const shortReason = (e) => (e instanceof LoginRequiredError ? `login required (${hostOf(e.url)})` : String(e?.message ?? e).slice(0, 120));

// The poller calls this fetcher once per configured course, but the feed is one
// document covering all of them. Memoise it for the run: the poller hands every
// fetcher in a run the same `now`, so (now, feedUrl) identifies the run.
let feedCache = { key: null, promise: null };

async function feedItemsForCourse(cfg, { feedUrl, courses, base, fetchImpl, now }) {
  const key = `${now?.getTime?.() ?? 0}|${feedUrl}`;
  if (feedCache.key !== key) feedCache = { key, promise: fetchCanvasFeed({ feedUrl, courses, base, fetchImpl, now }) };
  const all = await feedCache.promise;
  return all.filter((a) => a.id.startsWith(`canvas:${cfg.courseId}:`));
}

export async function fetchCanvasAuto(cfg, { base, token, browser, fetchImpl, now, feedUrl, courses, log } = {}) {
  if (typeof feedUrl === "string" && feedUrl) {
    const feedItems = await feedItemsForCourse(cfg, { feedUrl, courses: courses?.length ? courses : [cfg], base, fetchImpl, now });
    if (!browser) return feedItems;
    try {
      return mergeCanvas(feedItems, await fetchCanvasViaBrowser(cfg, { base, browser, now }));
    } catch (e) {
      // Enrichment is optional: a missing or expired session must never fail a
      // source whose due dates already arrived over the feed. Keep the note
      // short — this is written on every poll, and a LoginRequiredError carries
      // the whole SAML request URL (kilobytes of it) in its message.
      const warning = `status via login unavailable: ${shortReason(e)}`;
      log?.(`canvas:${cfg.courseId}: ${warning}`);
      return Object.assign(feedItems, { warning });
    }
  }
  if (typeof token === "string" && token) return fetchCanvas(cfg, { base, token, fetchImpl });
  return fetchCanvasViaBrowser(cfg, { base, browser, now });
}
