export const SOURCES = ["canvas", "prairielearn", "cs128", "smartphysics", "prairietest"];
export const STATUSES = ["open", "submitted", "graded", "closed", "unknown"];
export const TZ = "America/Chicago";

function tzOffsetMs(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - ms;
}

export function zonedToISO({ year, month, day, hour = 0, minute = 0, second = 0 }: any, tz = TZ) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - tzOffsetMs(guess, tz);
  return new Date(guess - tzOffsetMs(first, tz)).toISOString();
}

export function inferYear(month: number, day: number, now = new Date()) {
  const y = now.getUTCFullYear();
  const DAY = 86_400_000;
  for (const cand of [y, y + 1, y - 1]) {
    const t = Date.UTC(cand, month - 1, day);
    if (t >= now.getTime() - 90 * DAY && t <= now.getTime() + 300 * DAY) return cand;
  }
  return y;
}

export function formatChicago(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(/ | /g, " ");
}

export function chicagoDate(iso: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function isoOrNull(v: any, field: string) {
  if (v === undefined || v === null || v === "") return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) throw new Error(`${field} is not a valid date: ${v}`);
  return new Date(ms).toISOString();
}

// A grade is whatever the site shows next to the work ("9/10", "110%", "A",
// "complete") — display text, never a number to compute with. Blank means "no
// grade to show", which is not the same as a zero.
function gradeOrNull(v: any) {
  if (v === undefined || v === null) return null;
  return String(v).trim().slice(0, 40) || null;
}

export function normalize(a: any) {
  if (!a || typeof a.id !== "string" || !a.id) throw new Error("assignment needs id");
  if (!SOURCES.includes(a.source)) throw new Error(`bad source ${a.source}`);
  if (typeof a.course !== "string" || !a.course.trim()) throw new Error("assignment needs course");
  if (typeof a.title !== "string" || !a.title.trim()) throw new Error("assignment needs title");
  return {
    id: a.id,
    source: a.source,
    course: a.course.trim(),
    title: a.title.trim().replace(/\s+/g, " "),
    dueAt: isoOrNull(a.dueAt, "dueAt"),
    openAt: isoOrNull(a.openAt, "openAt"),
    url: a.url ?? "",
    details: String(a.details ?? "").trim().slice(0, 2000),
    status: STATUSES.includes(a.status) ? a.status : "unknown",
    grade: gradeOrNull(a.grade),
    seenAt: a.seenAt ?? new Date().toISOString(),
  };
}
