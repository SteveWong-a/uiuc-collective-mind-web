import { formatChicago, chicagoDate } from "../model.mjs";

export const LIST_TITLE = "UIUC Homework";
const NOTES_MAX = 1024;

// Only work that is still outstanding belongs in the list: once an assignment is
// submitted, graded or closed the task is deleted rather than checked off, so
// the list is exactly "what is left to do".
const MIRRORED = new Set(["open", "unknown"]);
export const isMirrored = (a) => MIRRORED.has(a.status);

const DAY = 86_400_000;

/**
 * The calendar date a task should sit on. Google Tasks carry one date, so an
 * assignment shows up `leadDays` before its deadline and, while still open,
 * rolls forward one day at a time — through the deadline and past it, so
 * missed work stays on today's list until it is turned in (the deadline is in
 * the title; finished work is deleted by the sync, never re-dated).
 */
export function taskDate(dueAt, { leadDays = 3, now = new Date() } = {}) {
  const start = chicagoDate(new Date(Date.parse(dueAt) - leadDays * DAY).toISOString());
  const today = chicagoDate(now.toISOString());
  const day = start < today ? today : start;
  return `${day}T00:00:00.000Z`;
}

// The task's last notes line names its assignment. This, not the local
// mapping, is what makes a task "ours": several machines run the app against
// one Google account, each with its own state file, and the id is the only
// thing they can all agree on.
const MARKER_RE = /(?:^|\n)uiuc:(\S+)\s*$/;
const marker = (id) => `uiuc:${id}`;
export function assignmentIdOf(task) {
  const m = String(task?.notes ?? "").match(MARKER_RE);
  return m ? m[1] : null;
}

export function toTask(a, { leadDays = 3, now = new Date() } = {}) {
  const deadline = a.dueAt ? formatChicago(a.dueAt) : null;
  // A CBTF reservation is a place to be, not work to hand in: mark it so it
  // stands out from homework in the task list.
  const name = a.source === "prairietest" ? `[Test] ${a.title}` : a.title;
  const title = [name, a.course, deadline ? `due ${deadline}` : null].filter(Boolean).join(" · ");
  const tail = `\n\n${marker(a.id)}`;
  const body = [a.details, a.url].filter(Boolean).join("\n\n").slice(0, NOTES_MAX - tail.length);
  const t = { title, notes: body + tail, status: "needsAction" };
  if (a.dueAt) t.due = taskDate(a.dueAt, { leadDays, now });
  return t;
}

const sameDue = (x, y) => (x ? x.slice(0, 10) : null) === (y ? y.slice(0, 10) : null);

/**
 * Plans the writes that make the list mirror `assignments`. Every task that
 * carries an assignment's id — or, from before ids were stamped, its exact
 * title — belongs to that assignment; when there are several, the one with the
 * smallest id survives and the rest are removed. The rule uses nothing local,
 * so every machine picks the same survivor. `adopt` records which surviving
 * task each assignment maps to when that differs from `mapping`.
 */
export function diffTasks(assignments, mapping, tasks, opts = {}) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const owned = new Map(); // assignmentId -> tasks stamped with it
  for (const t of tasks) {
    const id = assignmentIdOf(t);
    if (id) (owned.get(id) ?? owned.set(id, []).get(id)).push(t);
  }
  const untagged = tasks.filter((t) => !assignmentIdOf(t));
  const create = [], patch = [], remove = [], prune = [], adopt = [];
  const seen = new Set();
  for (const a of assignments) {
    if (!isMirrored(a)) continue; // finished: treated as absent, so a mapped task gets removed below
    seen.add(a.id);
    const wanted = toTask(a, opts);
    const taskId = mapping[a.id];
    if (taskId && !byId.has(taskId)) prune.push(a.id);
    const mine = new Map((owned.get(a.id) ?? []).map((t) => [t.id, t]));
    for (const t of untagged) if (t.title === wanted.title && !(t.id in mine)) mine.set(t.id, t);
    if (taskId && byId.has(taskId)) mine.set(taskId, byId.get(taskId));
    const [existing, ...extras] = [...mine.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    for (const t of extras) remove.push({ assignmentId: a.id, taskId: t.id });
    if (!existing) { create.push({ assignmentId: a.id, task: wanted }); continue; }
    if (existing.id !== taskId) adopt.push({ assignmentId: a.id, taskId: existing.id });
    const p = {};
    if ((existing.title ?? "") !== wanted.title) p.title = wanted.title;
    if ((existing.notes ?? "") !== wanted.notes) p.notes = wanted.notes;
    if (!sameDue(existing.due, wanted.due)) p.due = wanted.due ?? null;
    if (existing.status !== wanted.status && !(existing.status === "completed" && wanted.status === "needsAction")) p.status = wanted.status;
    if (Object.keys(p).length) patch.push({ assignmentId: a.id, taskId: existing.id, patch: p });
  }
  for (const [assignmentId, taskId] of Object.entries(mapping)) {
    if (seen.has(assignmentId)) continue;
    if (byId.has(taskId)) remove.push({ assignmentId, taskId }); else prune.push(assignmentId);
  }
  return { create, patch, remove, prune, adopt };
}

export async function runSync({ api, store, assignments, leadDays = 3, now = new Date(), log = () => {} }) {
  const g = store.state.google;
  g.tasklistId = await api.ensureList(LIST_TITLE, g.tasklistId);
  store.save();
  const tasks = await api.listTasks(g.tasklistId);
  const plan = diffTasks(assignments, g.mapping, tasks, { leadDays, now });
  const errors = [];
  let created = 0, updated = 0, deleted = 0;
  for (const id of plan.prune) delete g.mapping[id];
  for (const { assignmentId, taskId } of plan.adopt) g.mapping[assignmentId] = taskId;
  for (const { assignmentId, task } of plan.create) {
    try { const t = await api.insertTask(g.tasklistId, task); g.mapping[assignmentId] = t.id; created++; }
    catch (e) { errors.push(`create "${task.title}": ${e.message}`); }
  }
  for (const { taskId, patch } of plan.patch) {
    try { await api.patchTask(g.tasklistId, taskId, patch); updated++; }
    catch (e) { errors.push(`update ${taskId}: ${e.message}`); }
  }
  for (const { assignmentId, taskId } of plan.remove) {
    // 404: another machine deleted the same duplicate first. Same outcome.
    try { await api.deleteTask(g.tasklistId, taskId); deleted++; }
    catch (e) { if (e.status !== 404) { errors.push(`delete ${taskId}: ${e.message}`); continue; } }
    if (g.mapping[assignmentId] === taskId) delete g.mapping[assignmentId];
  }
  store.save();
  log(`tasks sync: +${created} ~${updated} -${deleted}${errors.length ? ` errors=${errors.length}` : ""}`);
  return { created, updated, deleted, errors };
}
