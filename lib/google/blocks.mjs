import { chicagoDate, zonedToISO, formatChicago, TZ } from "../model.mjs";
import { isMirrored } from "./sync.mjs";

export const CALENDAR_TITLE = "UIUC Homework";
// Existing tokens were granted before the calendar scope existed, so the first
// calendar call comes back 403 until the user consents again.
export const RECONSENT = "Google Calendar needs re-consent: click Disconnect, then Connect Google again";

const HOUR = 3_600_000;
const DAY = 86_400_000;

const shiftDate = (date, days) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
const prevDate = (date) => shiftDate(date, -1);
const nextDate = (date) => shiftDate(date, 1);
const hourOn = (date, hour) => { const [year, month, day] = date.split("-").map(Number); return zonedToISO({ year, month, day, hour }); };

/**
 * Evening work blocks, one per date. An assignment earns a block once it is
 * within `withinHours` of its deadline, and the block goes on the last evening
 * that still precedes that deadline — the deadline's own evening when the block
 * starts before it, otherwise the evening before. An evening that has already
 * finished is dropped rather than written into the past.
 *
 * Work that is overdue but still open (a Canvas assignment past its due date
 * with the lock date still ahead) gets tonight's block instead — or tomorrow's
 * once tonight is over — every day until it is turned in.
 */
export function planBlocks(assignments, { now = new Date(), withinHours = 24, startHour = 20, endHour = 23 } = {}) {
  const nowMs = now.getTime();
  const byDate = new Map();
  for (const a of assignments) {
    if (!isMirrored(a) || !a.dueAt) continue;
    const due = Date.parse(a.dueAt);
    if (Number.isNaN(due) || nowMs < due - withinHours * HOUR) continue;
    let date;
    if (due <= nowMs) {
      const today = chicagoDate(now.toISOString());
      date = Date.parse(hourOn(today, endHour)) <= nowMs ? nextDate(today) : today;
    } else {
      const deadlineDate = chicagoDate(a.dueAt);
      date = Date.parse(hourOn(deadlineDate, startHour)) < due ? deadlineDate : prevDate(deadlineDate);
    }
    const start = hourOn(date, startHour);
    const end = hourOn(date, endHour);
    if (Date.parse(end) <= nowMs) continue;
    if (!byDate.has(date)) byDate.set(date, { date, start, end, assignments: [] });
    byDate.get(date).assignments.push(a);
  }
  for (const b of byDate.values()) b.assignments.sort((x, y) => Date.parse(x.dueAt) - Date.parse(y.dueAt) || x.id.localeCompare(y.id));
  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
}

export function toEvent(block) {
  const [first] = block.assignments;
  const n = block.assignments.length;
  return {
    summary: n > 1 ? `Homework block: ${n} due` : `Homework block: ${first.title} · ${first.course}`,
    description: block.assignments.map((a) => `• ${a.title} · ${a.course} · due ${formatChicago(a.dueAt)}${a.url ? `\n  ${a.url}` : ""}`).join("\n"),
    start: { dateTime: block.start, timeZone: TZ },
    end: { dateTime: block.end, timeZone: TZ },
    extendedProperties: { private: { uiucBlock: block.date } },
    // Explicit alarms so they work on any account without calendar setup:
    // 30 minutes before the block and at its start.
    reminders: REMINDERS,
  };
}

export const REMINDERS = { useDefault: false, overrides: [{ method: "popup", minutes: 30 }, { method: "popup", minutes: 0 }] };
const sameReminders = (r) => r && r.useDefault === false && JSON.stringify([...(r.overrides ?? [])].map((o) => `${o.method}:${o.minutes}`).sort()) === JSON.stringify(REMINDERS.overrides.map((o) => `${o.method}:${o.minutes}`).sort());

// Google echoes times back in the calendar's own offset ("…T20:00:00-05:00"),
// which is the same instant as the ISO we sent: compare instants, not strings.
const sameInstant = (x, y) => Boolean(x) && Boolean(y) && Date.parse(x) === Date.parse(y);

export function diffBlocks(blocks, events) {
  const byDate = new Map();
  const create = [], patch = [], remove = [];
  for (const e of events) {
    const date = e?.extendedProperties?.private?.uiucBlock;
    if (!date) continue;                       // never ours, never touched
    if (byDate.has(date)) remove.push({ id: e.id }); else byDate.set(date, e);
  }
  const wanted = new Set();
  for (const b of blocks) {
    wanted.add(b.date);
    const want = toEvent(b);
    const ev = byDate.get(b.date);
    if (!ev) { create.push(want); continue; }
    const p = {};
    if ((ev.summary ?? "") !== want.summary) p.summary = want.summary;
    if ((ev.description ?? "") !== want.description) p.description = want.description;
    if (!sameInstant(ev.start?.dateTime, want.start.dateTime)) p.start = want.start;
    if (!sameInstant(ev.end?.dateTime, want.end.dateTime)) p.end = want.end;
    if (!sameReminders(ev.reminders)) p.reminders = want.reminders;
    if (Object.keys(p).length) patch.push({ id: ev.id, patch: p });
  }
  for (const [date, ev] of byDate) if (!wanted.has(date)) remove.push({ id: ev.id });
  return { create, patch, remove };
}

const describe = (e) => (e.status === 403 ? RECONSENT : e.message);

export async function runBlockSync({ api, store, assignments, now = new Date(), withinHours, startHour, endHour, log = () => {} }) {
  const at = now.toISOString();
  const g = store.state.google;
  const errors = [];
  let created = 0, updated = 0, deleted = 0, fatal = null;
  try {
    g.calendarId = await api.ensureCalendar(CALENDAR_TITLE, g.calendarId);
    store.save();
    const events = await api.listEvents(g.calendarId, { timeMin: new Date(now.getTime() - 2 * DAY).toISOString(), timeMax: new Date(now.getTime() + 14 * DAY).toISOString() });
    const plan = diffBlocks(planBlocks(assignments, { now, withinHours, startHour, endHour }), events);
    for (const event of plan.create) {
      try { await api.insertEvent(g.calendarId, event); created++; }
      catch (e) { errors.push(`create ${event.extendedProperties.private.uiucBlock}: ${describe(e)}`); }
    }
    for (const { id, patch } of plan.patch) {
      try { await api.patchEvent(g.calendarId, id, patch); updated++; }
      catch (e) { errors.push(`update ${id}: ${describe(e)}`); }
    }
    for (const { id } of plan.remove) {
      try { await api.deleteEvent(g.calendarId, id); deleted++; }
      catch (e) { errors.push(`delete ${id}: ${describe(e)}`); }
    }
  } catch (e) { fatal = describe(e); }
  const counts = `blocks: +${created} ~${updated} -${deleted}`;
  const message = fatal ?? (errors.length ? `${counts} (${errors.length} errors: ${errors[0]})` : counts);
  store.state.sources = store.state.sources ?? {};
  store.state.sources.googleCalendar = { state: fatal || errors.length ? "error" : "ok", message, at };
  store.save();
  log(`calendar ${message}`);
  return { created, updated, deleted, errors: fatal ? [fatal, ...errors] : errors };
}
