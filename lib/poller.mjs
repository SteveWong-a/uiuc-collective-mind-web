import { diffSnapshots } from "./diff.mjs";
import { LoginRequiredError } from "./browser.mjs";

export function sourceKey(c) {
  if (c.source === "canvas") return `canvas:${c.courseId}`;
  if (c.source === "prairielearn") return `prairielearn:${c.instanceId}`;
  return c.source;
}

// Maps a stored assignment back to the source key it came from, using its id
// prefix: canvas ids look like "canvas:<courseId>:...", prairielearn ids look
// like "pl:<instanceId>:...", and cs128 / prairietest ids look like
// "cs128:..." / "prairietest:..." (one entry each, no instance id). This lets
// retained (not-refetched) assignments be filtered out per-source rather than
// per-source-type when a sibling source of the same type succeeds. Returns
// null when no configured course matches (e.g. the course was removed from
// settings), so the assignment is never retained and gets diffed as removed.
function keyOf(a, courses) {
  const cfg = courses.find(
    (c) =>
      c.source === a.source &&
      (c.source === "cs128" || c.source === "prairietest" || a.id.startsWith(`${c.source === "prairielearn" ? "pl" : c.source}:${c.courseId ?? c.instanceId}:`))
  );
  return cfg ? sourceKey(cfg) : null;
}

// Dedupe a list of assignments by id, keeping the LAST occurrence of each id.
// Status only moves forward: a source that temporarily cannot see submission
// status (e.g. Canvas feed without a login) must not demote graded work.
const RANK = { unknown: 0, open: 1, closed: 1, submitted: 2, graded: 3 };
function keepProgress(previous, items) {
  const prev = new Map(previous.map((a) => [a.id, a]));
  return items.map((a) => {
    const old = prev.get(a.id);
    // The grade belongs to the status: a source that cannot see "graded" any
    // more cannot see the grade either, so keep the remembered one — unless the
    // source did report a grade, which is by definition fresher.
    if (old && (RANK[old.status] ?? 0) > (RANK[a.status] ?? 0)) return { ...a, status: old.status, grade: a.grade ?? old.grade ?? null };
    return a;
  });
}

function dedupeById(items) {
  const byId = new Map();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}

export class Poller {
  #timer = null; #inflight = null; #nextAt = null;
  constructor({ store, getSettings, fetchers, deps, sync = null, isSyncEnabled = () => true, afterRun = null, log = () => {}, bus, now = () => new Date() }) {
    Object.assign(this, { store, getSettings, fetchers, deps, sync, isSyncEnabled, afterRun, log, bus, now });
  }
  get running() { return this.#inflight !== null; }
  get nextAt() { return this.#nextAt; }

  run() {
    if (this.#inflight) return this.#inflight;
    this.#inflight = this.#run().finally(() => { this.#inflight = null; });
    return this.#inflight;
  }

  async #run() {
    const settings = this.getSettings();
    // One instant for the whole run: every fetcher sees the same `now`, which
    // lets a fetcher covering several sources (the Canvas .ics feed) memoise
    // its single upstream request under a per-run key.
    const runNow = this.now();
    const at = runNow.toISOString();
    const previous = this.store.state.assignments;
    // Seed sources only from configured course keys so that courses removed
    // from settings are purged immediately rather than persisting in state.json.
    const configuredKeys = new Set(settings.courses.map(sourceKey));
    const sources = {};
    for (const key of configuredKeys) if (this.store.state.sources[key]) sources[key] = this.store.state.sources[key];
    // Preserve google / googleCalendar — they are managed outside the course loop.
    for (const k of ["google", "googleCalendar"]) if (this.store.state.sources[k]) sources[k] = this.store.state.sources[k];
    const fresh = new Map();      // key -> assignments
    const succeeded = new Set();
    for (const cfg of settings.courses) {
      const key = sourceKey(cfg);
      const fetcher = this.fetchers[cfg.source];
      try {
        if (!fetcher) throw new Error(`no fetcher for ${cfg.source}`);
        const items = await fetcher(cfg, { ...this.deps, settings, now: runNow });
        // A source that suddenly returns nothing while we still hold items for it
        // is far more likely to be a half-rendered page than a semester wiped
        // clean, so treat it as a soft failure: keep the previous snapshot and
        // report no removals.
        // A fetcher that degraded but still returned usable data says so with
        // `warning` on the returned array (e.g. Canvas feed without a session).
        // One that can vouch for an empty list (no exam reserved right now is
        // a normal state) sets `trustedEmpty`, and its extra, non-assignment
        // data (exams open for reservation) rides along as `reservable`.
        const note = items.warning ? ` (${items.warning})` : "";
        const kept = items.length === 0 && !items.trustedEmpty ? previous.filter((a) => keyOf(a, settings.courses) === key).length : 0;
        if (kept > 0) {
          sources[key] = { state: "error", message: `returned 0 items (kept previous ${kept})${note}`, at, count: kept };
          this.log(`${key}: returned 0 items, kept previous ${kept}${note}`);
          continue;
        }
        fresh.set(key, items.map((a) => ({ ...a, seenAt: at })));
        succeeded.add(key);
        const message = `${items.length} items${note}`;
        sources[key] = { state: "ok", message, at, count: items.length, ...(items.reservable ? { reservable: items.reservable } : {}) };
        this.log(`${key}: ${message}`);
      } catch (e) {
        const isLogin = e instanceof LoginRequiredError || e.name === "LoginRequiredError";
        sources[key] = { state: isLogin ? "needs_login" : "error", message: e.message, at, count: sources[key]?.count ?? 0, ...(isLogin ? { loginUrl: e.url } : {}) };
        this.log(`${key}: ${isLogin ? "login required" : "ERROR " + e.message}`);
      }
    }
    // Prune assignments for courses no longer in settings (keyOf returns null for them).
    const retained = previous.filter((a) => {
      const key = keyOf(a, settings.courses);
      return key !== null && !succeeded.has(key);
    });
    const current = keepProgress(previous, dedupeById([...retained, ...[...fresh.values()].flat()]));
    const changes = diffSnapshots(previous, current);
    this.store.state.assignments = current;
    this.store.state.sources = sources;
    this.store.state.lastPoll = at;
    this.store.pushChanges(changes);
    for (const c of changes) this.log(`change: ${c.type} ${c.course} ${c.title}${c.from || c.to ? ` (${c.from ?? "-"} -> ${c.to ?? "-"})` : ""}`);
    // Google Tasks is mirrored on every poll, not just when something changed:
    // tasks can be edited or deleted on Google's side between polls, and a
    // failed sync must get another chance without waiting for a change.
    if (typeof this.sync === "function" && this.isSyncEnabled()) {
      try {
        const s = await this.sync(current);
        const created = s?.created ?? 0;
        const updated = s?.updated ?? 0;
        const deleted = s?.deleted ?? 0;
        const errors = s?.errors ?? [];
        sources.google = { state: "ok", message: `tasks: +${created} ~${updated} -${deleted}${errors.length ? ` (${errors.length} errors)` : ""}`, at };
        if (errors.length) this.log(`tasks sync errors: ${errors.join("; ")}`);
      } catch (e) { sources.google = { state: "error", message: e.message, at }; this.log(`tasks sync ERROR ${e.message}`); }
    } else {
      // no sync configured/connected: never leave a stale status behind, for
      // the tasks list or for the calendar blocks the same run writes
      delete sources.google;
      delete sources.googleCalendar;
    }
    this.store.save();
    this.bus.emit("state", { lastPoll: at, changes: changes.length });
    // Let the host release idle resources (e.g. close the headless browser) between polls.
    if (typeof this.afterRun === "function") { try { await this.afterRun(); } catch (e) { this.log(`afterRun ERROR ${e.message}`); } }
    return { changes, sources };
  }

  start() {
    this.stop();
    const tick = async () => {
      try { await this.run(); } catch (e) { this.log(`poll ERROR ${e.message}`); }
      const ms = Math.max(5, this.getSettings().pollMinutes) * 60_000;
      this.#nextAt = new Date(this.now().getTime() + ms).toISOString();
      this.#timer = setTimeout(tick, ms);
    };
    tick();
  }
  stop() { if (this.#timer) clearTimeout(this.#timer); this.#timer = null; this.#nextAt = null; }
}
