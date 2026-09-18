# Homework Aggregator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A localhost Node app that polls Canvas, PrairieLearn and cs128.org every 30 minutes, shows all homework with due dates in one page, reports changes, and mirrors assignments into a Google Tasks list.

**Architecture:** Plain Node ESM, no framework. Per-source adapters expose a pure `parse()` (fixture-tested) and a thin `fetch()`. A `Poller` runs adapters, isolates failures, diffs against the stored snapshot, persists to `data/state.json`, pushes SSE to a vanilla-JS UI, and triggers a pure-diff Google Tasks sync. Playwright persistent profile handles NetID/Duo-gated sites.

**Tech Stack:** Node >= 20, `node:test`, `playwright` (only runtime dep), `jsdom` (dev dep for HTML parsing in tests and adapters), Google Tasks REST v1, Canvas REST v1.

**Spec:** `docs/superpowers/specs/2026-09-03-homework-aggregator-design.md`

## Global Constraints

- Node `>= 20`, `"type": "module"`, files end in `.mjs`.
- Tests: `node --test` (`npm test`), no test framework.
- Runtime deps: `playwright` and `jsdom` only. No build step.
- Server binds `127.0.0.1` only, default port `4258`, rejects non-localhost `Host`/`Origin`.
- Gitignored: `profile/`, `data/`, `settings.json`, `node_modules/`, `*.png`, `.env*`.
- All stored times are ISO 8601 UTC; source-local times are `America/Chicago`.
- Assignment ids are deterministic: `canvas:<courseId>:<assignmentId>`, `pl:<instanceId>:<assessmentId>`, `cs128:<slug>`.
- Google Tasks list title: `UIUC Homework`. Task notes max 1024 chars.
- Commit after every task with a Conventional Commits message ending in the session trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PJ9sV8MTnXZTKLHku6ZgRY
  ```

## File Structure

```
package.json
server.mjs                    HTTP + SSE + static + OAuth callback; main()
lib/model.mjs                 Assignment normalization, id helpers, Chicago-time helpers
lib/settings.mjs              settings.json load/save/validate/mask
lib/log.mjs                   bus (EventEmitter), log ring, recentLog
lib/store.mjs                 data/state.json persistence
lib/diff.mjs                  change detection between snapshots
lib/sources/canvas.mjs        Canvas REST fetch + parse
lib/sources/prairielearn.mjs  PL assessments page fetch + parse
lib/sources/cs128.mjs         cs128.org fetch + parse
lib/browser.mjs               Playwright persistent context, LoginRequiredError
lib/poller.mjs                Poller class (run, schedule, health, change log, sync trigger)
lib/google/auth.mjs           Desktop OAuth loopback, token file, getAccessToken
lib/google/tasks.mjs          Tasks v1 REST client
lib/google/sync.mjs           toTask, diff, runSync
public/index.html             UI
test/*.test.mjs + test/fixtures/
README.md
```

---

### Task 1: Scaffold, settings, log bus

**Files:**
- Create: `package.json`, `lib/settings.mjs`, `lib/log.mjs`, `test/settings.test.mjs`

**Interfaces:**
- Produces: `DEFAULTS`, `loadSettings(file) -> settings`, `saveSettings(file, patch) -> settings`, `validateSettings(patch) -> patch`, `maskSettings(settings) -> settings` (tokens replaced by `"••••"` + last 4), `bus`, `log(msg)`, `recentLog() -> entry[]`.

- [ ] **Step 1: package.json + install**

```json
{
  "name": "uiuc-collective-mind",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "server.mjs",
  "scripts": { "start": "node server.mjs", "test": "node --test" },
  "engines": { "node": ">=20" },
  "dependencies": { "jsdom": "^25.0.1", "playwright": "^1.62.1" }
}
```

Run: `npm install && npx playwright install chromium`

- [ ] **Step 2: Write failing settings test**

`test/settings.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSettings, saveSettings, validateSettings, maskSettings, DEFAULTS } from "../lib/settings.mjs";

const file = join(mkdtempSync(join(tmpdir(), "ucm-")), "settings.json");

test("defaults when file missing", () => {
  const s = loadSettings(file);
  assert.equal(s.port, 4258);
  assert.equal(s.pollMinutes, 30);
  assert.equal(s.courses.length, 7);
  assert.equal(s.courses[1].instanceId, "143409");
});

test("save merges and validates", () => {
  const s = saveSettings(file, { pollMinutes: 15, canvasToken: "abc123XYZ" });
  assert.equal(s.pollMinutes, 15);
  assert.equal(loadSettings(file).canvasToken, "abc123XYZ");
  assert.throws(() => validateSettings({ pollMinutes: 2 }), /pollMinutes/);
  assert.throws(() => validateSettings({ port: 80 }), /port/);
  assert.throws(() => validateSettings({ courses: [{ course: "X", source: "nope" }] }), /source/);
});

test("google patch merges nested", () => {
  saveSettings(file, { google: { clientId: "id1" } });
  const s = saveSettings(file, { google: { clientSecret: "sec" } });
  assert.deepEqual(s.google, { clientId: "id1", clientSecret: "sec" });
});

test("mask hides secrets", () => {
  const m = maskSettings({ ...DEFAULTS, canvasToken: "abcdefgh", google: { clientId: "x", clientSecret: "topsecret" } });
  assert.equal(m.canvasToken, "••••efgh");
  assert.equal(m.google.clientSecret, "••••cret");
  assert.equal(m.google.clientId, "x");
});
```

- [ ] **Step 3: Run, expect FAIL** — `node --test test/settings.test.mjs` → "Cannot find module".

- [ ] **Step 4: Implement `lib/settings.mjs`**

```js
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const SOURCES = ["canvas", "prairielearn", "cs128"];

export const DEFAULTS = Object.freeze({
  port: 4258,
  pollMinutes: 30,
  canvasToken: "",
  canvasBase: "https://canvas.illinois.edu",
  google: { clientId: "", clientSecret: "" },
  courses: [
    { course: "CS 128", source: "cs128" },
    { course: "CS 128", source: "prairielearn", instanceId: "143409" },
    { course: "CS 173", source: "prairielearn", instanceId: "223829" },
    { course: "MATH 257", source: "prairielearn", instanceId: "217654" },
    { course: "MATH 580", source: "canvas", courseId: "74998" },
    { course: "RHET 105", source: "canvas", courseId: "72592" },
    { course: "ENG 100", source: "canvas", courseId: "74325" },
  ],
});

export function validateSettings(patch) {
  const out = {};
  for (const key of ["pollMinutes", "port"]) {
    if (patch[key] === undefined) continue;
    const n = Number(patch[key]);
    if (!Number.isInteger(n)) throw new Error(`${key} must be an integer`);
    out[key] = n;
  }
  if (out.pollMinutes !== undefined && (out.pollMinutes < 5 || out.pollMinutes > 720)) throw new Error("pollMinutes must be between 5 and 720");
  if (out.port !== undefined && (out.port < 1024 || out.port > 65535)) throw new Error("port must be between 1024 and 65535");
  for (const key of ["canvasToken", "canvasBase"]) if (patch[key] !== undefined) out[key] = String(patch[key]).trim();
  if (patch.google !== undefined) {
    if (typeof patch.google !== "object" || patch.google === null) throw new Error("google must be an object");
    out.google = {};
    for (const k of ["clientId", "clientSecret"]) if (patch.google[k] !== undefined) out.google[k] = String(patch.google[k]).trim();
  }
  if (patch.courses !== undefined) {
    if (!Array.isArray(patch.courses)) throw new Error("courses must be an array");
    out.courses = patch.courses.map((c) => {
      if (!c || typeof c.course !== "string" || !c.course.trim()) throw new Error("each course needs a name");
      if (!SOURCES.includes(c.source)) throw new Error(`source must be one of ${SOURCES.join(", ")}`);
      const row = { course: c.course.trim(), source: c.source };
      if (c.source === "prairielearn") { if (!/^\d+$/.test(String(c.instanceId))) throw new Error("prairielearn needs numeric instanceId"); row.instanceId = String(c.instanceId); }
      if (c.source === "canvas") { if (!/^\d+$/.test(String(c.courseId))) throw new Error("canvas needs numeric courseId"); row.courseId = String(c.courseId); }
      return row;
    });
  }
  return out;
}

export function loadSettings(file) {
  if (!existsSync(file)) return structuredClone(DEFAULTS);
  let json = {};
  try { json = JSON.parse(readFileSync(file, "utf8")); } catch { json = {}; }
  return { ...structuredClone(DEFAULTS), ...json, google: { ...DEFAULTS.google, ...(json.google ?? {}) } };
}

export function saveSettings(file, patch) {
  const current = loadSettings(file);
  const valid = validateSettings(patch);
  const merged = { ...current, ...valid, google: { ...current.google, ...(valid.google ?? {}) } };
  writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

const mask = (s) => (s ? "••••" + String(s).slice(-4) : "");
export function maskSettings(s) {
  return { ...s, canvasToken: mask(s.canvasToken), google: { ...s.google, clientSecret: mask(s.google?.clientSecret) } };
}
```

- [ ] **Step 5: Implement `lib/log.mjs`**

```js
import { EventEmitter } from "node:events";

export const bus = new EventEmitter();
bus.setMaxListeners(100);

const ring = [];
const RING = 300;

export function log(msg) {
  const entry = { at: new Date().toISOString(), msg: String(msg) };
  console.log(`${entry.at} ${entry.msg}`);
  ring.push(entry);
  if (ring.length > RING) ring.splice(0, ring.length - RING);
  bus.emit("log", entry);
}

export function recentLog() { return ring.slice(); }
```

- [ ] **Step 6: Run tests, expect PASS** — `npm test`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: scaffold, settings, log bus"`

---

### Task 2: Model + Chicago time helpers

**Files:**
- Create: `lib/model.mjs`, `test/model.test.mjs`

**Interfaces:**
- Produces:
  - `normalize(a) -> Assignment` (fills defaults, validates `id`, `source`, `course`, `title`; `dueAt/openAt` null or ISO; `status` in `STATUSES`; strips/limits `details` to 2000 chars).
  - `zonedToISO({year, month, day, hour, minute}, tz="America/Chicago") -> ISO string`.
  - `inferYear(month, day, now=new Date()) -> year` picks the year making the date fall within [now-90d, now+300d], preferring the current year.
  - `formatChicago(iso) -> "Sep 12, 11:59 PM"`, `chicagoDate(iso) -> "YYYY-MM-DD"`.
  - `STATUSES = ["open","submitted","graded","closed","unknown"]`.

- [ ] **Step 1: Write failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, zonedToISO, inferYear, formatChicago, chicagoDate } from "../lib/model.mjs";

test("zonedToISO handles CDT and CST", () => {
  assert.equal(zonedToISO({ year: 2026, month: 9, day: 12, hour: 23, minute: 59 }), "2026-09-13T04:59:00.000Z");
  assert.equal(zonedToISO({ year: 2026, month: 12, day: 5, hour: 23, minute: 59 }), "2026-12-06T05:59:00.000Z");
});

test("inferYear wraps around new year", () => {
  const now = new Date("2026-09-03T12:00:00Z");
  assert.equal(inferYear(9, 12, now), 2026);
  assert.equal(inferYear(1, 20, now), 2027);
  assert.equal(inferYear(8, 1, now), 2026);
  assert.equal(inferYear(11, 30, new Date("2027-01-10T12:00:00Z")), 2026);
});

test("format helpers", () => {
  assert.equal(formatChicago("2026-09-13T04:59:00.000Z"), "Sep 12, 11:59 PM");
  assert.equal(chicagoDate("2026-09-13T04:59:00.000Z"), "2026-09-12");
});

test("normalize fills defaults and validates", () => {
  const a = normalize({ id: "canvas:1:2", source: "canvas", course: "X", title: "  HW 1 ", url: "u", details: "d".repeat(3000) });
  assert.equal(a.title, "HW 1");
  assert.equal(a.dueAt, null);
  assert.equal(a.status, "unknown");
  assert.equal(a.details.length, 2000);
  assert.throws(() => normalize({ id: "x", source: "nope", course: "X", title: "t" }), /source/);
  assert.throws(() => normalize({ id: "canvas:1:2", source: "canvas", course: "X", title: "t", dueAt: "garbage" }), /dueAt/);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `lib/model.mjs`**

```js
export const SOURCES = ["canvas", "prairielearn", "cs128"];
export const STATUSES = ["open", "submitted", "graded", "closed", "unknown"];
export const TZ = "America/Chicago";

function tzOffsetMs(ms, tz) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - ms;
}

export function zonedToISO({ year, month, day, hour = 0, minute = 0 }, tz = TZ) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - tzOffsetMs(guess, tz);
  return new Date(guess - tzOffsetMs(first, tz)).toISOString();
}

export function inferYear(month, day, now = new Date()) {
  const y = now.getUTCFullYear();
  const DAY = 86_400_000;
  for (const cand of [y, y + 1, y - 1]) {
    const t = Date.UTC(cand, month - 1, day);
    if (t >= now.getTime() - 90 * DAY && t <= now.getTime() + 300 * DAY) return cand;
  }
  return y;
}

export function formatChicago(iso) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(",", ",");
}

export function chicagoDate(iso) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function isoOrNull(v, field) {
  if (v === undefined || v === null || v === "") return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) throw new Error(`${field} is not a valid date: ${v}`);
  return new Date(ms).toISOString();
}

export function normalize(a) {
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
    seenAt: a.seenAt ?? new Date().toISOString(),
  };
}
```

Note on `formatChicago`: `Intl` yields `Sep 12, 11:59 PM`; the test pins that exact string. If Node's ICU emits a narrow no-break space before `PM`, replace ` ` with a normal space inside `formatChicago`.

- [ ] **Step 4: Run, expect PASS.** Commit `feat: assignment model and Chicago time helpers`.

---

### Task 3: Snapshot diff

**Files:**
- Create: `lib/diff.mjs`, `test/diff.test.mjs`

**Interfaces:**
- Produces: `diffSnapshots(previous, current) -> Change[]` where `Change = { type: "added"|"removed"|"due_changed"|"status_changed", id, course, title, from?, to?, at }`. Both inputs are `Assignment[]`. Detection: `due_changed` compares `dueAt`; `status_changed` compares `status`; one assignment can yield both.

- [ ] **Step 1: Write failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots } from "../lib/diff.mjs";

const a = (over) => ({ id: "pl:1:hw1", source: "prairielearn", course: "CS 173", title: "HW1", dueAt: "2026-09-10T04:59:00.000Z", openAt: null, url: "", details: "", status: "open", seenAt: "t", ...over });

test("added / removed", () => {
  const ch = diffSnapshots([], [a()]);
  assert.deepEqual(ch.map((c) => c.type), ["added"]);
  assert.equal(ch[0].to, "2026-09-10T04:59:00.000Z");
  assert.deepEqual(diffSnapshots([a()], []).map((c) => c.type), ["removed"]);
});

test("due and status changes", () => {
  const ch = diffSnapshots([a()], [a({ dueAt: "2026-09-12T04:59:00.000Z", status: "submitted" })]);
  assert.deepEqual(ch.map((c) => c.type).sort(), ["due_changed", "status_changed"]);
  const due = ch.find((c) => c.type === "due_changed");
  assert.equal(due.from, "2026-09-10T04:59:00.000Z");
  assert.equal(due.to, "2026-09-12T04:59:00.000Z");
});

test("no change when identical apart from seenAt/details", () => {
  assert.deepEqual(diffSnapshots([a()], [a({ seenAt: "later", details: "x" })]), []);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
export function diffSnapshots(previous, current) {
  const at = new Date().toISOString();
  const prev = new Map(previous.map((x) => [x.id, x]));
  const out = [];
  const base = (x) => ({ id: x.id, course: x.course, title: x.title, at });
  for (const cur of current) {
    const old = prev.get(cur.id);
    prev.delete(cur.id);
    if (!old) { out.push({ type: "added", ...base(cur), to: cur.dueAt }); continue; }
    if (old.dueAt !== cur.dueAt) out.push({ type: "due_changed", ...base(cur), from: old.dueAt, to: cur.dueAt });
    if (old.status !== cur.status) out.push({ type: "status_changed", ...base(cur), from: old.status, to: cur.status });
  }
  for (const old of prev.values()) out.push({ type: "removed", ...base(old), from: old.dueAt });
  return out;
}
```

- [ ] **Step 4: PASS, commit** `feat: snapshot diff`.

---

### Task 4: Store

**Files:**
- Create: `lib/store.mjs`, `test/store.test.mjs`

**Interfaces:**
- Produces: `class Store { constructor(file); state; save(); loadError }` where `state = { assignments: Assignment[], changes: Change[], sources: { [key]: { state, message, at } }, lastPoll: ISO|null, google: { tasklistId: string|null, mapping: { [assignmentId]: taskId } } }`. `pushChanges(changes)` prepends and caps at 200. Source health key is `"<source>:<courseKey>"` (see Task 8).

- [ ] **Step 1: Test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/store.mjs";

const dir = mkdtempSync(join(tmpdir(), "ucm-"));

test("empty by default, persists roundtrip", () => {
  const s = new Store(join(dir, "state.json"));
  assert.deepEqual(s.state.assignments, []);
  assert.equal(s.state.google.tasklistId, null);
  s.state.assignments.push({ id: "x" });
  s.state.google.mapping.x = "t1";
  s.save();
  const s2 = new Store(join(dir, "state.json"));
  assert.equal(s2.state.assignments[0].id, "x");
  assert.equal(s2.state.google.mapping.x, "t1");
});

test("corrupt file starts empty with loadError", () => {
  writeFileSync(join(dir, "bad.json"), "{nope");
  const s = new Store(join(dir, "bad.json"));
  assert.deepEqual(s.state.assignments, []);
  assert.match(s.loadError, /JSON/);
});

test("pushChanges caps at 200 newest-first", () => {
  const s = new Store(join(dir, "c.json"));
  s.pushChanges(Array.from({ length: 150 }, (_, i) => ({ type: "added", id: String(i) })));
  s.pushChanges(Array.from({ length: 100 }, (_, i) => ({ type: "added", id: "n" + i })));
  assert.equal(s.state.changes.length, 200);
  assert.equal(s.state.changes[0].id, "n0");
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement**

```js
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const EMPTY = () => ({ assignments: [], changes: [], sources: {}, lastPoll: null, google: { tasklistId: null, mapping: {} } });
const MAX_CHANGES = 200;

export class Store {
  constructor(file) {
    this.file = file;
    this.loadError = null;
    this.state = EMPTY();
    if (existsSync(file)) {
      try {
        const json = JSON.parse(readFileSync(file, "utf8"));
        this.state = { ...EMPTY(), ...json, google: { ...EMPTY().google, ...(json.google ?? {}) } };
      } catch (e) { this.loadError = `could not read ${file}: ${e.message}`; }
    }
  }
  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.state, null, 2) + "\n");
    renameSync(tmp, this.file);
  }
  pushChanges(changes) {
    this.state.changes = [...changes, ...this.state.changes].slice(0, MAX_CHANGES);
  }
}
```

- [ ] **Step 4: PASS, commit** `feat: state store`.

---

### Task 5: Canvas adapter

**Files:**
- Create: `lib/sources/canvas.mjs`, `test/canvas.test.mjs`, `test/fixtures/canvas-assignments.json`

**Interfaces:**
- Produces: `parseCanvas(rows, { course, courseId, base }) -> Assignment[]`, `fetchCanvas({ course, courseId }, { base, token, fetchImpl = fetch }) -> Assignment[]`, `parseLinkNext(header) -> url|null`.

- [ ] **Step 1: Fixture** `test/fixtures/canvas-assignments.json` (shape of `GET /api/v1/courses/:id/assignments?include[]=submission`):

```json
[
  { "id": 101, "name": "Homework 1", "html_url": "https://canvas.illinois.edu/courses/74998/assignments/101", "due_at": "2026-09-13T04:59:59Z", "unlock_at": "2026-09-01T05:00:00Z", "lock_at": null, "points_possible": 10, "description": "<p>Do problems <b>1-5</b>.</p>", "submission_types": ["online_upload"], "submission": { "workflow_state": "unsubmitted", "submitted_at": null, "score": null } },
  { "id": 102, "name": "Essay draft", "html_url": "https://canvas.illinois.edu/courses/74998/assignments/102", "due_at": "2026-09-20T04:59:59Z", "unlock_at": null, "lock_at": null, "points_possible": 100, "description": null, "submission_types": ["online_text_entry"], "submission": { "workflow_state": "submitted", "submitted_at": "2026-09-18T01:00:00Z", "score": null } },
  { "id": 103, "name": "Quiz 0", "html_url": "https://canvas.illinois.edu/courses/74998/assignments/103", "due_at": "2026-08-30T04:59:59Z", "unlock_at": null, "lock_at": "2026-08-30T04:59:59Z", "points_possible": 5, "description": "", "submission_types": ["online_quiz"], "submission": { "workflow_state": "graded", "submitted_at": "2026-08-29T01:00:00Z", "score": 5 } },
  { "id": 104, "name": "Reading (no due)", "html_url": "https://canvas.illinois.edu/courses/74998/assignments/104", "due_at": null, "unlock_at": null, "lock_at": "2026-08-01T04:59:59Z", "points_possible": 0, "description": "", "submission_types": ["none"], "submission": { "workflow_state": "unsubmitted" } }
]
```

- [ ] **Step 2: Failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCanvas, fetchCanvas, parseLinkNext } from "../lib/sources/canvas.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/canvas-assignments.json", import.meta.url), "utf8"));
const ctx = { course: "MATH 580", courseId: "74998", base: "https://canvas.illinois.edu", now: new Date("2026-09-03T12:00:00Z") };

test("parse maps fields, status, details", () => {
  const out = parseCanvas(rows, ctx);
  assert.equal(out.length, 4);
  const [hw, essay, quiz, reading] = out;
  assert.equal(hw.id, "canvas:74998:101");
  assert.equal(hw.course, "MATH 580");
  assert.equal(hw.dueAt, "2026-09-13T04:59:59.000Z");
  assert.equal(hw.openAt, "2026-09-01T05:00:00.000Z");
  assert.equal(hw.status, "open");
  assert.match(hw.details, /10 pts/);
  assert.match(hw.details, /Do problems 1-5\./);
  assert.doesNotMatch(hw.details, /<b>/);
  assert.equal(essay.status, "submitted");
  assert.equal(quiz.status, "graded");
  assert.equal(reading.status, "closed");
  assert.equal(reading.dueAt, null);
});

test("Link header next", () => {
  assert.equal(parseLinkNext('<https://x/api?page=2>; rel="next", <https://x/api?page=1>; rel="first"'), "https://x/api?page=2");
  assert.equal(parseLinkNext('<https://x/api?page=1>; rel="first"'), null);
  assert.equal(parseLinkNext(undefined), null);
});

test("fetch follows pagination and sends bearer", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization });
    if (calls.length === 1) return { ok: true, status: 200, headers: new Headers({ link: '<https://canvas.illinois.edu/api/v1/courses/74998/assignments?page=2>; rel="next"' }), json: async () => rows.slice(0, 2) };
    return { ok: true, status: 200, headers: new Headers(), json: async () => rows.slice(2) };
  };
  const out = await fetchCanvas({ course: "MATH 580", courseId: "74998" }, { base: "https://canvas.illinois.edu", token: "tok", fetchImpl });
  assert.equal(out.length, 4);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer tok");
  assert.match(calls[0].url, /include%5B%5D=submission|include\[\]=submission/);
});

test("fetch errors on non-ok", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, headers: new Headers(), text: async () => "Invalid access token" });
  await assert.rejects(fetchCanvas({ course: "X", courseId: "1" }, { base: "https://c", token: "bad", fetchImpl }), /401/);
});
```

- [ ] **Step 3: FAIL.** **Step 4: Implement `lib/sources/canvas.mjs`**

```js
import { normalize } from "../model.mjs";

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
  const ws = row.submission?.workflow_state;
  if (ws === "graded") return "graded";
  if (ws === "submitted" || ws === "pending_review") return "submitted";
  if (row.lock_at && Date.parse(row.lock_at) < now.getTime()) return "closed";
  return "open";
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
    });
  });
}

export async function fetchCanvas({ course, courseId }, { base, token, fetchImpl = fetch }) {
  if (!token) throw new Error("Canvas token not set");
  let url = `${base}/api/v1/courses/${courseId}/assignments?include[]=submission&per_page=100&order_by=due_at`;
  const rows = [];
  while (url) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Canvas ${res.status}: ${(await res.text()).slice(0, 200)}`);
    rows.push(...(await res.json()));
    url = parseLinkNext(res.headers.get("link"));
  }
  return parseCanvas(rows, { course, courseId });
}
```

- [ ] **Step 5: PASS, commit** `feat: canvas adapter`.

---

### Task 6: Capture PrairieLearn + cs128 fixtures (discovery, needs user)

**Files:**
- Create: `test/fixtures/pl-assessments.html`, `test/fixtures/cs128-hw.html`, `test/fixtures/NOTES.md`
- Create: `scripts/capture.mjs`

This task gathers real HTML so Tasks 7 and 8 test against truth. Requires the user to log in (NetID + Duo) once in the headed Chromium window.

- [ ] **Step 1: `scripts/capture.mjs`**

```js
// Usage: node scripts/capture.mjs <url> <outfile>
// Opens a headed Chromium with the persistent profile, waits until the page is
// not a login page (you log in manually), then saves page.content() to outfile.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error("usage: node scripts/capture.mjs <url> <outfile>"); process.exit(1); }
const profile = join(dirname(fileURLToPath(import.meta.url)), "..", "profile");
const ctx = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: ["--disable-blink-features=AutomationControlled"] });
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(url, { waitUntil: "domcontentloaded" });
console.log("Log in if prompted. Capturing when the page URL matches the target host and has no login form (up to 5 min)...");
const target = new URL(url).host;
await page.waitForFunction((host) => location.host === host && !document.querySelector('input[type="password"]') && !/login/i.test(location.pathname), target, { timeout: 300_000, polling: 1000 });
await page.waitForLoadState("networkidle").catch(() => {});
writeFileSync(out, await page.content());
console.log(`saved ${out} (${(await page.content()).length} bytes) from ${page.url()}`);
await ctx.close();
```

- [ ] **Step 2: Capture PL** — run:
```bash
node scripts/capture.mjs https://us.prairielearn.com/pl/course_instance/223829/assessments test/fixtures/pl-assessments.html
```
User logs in via "Sign in with Illinois" in the window. Confirm the file contains `<table` and assessment links matching `/pl/course_instance/223829/assessment/`.

- [ ] **Step 3: Capture cs128** — ask the user which cs128.org page lists homework (likely under the sidebar after login; candidates `/go/start`, a "Assignments"/"MPs" entry). Run:
```bash
node scripts/capture.mjs https://cs128.org/<page> test/fixtures/cs128-hw.html
```
If the listing is spread across several pages, capture each as `cs128-<name>.html`.

- [ ] **Step 4: Scrub + document** — open both fixtures, remove the user's name/email/NetID if present (search for `@illinois.edu` and the NetID), and write `test/fixtures/NOTES.md`:
```
pl-assessments.html: CS 173 instance 223829, captured 2026-09-03.
  Row structure: <selector>. Label in <selector>. Due text example: "<paste one>".
cs128-hw.html: captured from https://cs128.org/<page> 2026-09-03.
  Item structure: <selector>. Due text example: "<paste one>".
```
Fill the selectors and example strings by inspecting the files (`grep -n` for `assessment/` in the PL file; `grep -in "due" ` in cs128). These notes are the source of truth for the next two tasks' expected values.

- [ ] **Step 5: Commit** `test: capture PrairieLearn and cs128 fixtures`.

---

### Task 7: PrairieLearn adapter

**Files:**
- Create: `lib/sources/prairielearn.mjs`, `test/prairielearn.test.mjs`

**Interfaces:**
- Produces: `parsePrairieLearn(html, { course, instanceId, now }) -> Assignment[]`, `parseCreditText(text, now) -> { dueAt: ISO|null, details: string }`, `fetchPrairieLearn({ course, instanceId }, { browser }) -> Assignment[]` where `browser.withPage(url, fn)` comes from Task 9.
- PL markup (validate against the fixture): the assessments page has one `<table>`; each assessment row `<tr>` contains a `<td>` with a label badge (`.badge`), a `<td>` whose `<a href="/pl/course_instance/<id>/assessment/<aid>/">` holds the title, a "credit" `<td>` with lines such as `100% until 23:59, Sep 12` / `100% until 11:59 PM, Fri, Sep 12 (CDT)` / `Available until ...` / `Closed`, and a score `<td>` (`<div class="progress">` or `%`). Group header rows use `<th>` and are skipped.

- [ ] **Step 1: Failing test** — pick two rows from the fixture and copy their real label/title/credit text into the assertions (replace the placeholders `<...>` with fixture values; keep the structure):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePrairieLearn, parseCreditText } from "../lib/sources/prairielearn.mjs";

const html = readFileSync(new URL("./fixtures/pl-assessments.html", import.meta.url), "utf8");
const now = new Date("2026-09-03T12:00:00Z");

test("parseCreditText formats", () => {
  assert.deepEqual(parseCreditText("100% until 23:59, Sep 12", now), { dueAt: "2026-09-13T04:59:00.000Z", details: "100% until 23:59, Sep 12" });
  assert.equal(parseCreditText("100% until 11:59 PM, Fri, Sep 12 (CDT)", now).dueAt, "2026-09-13T04:59:00.000Z");
  assert.equal(parseCreditText("110% until 23:59, Sep 10\n100% until 23:59, Sep 12\n50% until 23:59, Sep 14", now).dueAt, "2026-09-13T04:59:00.000Z");
  assert.equal(parseCreditText("Available until 23:59, Dec 5", now).dueAt, "2026-12-06T05:59:00.000Z");
  assert.equal(parseCreditText("Closed", now).dueAt, null);
  assert.equal(parseCreditText("", now).dueAt, null);
});

test("parses fixture rows", () => {
  const out = parsePrairieLearn(html, { course: "CS 173", instanceId: "223829", now });
  assert.ok(out.length >= 2, "expected assessment rows");
  for (const a of out) {
    assert.match(a.id, /^pl:223829:\d+$/);
    assert.equal(a.source, "prairielearn");
    assert.match(a.url, /^https:\/\/us\.prairielearn\.com\/pl\/course_instance\/223829\/assessment\/\d+\/?$/);
    assert.ok(a.title.length > 0);
  }
  const first = out.find((a) => a.title.includes("<TITLE FROM FIXTURE>"));
  assert.ok(first);
  assert.equal(first.dueAt, "<EXPECTED ISO FROM FIXTURE CREDIT TEXT>");
  assert.match(first.details, /<LABEL FROM FIXTURE>/);
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement**

```js
import { JSDOM } from "jsdom";
import { normalize, zonedToISO, inferYear } from "../model.mjs";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
// "23:59, Sep 12" | "11:59 PM, Fri, Sep 12 (CDT)" | "23:59, Sep 12, 2026"
const DATE_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)?,?\s*(?:[A-Za-z]{3},?\s*)?([A-Za-z]{3,4})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/i;

export function parseDateText(text, now = new Date()) {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const month = MONTHS[m[4].toLowerCase()];
  if (!month) return null;
  const day = Number(m[5]);
  const year = m[6] ? Number(m[6]) : inferYear(month, day, now);
  return zonedToISO({ year, month, day, hour, minute });
}

/** Due = end of the 100% window; else the last "until" in the text; else null. */
export function parseCreditText(text, now = new Date()) {
  const details = String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  const lines = details.split("\n");
  const full = lines.find((l) => /^100%\s+until/i.test(l));
  const anyUntil = [...lines].reverse().find((l) => /until/i.test(l));
  const src = full ?? anyUntil;
  return { dueAt: src ? parseDateText(src, now) : null, details };
}

function text(el) { return (el?.textContent ?? "").replace(/\s+/g, " ").trim(); }
function multiline(el) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("div, li, p").forEach((d) => d.append("\n"));
  return clone.textContent.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

export function parsePrairieLearn(html, { course, instanceId, now = new Date() }) {
  const doc = new JSDOM(html).window.document;
  const out = [];
  for (const tr of doc.querySelectorAll("table tr")) {
    const link = tr.querySelector(`a[href*="/course_instance/${instanceId}/assessment/"]`);
    if (!link) continue;
    const aid = link.getAttribute("href").match(/\/assessment\/(\d+)/)?.[1];
    if (!aid) continue;
    const cells = [...tr.querySelectorAll("td")];
    const label = text(tr.querySelector(".badge"));
    const creditCell = cells.find((td) => /until|closed|available/i.test(td.textContent)) ?? null;
    const scoreCell = cells.find((td) => td !== creditCell && /\d+%/.test(td.textContent) && !/until/i.test(td.textContent)) ?? null;
    const { dueAt, details: credit } = parseCreditText(multiline(creditCell), now);
    const score = scoreCell ? text(scoreCell).match(/\d+%/)?.[0] : null;
    let status = "open";
    if (/closed/i.test(credit) && !dueAt) status = "closed";
    else if (score && score !== "0%") status = "submitted";
    if (dueAt && Date.parse(dueAt) < now.getTime() && status === "open") status = "closed";
    out.push(normalize({
      id: `pl:${instanceId}:${aid}`,
      source: "prairielearn",
      course,
      title: `${label ? label + " " : ""}${text(link)}`,
      dueAt,
      url: new URL(link.getAttribute("href"), "https://us.prairielearn.com").toString(),
      details: [label ? `Label: ${label}` : null, credit || null, score ? `Score: ${score}` : null].filter(Boolean).join("\n"),
      status,
    }));
  }
  return out;
}

export function assessmentsUrl(instanceId) { return `https://us.prairielearn.com/pl/course_instance/${instanceId}/assessments`; }

export async function fetchPrairieLearn({ course, instanceId }, { browser, now = new Date() }) {
  const html = await browser.withPage(assessmentsUrl(instanceId), async (page) => {
    await page.waitForSelector("table", { timeout: 20_000 });
    return page.content();
  });
  return parsePrairieLearn(html, { course, instanceId, now });
}
```

If the fixture's credit cell uses different wording, adjust `DATE_RE`/`parseCreditText`, never the fixture expectations.

- [ ] **Step 4: PASS, commit** `feat: prairielearn adapter`.

---

### Task 8: cs128.org adapter

**Files:**
- Create: `lib/sources/cs128.mjs`, `test/cs128.test.mjs`

**Interfaces:**
- Produces: `parseCs128(html, { course, now }) -> Assignment[]`, `fetchCs128({ course }, { browser, now }) -> Assignment[]`, `CS128_URL` (page captured in Task 6). Ids: `cs128:<slug>` where slug = lowercase title with non-alphanumerics collapsed to `-` (stable across polls).

- [ ] **Step 1: Inspect fixture** — from `test/fixtures/NOTES.md`, note the repeating element for one assignment (e.g. a card, list item or table row), where the title, link, and due text live, and the due-date text format. Write the selectors into constants at the top of `lib/sources/cs128.mjs`.

- [ ] **Step 2: Failing test** (fill placeholders from the fixture):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCs128 } from "../lib/sources/cs128.mjs";

const html = readFileSync(new URL("./fixtures/cs128-hw.html", import.meta.url), "utf8");
const now = new Date("2026-09-03T12:00:00Z");

test("parses fixture items", () => {
  const out = parseCs128(html, { course: "CS 128", now });
  assert.ok(out.length >= 1);
  for (const a of out) {
    assert.match(a.id, /^cs128:[a-z0-9-]+$/);
    assert.equal(a.course, "CS 128");
    assert.match(a.url, /^https:\/\/cs128\.org\//);
  }
  const one = out.find((a) => a.title === "<TITLE FROM FIXTURE>");
  assert.ok(one);
  assert.equal(one.dueAt, "<EXPECTED ISO>");
});

test("ids are stable slugs", () => {
  const out = parseCs128(html, { course: "CS 128", now });
  const ids = out.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});
```

- [ ] **Step 3: Implement** (skeleton; set `ITEM`, `TITLE`, `LINK`, `DUE` selectors from the fixture; reuse `parseDateText` from Task 7 and extend its regex if cs128 uses a different date format such as `September 12, 2026 at 11:59 PM` — add a second regex `LONG_DATE_RE = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})?\s*(?:at|@)?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i` in `prairielearn.mjs`'s `parseDateText` and try both):

```js
import { JSDOM } from "jsdom";
import { normalize } from "../model.mjs";
import { parseDateText } from "./prairielearn.mjs";

export const CS128_URL = "https://cs128.org/<page from NOTES.md>";
const ITEM = "<selector for one assignment>";
const TITLE = "<selector inside ITEM>";
const LINK = "a[href]";
const DUE = "<selector inside ITEM holding due text>";

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

export function parseCs128(html, { course, now = new Date() }) {
  const doc = new JSDOM(html).window.document;
  const out = [];
  for (const item of doc.querySelectorAll(ITEM)) {
    const title = text(item.querySelector(TITLE));
    if (!title) continue;
    const href = item.querySelector(LINK)?.getAttribute("href") ?? "";
    const dueText = text(item.querySelector(DUE));
    const dueAt = parseDateText(dueText, now);
    out.push(normalize({
      id: `cs128:${slug(title)}`,
      source: "cs128",
      course,
      title,
      dueAt,
      url: href ? new URL(href, "https://cs128.org").toString() : CS128_URL,
      details: dueText,
      status: dueAt && Date.parse(dueAt) < now.getTime() ? "closed" : "open",
    }));
  }
  return out;
}

export async function fetchCs128({ course }, { browser, now = new Date() }) {
  const html = await browser.withPage(CS128_URL, async (page) => {
    await page.waitForSelector(ITEM, { timeout: 20_000 });
    return page.content();
  });
  return parseCs128(html, { course, now });
}
```

- [ ] **Step 4: PASS, commit** `feat: cs128 adapter`.

---

### Task 9: Browser session

**Files:**
- Create: `lib/browser.mjs`, `test/browser.test.mjs`

**Interfaces:**
- Produces: `class LoginRequiredError extends Error { url }`, `isLoginUrl(url) -> boolean`, `class Browser { constructor({ profileDir, launch = defaultLaunch, log }); withPage(url, fn) -> result; openForLogin(url); close(); get headed }`.
- `withPage` serializes access (one page at a time), navigates, throws `LoginRequiredError` if the landed URL is a login page or has a password input, otherwise calls `fn(page)`. `openForLogin(url)` closes any headless context and launches a headed one at `url`; subsequent `withPage` calls reuse whichever context is open.

- [ ] **Step 1: Test** (fake launcher; no real Chromium)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { Browser, LoginRequiredError, isLoginUrl } from "../lib/browser.mjs";

test("isLoginUrl", () => {
  assert.ok(isLoginUrl("https://shibboleth.illinois.edu/idp/profile/SAML2/Redirect/SSO"));
  assert.ok(isLoginUrl("https://login.microsoftonline.com/x"));
  assert.ok(isLoginUrl("https://us.prairielearn.com/pl/login"));
  assert.ok(isLoginUrl("https://cs128.org/login?next=/"));
  assert.ok(!isLoginUrl("https://us.prairielearn.com/pl/course_instance/1/assessments"));
});

function fakeLaunch(landing, hasPassword = false) {
  const launched = [];
  const launch = async (dir, { headless }) => {
    const page = { url: () => landing, goto: async () => {}, waitForLoadState: async () => {}, $: async () => (hasPassword ? {} : null), bringToFront: async () => {} };
    const ctx = { pages: () => [page], newPage: async () => page, on: () => {}, close: async () => {} };
    launched.push({ headless });
    return ctx;
  };
  return { launch, launched };
}

test("withPage runs fn when not a login page", async () => {
  const { launch, launched } = fakeLaunch("https://us.prairielearn.com/pl/course_instance/1/assessments");
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  const r = await b.withPage("https://us.prairielearn.com/pl/course_instance/1/assessments", async (p) => p.url());
  assert.match(r, /assessments/);
  assert.deepEqual(launched, [{ headless: true }]);
});

test("withPage throws LoginRequiredError on SSO redirect", async () => {
  const { launch } = fakeLaunch("https://shibboleth.illinois.edu/idp/x");
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  await assert.rejects(b.withPage("https://cs128.org/hw", async () => "no"), LoginRequiredError);
});

test("openForLogin launches headed and withPage reuses it", async () => {
  const { launch, launched } = fakeLaunch("https://cs128.org/hw");
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  await b.openForLogin("https://cs128.org/login");
  assert.equal(b.headed, true);
  await b.withPage("https://cs128.org/hw", async () => 1);
  assert.deepEqual(launched, [{ headless: false }]);
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement**

```js
export class LoginRequiredError extends Error {
  constructor(url) { super(`Login required (landed on ${url})`); this.name = "LoginRequiredError"; this.url = url; }
}

const LOGIN_RE = /shibboleth\.illinois\.edu|login\.microsoftonline\.com|login\.illinois\.edu|\/pl\/login|\/login(?:[/?#]|$)|\/saml\/|\/auth\//i;
export function isLoginUrl(url) { return LOGIN_RE.test(String(url)); }

export async function defaultLaunch(profileDir, { headless }) {
  const { chromium } = await import("playwright");
  return chromium.launchPersistentContext(profileDir, { headless, viewport: headless ? { width: 1280, height: 900 } : null, args: ["--disable-blink-features=AutomationControlled"] });
}

export class Browser {
  #ctx = null; #headed = false; #queue = Promise.resolve();
  constructor({ profileDir, launch = defaultLaunch, log = () => {} }) { this.profileDir = profileDir; this.launch = launch; this.log = log; }
  get headed() { return this.#headed; }

  async #ensure(headless) {
    if (this.#ctx) return this.#ctx;
    this.log(`launching browser (${headless ? "headless" : "headed"})`);
    const ctx = await this.launch(this.profileDir, { headless });
    ctx.on("close", () => { if (this.#ctx === ctx) { this.#ctx = null; this.#headed = false; } });
    this.#ctx = ctx; this.#headed = !headless;
    return ctx;
  }

  #serial(fn) { const job = this.#queue.then(fn, fn); this.#queue = job.catch(() => {}); return job; }

  withPage(url, fn) {
    return this.#serial(async () => {
      const ctx = await this.#ensure(!this.#headed);
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      if (isLoginUrl(page.url()) || (await page.$('input[type="password"]'))) throw new LoginRequiredError(page.url());
      return fn(page);
    });
  }

  openForLogin(url) {
    return this.#serial(async () => {
      if (this.#ctx && !this.#headed) { await this.#ctx.close().catch(() => {}); this.#ctx = null; }
      const ctx = await this.#ensure(false);
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.bringToFront().catch(() => {});
    });
  }

  async close() { if (this.#ctx) { const c = this.#ctx; this.#ctx = null; await c.close().catch(() => {}); } }
}
```

- [ ] **Step 4: PASS, commit** `feat: playwright browser session with login detection`.

---

### Task 10: Poller

**Files:**
- Create: `lib/poller.mjs`, `test/poller.test.mjs`

**Interfaces:**
- Consumes: `Store`, `diffSnapshots`, `bus`, adapters via injected `fetchers` map: `{ canvas(courseCfg, deps), prairielearn(courseCfg, deps), cs128(courseCfg, deps) }`, `LoginRequiredError`, optional `sync(assignments) -> Promise<summary>`.
- Produces: `class Poller { constructor({ store, getSettings, fetchers, deps, sync, log, bus, now }); run() -> { changes, sources }; start(); stop(); get running; get nextAt }`, `sourceKey(courseCfg) -> "canvas:74998" | "prairielearn:223829" | "cs128"`.
- Source health entry: `{ state: "ok"|"error"|"needs_login", message, at, count, loginUrl? }`.

- [ ] **Step 1: Test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/store.mjs";
import { Poller, sourceKey } from "../lib/poller.mjs";
import { LoginRequiredError } from "../lib/browser.mjs";

const mk = (id, over = {}) => ({ id, source: id.split(":")[0] === "pl" ? "prairielearn" : id.split(":")[0], course: "C", title: id, dueAt: null, openAt: null, url: "", details: "", status: "open", seenAt: "t", ...over });
const settings = { courses: [{ course: "A", source: "canvas", courseId: "1" }, { course: "B", source: "prairielearn", instanceId: "2" }], canvasToken: "t", canvasBase: "https://c" };

function make(fetchers, sync) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), "ucm-")), "s.json"));
  const bus = new EventEmitter();
  const events = [];
  bus.on("state", (e) => events.push(e));
  const poller = new Poller({ store, getSettings: () => settings, fetchers, deps: {}, sync, log: () => {}, bus });
  return { store, poller, events };
}

test("sourceKey", () => {
  assert.equal(sourceKey({ source: "canvas", courseId: "74998" }), "canvas:74998");
  assert.equal(sourceKey({ source: "prairielearn", instanceId: "2" }), "prairielearn:2");
  assert.equal(sourceKey({ source: "cs128" }), "cs128");
});

test("merges sources, records changes, persists, emits", async () => {
  const { store, poller, events } = make({ canvas: async () => [mk("canvas:1:9")], prairielearn: async () => [mk("pl:2:5")] });
  const r = await poller.run();
  assert.equal(store.state.assignments.length, 2);
  assert.equal(r.changes.length, 2);
  assert.equal(store.state.sources["canvas:1"].state, "ok");
  assert.ok(store.state.lastPoll);
  assert.equal(events.length, 1);
});

test("failed source keeps previous data and is marked", async () => {
  let fail = false;
  const { store, poller } = make({ canvas: async () => { if (fail) throw new Error("boom"); return [mk("canvas:1:9")]; }, prairielearn: async () => [] });
  await poller.run();
  fail = true;
  const r = await poller.run();
  assert.equal(store.state.assignments.length, 1, "canvas data retained");
  assert.equal(store.state.sources["canvas:1"].state, "error");
  assert.match(store.state.sources["canvas:1"].message, /boom/);
  assert.equal(r.changes.length, 0);
});

test("login required marks needs_login with url", async () => {
  const { store, poller } = make({ canvas: async () => [], prairielearn: async () => { throw new LoginRequiredError("https://shib/x"); } });
  await poller.run();
  assert.equal(store.state.sources["prairielearn:2"].state, "needs_login");
  assert.equal(store.state.sources["prairielearn:2"].loginUrl, "https://shib/x");
});

test("removal reported only after successful fetch", async () => {
  let items = [mk("canvas:1:9")];
  const { store, poller } = make({ canvas: async () => items, prairielearn: async () => [] });
  await poller.run();
  items = [];
  const r = await poller.run();
  assert.deepEqual(r.changes.map((c) => c.type), ["removed"]);
  assert.equal(store.state.assignments.length, 0);
});

test("sync called only when changes and errors are captured", async () => {
  let calls = 0;
  const { poller, store } = make({ canvas: async () => [mk("canvas:1:9")], prairielearn: async () => [] }, async () => { calls++; throw new Error("gfail"); });
  await poller.run();
  assert.equal(calls, 1);
  assert.match(store.state.sources.google.message, /gfail/);
  await poller.run();
  assert.equal(calls, 1);
});

test("run is not re-entrant", async () => {
  let n = 0;
  const { poller } = make({ canvas: async () => { n++; await new Promise((r) => setTimeout(r, 20)); return []; }, prairielearn: async () => [] });
  await Promise.all([poller.run(), poller.run()]);
  assert.equal(n, 1);
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement**

```js
import { diffSnapshots } from "./diff.mjs";
import { LoginRequiredError } from "./browser.mjs";

export function sourceKey(c) {
  if (c.source === "canvas") return `canvas:${c.courseId}`;
  if (c.source === "prairielearn") return `prairielearn:${c.instanceId}`;
  return c.source;
}

export class Poller {
  #timer = null; #inflight = null; #nextAt = null;
  constructor({ store, getSettings, fetchers, deps, sync = null, log = () => {}, bus, now = () => new Date() }) {
    Object.assign(this, { store, getSettings, fetchers, deps, sync, log, bus, now });
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
    const at = this.now().toISOString();
    const previous = this.store.state.assignments;
    const sources = { ...this.store.state.sources };
    const fresh = new Map();      // key -> assignments
    const succeeded = new Set();
    for (const cfg of settings.courses) {
      const key = sourceKey(cfg);
      const fetcher = this.fetchers[cfg.source];
      try {
        if (!fetcher) throw new Error(`no fetcher for ${cfg.source}`);
        const items = await fetcher(cfg, { ...this.deps, settings, now: this.now() });
        fresh.set(key, items.map((a) => ({ ...a, seenAt: at })));
        succeeded.add(key);
        sources[key] = { state: "ok", message: `${items.length} items`, at, count: items.length };
        this.log(`${key}: ${items.length} items`);
      } catch (e) {
        const isLogin = e instanceof LoginRequiredError;
        sources[key] = { state: isLogin ? "needs_login" : "error", message: e.message, at, count: sources[key]?.count ?? 0, ...(isLogin ? { loginUrl: e.url } : {}) };
        this.log(`${key}: ${isLogin ? "login required" : "ERROR " + e.message}`);
      }
    }
    const keyOf = (a) => sourceKey(settings.courses.find((c) => c.source === a.source && (c.source === "cs128" || a.id.startsWith(`${c.source === "prairielearn" ? "pl" : c.source}:${c.courseId ?? c.instanceId}:`))) ?? { source: a.source });
    const retained = previous.filter((a) => !succeeded.has(keyOf(a)));
    const current = [...retained, ...[...fresh.values()].flat()];
    const changes = diffSnapshots(previous, current);
    this.store.state.assignments = current;
    this.store.state.sources = sources;
    this.store.state.lastPoll = at;
    this.store.pushChanges(changes);
    for (const c of changes) this.log(`change: ${c.type} ${c.course} ${c.title}${c.from || c.to ? ` (${c.from ?? "-"} -> ${c.to ?? "-"})` : ""}`);
    if (this.sync && changes.length) {
      try {
        const s = await this.sync(current);
        sources.google = { state: "ok", message: `tasks: +${s.created} ~${s.updated} -${s.deleted}${s.errors?.length ? ` (${s.errors.length} errors)` : ""}`, at };
        if (s.errors?.length) this.log(`tasks sync errors: ${s.errors.join("; ")}`);
      } catch (e) { sources.google = { state: "error", message: e.message, at }; this.log(`tasks sync ERROR ${e.message}`); }
      this.store.state.sources = sources;
    }
    this.store.save();
    this.bus.emit("state", { lastPoll: at, changes: changes.length });
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
```

Note: `keyOf` maps a stored assignment back to its source key via id prefix (`canvas:<courseId>:`, `pl:<instanceId>:`, `cs128:`) so retained data is per-source, not per-source-type.

- [ ] **Step 4: PASS, commit** `feat: poller with failure isolation and change log`.

---

### Task 11: Google OAuth (desktop loopback)

**Files:**
- Create: `lib/google/auth.mjs`, `test/google-auth.test.mjs`

**Interfaces:**
- Produces: `class GoogleAuth { constructor({ tokenFile, getSettings, fetchImpl = fetch, now }); authUrl({ redirectUri }) -> { url, state }; handleCallback({ code, state, redirectUri }); getAccessToken() -> string; get connected; disconnect() }`.
- Endpoints: auth `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code&access_type=offline&prompt=consent&scope=https://www.googleapis.com/auth/tasks`; token `https://oauth2.googleapis.com/token` (form-encoded). Token file `{ refreshToken, accessToken, expiresAt }`.

- [ ] **Step 1: Test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoogleAuth } from "../lib/google/auth.mjs";

const dir = mkdtempSync(join(tmpdir(), "ucm-"));
const settings = () => ({ google: { clientId: "cid", clientSecret: "sec" } });

test("authUrl carries client id, scope, redirect, state", () => {
  const g = new GoogleAuth({ tokenFile: join(dir, "t.json"), getSettings: settings });
  const { url, state } = g.authUrl({ redirectUri: "http://127.0.0.1:4258/oauth/callback" });
  const u = new URL(url);
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/tasks");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("state"), state);
});

test("callback exchanges code, stores refresh token, refreshes when expired", async () => {
  const posts = [];
  let t = 1_000_000;
  const fetchImpl = async (url, opts) => {
    posts.push(Object.fromEntries(new URLSearchParams(opts.body)));
    const grant = posts.at(-1).grant_type;
    return { ok: true, json: async () => (grant === "authorization_code" ? { access_token: "a1", refresh_token: "r1", expires_in: 3600 } : { access_token: "a2", expires_in: 3600 }) };
  };
  const g = new GoogleAuth({ tokenFile: join(dir, "t2.json"), getSettings: settings, fetchImpl, now: () => t });
  const { state } = g.authUrl({ redirectUri: "http://127.0.0.1:1/oauth/callback" });
  await assert.rejects(g.handleCallback({ code: "c", state: "wrong", redirectUri: "x" }), /state/);
  await g.handleCallback({ code: "c", state, redirectUri: "http://127.0.0.1:1/oauth/callback" });
  assert.equal(g.connected, true);
  assert.equal(await g.getAccessToken(), "a1");
  t += 3600 * 1000;
  assert.equal(await g.getAccessToken(), "a2");
  assert.equal(posts.at(-1).grant_type, "refresh_token");
  assert.equal(posts.at(-1).refresh_token, "r1");
  const g2 = new GoogleAuth({ tokenFile: join(dir, "t2.json"), getSettings: settings, fetchImpl, now: () => t });
  assert.equal(g2.connected, true);
  g2.disconnect();
  assert.equal(g2.connected, false);
  assert.equal(existsSync(join(dir, "t2.json")), false);
});

test("getAccessToken throws when not connected", async () => {
  const g = new GoogleAuth({ tokenFile: join(dir, "t3.json"), getSettings: settings });
  await assert.rejects(g.getAccessToken(), /not connected/i);
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement**

```js
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

export const SCOPE = "https://www.googleapis.com/auth/tasks";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SKEW_MS = 60_000;

export class GoogleAuth {
  #tok = null; #state = null;
  constructor({ tokenFile, getSettings, fetchImpl = fetch, now = () => Date.now() }) {
    Object.assign(this, { tokenFile, getSettings, fetchImpl, now });
    if (existsSync(tokenFile)) { try { this.#tok = JSON.parse(readFileSync(tokenFile, "utf8")); } catch { this.#tok = null; } }
  }
  get connected() { return Boolean(this.#tok?.refreshToken); }

  #creds() {
    const { clientId, clientSecret } = this.getSettings().google ?? {};
    if (!clientId || !clientSecret) throw new Error("Google client id/secret not set in settings");
    return { clientId, clientSecret };
  }

  authUrl({ redirectUri }) {
    const { clientId } = this.#creds();
    this.#state = randomBytes(16).toString("hex");
    const u = new URL(AUTH_URL);
    for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state: this.#state })) u.searchParams.set(k, v);
    return { url: u.toString(), state: this.#state };
  }

  async #token(params) {
    const { clientId, clientSecret } = this.#creds();
    const res = await this.fetchImpl(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }).toString() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(`Google token error: ${data.error_description || data.error || res.status}`);
    return data;
  }

  #save() { mkdirSync(dirname(this.tokenFile), { recursive: true }); writeFileSync(this.tokenFile, JSON.stringify(this.#tok, null, 2) + "\n"); }

  async handleCallback({ code, state, redirectUri }) {
    if (!state || state !== this.#state) throw new Error("OAuth state mismatch");
    this.#state = null;
    const d = await this.#token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    if (!d.refresh_token) throw new Error("Google did not return a refresh token; remove the app at myaccount.google.com/permissions and connect again");
    this.#tok = { refreshToken: d.refresh_token, accessToken: d.access_token, expiresAt: this.now() + d.expires_in * 1000 };
    this.#save();
  }

  async getAccessToken() {
    if (!this.connected) throw new Error("Google not connected");
    if (this.#tok.accessToken && this.#tok.expiresAt - SKEW_MS > this.now()) return this.#tok.accessToken;
    const d = await this.#token({ grant_type: "refresh_token", refresh_token: this.#tok.refreshToken });
    this.#tok = { ...this.#tok, accessToken: d.access_token, expiresAt: this.now() + d.expires_in * 1000 };
    this.#save();
    return this.#tok.accessToken;
  }

  forgetAccessToken() { if (this.#tok) { this.#tok.expiresAt = 0; } }

  disconnect() { this.#tok = null; if (existsSync(this.tokenFile)) unlinkSync(this.tokenFile); }
}
```

- [ ] **Step 4: PASS, commit** `feat: google desktop oauth`.

---

### Task 12: Google Tasks client

**Files:**
- Create: `lib/google/tasks.mjs`, `test/google-tasks.test.mjs`

**Interfaces:**
- Consumes: `GoogleAuth.getAccessToken()`, `forgetAccessToken()`.
- Produces: `class TasksApi { constructor({ auth, fetchImpl = fetch }); ensureList(title, cachedId) -> listId; listTasks(listId) -> Task[]; insertTask(listId, task); patchTask(listId, id, patch); deleteTask(listId, id) }`. Base `https://tasks.googleapis.com/tasks/v1`. Retries once on 401 after `forgetAccessToken()`. `listTasks` pages with `maxResults=100&showCompleted=true&showHidden=true`.

- [ ] **Step 1: Test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { TasksApi } from "../lib/google/tasks.mjs";

function fake(routes) {
  const calls = [];
  const auth = { n: 0, getAccessToken: async () => "tok" + auth.n, forgetAccessToken: () => { auth.n++; } };
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method ?? "GET", auth: opts.headers?.Authorization, body: opts.body ? JSON.parse(opts.body) : null });
    const r = routes(String(url), opts, calls.length);
    return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)) };
  };
  return { api: new TasksApi({ auth, fetchImpl }), calls };
}

test("ensureList finds by title or creates", async () => {
  const { api, calls } = fake((url, opts) => {
    if (url.includes("/users/@me/lists") && !opts.method) return { status: 200, body: { items: [{ id: "L1", title: "Other" }] } };
    if (url.includes("/users/@me/lists") && opts.method === "POST") return { status: 200, body: { id: "L2", title: "UIUC Homework" } };
    if (url.endsWith("/users/@me/lists/L9")) return { status: 404, body: { error: { message: "nope" } } };
    return { status: 500 };
  });
  assert.equal(await api.ensureList("UIUC Homework", "L9"), "L2");
  assert.equal(calls.at(-1).body.title, "UIUC Homework");
});

test("listTasks pages and includes hidden/completed", async () => {
  const { api, calls } = fake((url) => {
    if (url.includes("pageToken=p2")) return { status: 200, body: { items: [{ id: "t2" }] } };
    return { status: 200, body: { items: [{ id: "t1" }], nextPageToken: "p2" } };
  });
  const items = await api.listTasks("L1");
  assert.deepEqual(items.map((t) => t.id), ["t1", "t2"]);
  assert.match(calls[0].url, /showHidden=true/);
  assert.match(calls[0].url, /showCompleted=true/);
});

test("retries once on 401 with fresh token", async () => {
  const { api, calls } = fake((url, opts, n) => (n === 1 ? { status: 401, body: { error: { message: "expired" } } } : { status: 200, body: { id: "t1" } }));
  await api.insertTask("L1", { title: "x" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer tok0");
  assert.equal(calls[1].auth, "Bearer tok1");
});

test("delete returns null on 204 and errors bubble", async () => {
  const { api } = fake((url, opts) => (opts.method === "DELETE" ? { status: 204 } : { status: 403, body: { error: { message: "denied" } } }));
  assert.equal(await api.deleteTask("L1", "t1"), null);
  await assert.rejects(api.patchTask("L1", "t1", {}), /denied/);
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement**

```js
const BASE = "https://tasks.googleapis.com/tasks/v1";

export class TasksApi {
  constructor({ auth, fetchImpl = fetch }) { this.auth = auth; this.fetchImpl = fetchImpl; }

  async #request(method, path, { body, query } = {}) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const send = async () => this.fetchImpl(url, { method, headers: { Authorization: `Bearer ${await this.auth.getAccessToken()}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let res = await send();
    if (res.status === 401) { this.auth.forgetAccessToken(); res = await send(); }
    if (res.status === 204) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) { const e = new Error(data?.error?.message || `${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  async ensureList(title, cachedId) {
    if (cachedId) {
      try { await this.#request("GET", `/users/@me/lists/${encodeURIComponent(cachedId)}`); return cachedId; }
      catch (e) { if (e.status !== 404) throw e; }
    }
    let pageToken;
    do {
      const page = await this.#request("GET", "/users/@me/lists", { query: { maxResults: "100", ...(pageToken ? { pageToken } : {}) } });
      const hit = (page.items ?? []).find((l) => l.title === title);
      if (hit) return hit.id;
      pageToken = page.nextPageToken;
    } while (pageToken);
    return (await this.#request("POST", "/users/@me/lists", { body: { title } })).id;
  }

  async listTasks(listId) {
    const items = [];
    let pageToken;
    do {
      const page = await this.#request("GET", `/lists/${encodeURIComponent(listId)}/tasks`, { query: { maxResults: "100", showCompleted: "true", showHidden: "true", ...(pageToken ? { pageToken } : {}) } });
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  insertTask(listId, task) { return this.#request("POST", `/lists/${encodeURIComponent(listId)}/tasks`, { body: task }); }
  patchTask(listId, id, patch) { return this.#request("PATCH", `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, { body: patch }); }
  deleteTask(listId, id) { return this.#request("DELETE", `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`); }
}
```

- [ ] **Step 4: PASS, commit** `feat: google tasks client`.

---

### Task 13: Tasks sync

**Files:**
- Create: `lib/google/sync.mjs`, `test/google-sync.test.mjs`

**Interfaces:**
- Consumes: `TasksApi`, `Store.state.google`, `formatChicago`, `chicagoDate`.
- Produces: `LIST_TITLE = "UIUC Homework"`, `toTask(a) -> { title, notes, due?, status }`, `diffTasks(assignments, mapping, tasks) -> { create: [{ assignmentId, task }], patch: [{ assignmentId, taskId, patch }], remove: [{ assignmentId, taskId }], prune: assignmentId[] }`, `runSync({ api, store, assignments, log }) -> { created, updated, deleted, errors }`.
- Rules: title `<title> · <course> · due 11:59 PM` (time from `formatChicago`, only the time part) or `<title> · <course>` when no due; `due` = `chicagoDate(dueAt) + "T00:00:00.000Z"`; `notes` = details + `\n\n` + url, cut at 1024; status `completed` for submitted/graded else `needsAction`; never patch a completed task back to `needsAction`; `prune` = mapping ids whose task no longer exists (recreate them via `create`).

- [ ] **Step 1: Test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTask, diffTasks, runSync, LIST_TITLE } from "../lib/google/sync.mjs";

const a = (over = {}) => ({ id: "pl:1:2", source: "prairielearn", course: "CS 173", title: "HW1 Proofs", dueAt: "2026-09-13T04:59:00.000Z", openAt: null, url: "https://pl/x", details: "100% until 23:59, Sep 12", status: "open", seenAt: "t", ...over });

test("toTask", () => {
  const t = toTask(a());
  assert.equal(t.title, "HW1 Proofs · CS 173 · due 11:59 PM");
  assert.equal(t.due, "2026-09-12T00:00:00.000Z");
  assert.equal(t.status, "needsAction");
  assert.equal(t.notes, "100% until 23:59, Sep 12\n\nhttps://pl/x");
  assert.equal(toTask(a({ dueAt: null })).title, "HW1 Proofs · CS 173");
  assert.equal("due" in toTask(a({ dueAt: null })), false);
  assert.equal(toTask(a({ status: "graded" })).status, "completed");
  assert.equal(toTask(a({ details: "x".repeat(2000) })).notes.length, 1024);
});

test("diffTasks create/patch/remove/prune", () => {
  const tasks = [
    { id: "T1", title: "old", notes: "n", due: "2026-09-12T00:00:00.000Z", status: "needsAction" },
    { id: "T3", title: "HW3 · CS 173 · due 11:59 PM", notes: "d\n\nu", due: "2026-09-20T00:00:00.000Z", status: "completed" },
  ];
  const mapping = { "pl:1:2": "T1", "pl:1:3": "T3", "pl:1:4": "TGONE", "pl:1:9": "T9" };
  const current = [a(), a({ id: "pl:1:3", title: "HW3", dueAt: "2026-09-21T04:59:00.000Z", details: "d", url: "u" }), a({ id: "pl:1:4", title: "HW4" }), a({ id: "pl:1:5", title: "HW5" })];
  const d = diffTasks(current, mapping, tasks);
  assert.deepEqual(d.create.map((c) => c.assignmentId).sort(), ["pl:1:4", "pl:1:5"]);
  assert.deepEqual(d.prune, ["pl:1:4"]);
  assert.equal(d.patch.length, 1);
  assert.equal(d.patch[0].taskId, "T1");
  assert.equal(d.patch[0].patch.title, "HW1 Proofs · CS 173 · due 11:59 PM");
  assert.deepEqual(d.remove, [{ assignmentId: "pl:1:9", taskId: "T9" }]);
});

test("manual completion is preserved", () => {
  const tasks = [{ id: "T1", title: "HW1 Proofs · CS 173 · due 11:59 PM", notes: "100% until 23:59, Sep 12\n\nhttps://pl/x", due: "2026-09-12T00:00:00.000Z", status: "completed" }];
  const d = diffTasks([a()], { "pl:1:2": "T1" }, tasks);
  assert.deepEqual(d.patch, []);
  const d2 = diffTasks([a({ title: "HW1 renamed" })], { "pl:1:2": "T1" }, tasks);
  assert.equal(d2.patch[0].patch.status, undefined);
  assert.equal(d2.patch[0].patch.title, "HW1 renamed · CS 173 · due 11:59 PM");
});

test("runSync applies plan, updates mapping, captures errors", async () => {
  const calls = [];
  const api = {
    ensureList: async (title, cached) => { calls.push(["ensure", title, cached]); return "L1"; },
    listTasks: async () => [{ id: "T1", title: "x", notes: "", status: "needsAction" }],
    insertTask: async (l, t) => { calls.push(["insert", t.title]); if (t.title.startsWith("BAD")) throw new Error("quota"); return { id: "NEW" + calls.length }; },
    patchTask: async (l, id, p) => { calls.push(["patch", id]); return {}; },
    deleteTask: async (l, id) => { calls.push(["delete", id]); return null; },
  };
  const store = { state: { google: { tasklistId: null, mapping: { "pl:1:2": "T1", "pl:1:8": "TGONE" } } }, saved: 0, save() { this.saved++; } };
  const r = await runSync({ api, store, assignments: [a(), a({ id: "pl:1:7", title: "BAD one" })], log: () => {} });
  assert.equal(store.state.google.tasklistId, "L1");
  assert.equal(r.updated, 1);
  assert.equal(r.created, 0);
  assert.equal(r.errors.length, 1);
  assert.equal(store.state.google.mapping["pl:1:8"], undefined);
  assert.ok(store.saved >= 1);
  assert.equal(calls[0][1], LIST_TITLE);
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement**

```js
import { formatChicago, chicagoDate } from "../model.mjs";

export const LIST_TITLE = "UIUC Homework";
const NOTES_MAX = 1024;

export function toTask(a) {
  const time = a.dueAt ? formatChicago(a.dueAt).split(", ").slice(1).join(", ") : null;
  const title = [a.title, a.course, time ? `due ${time}` : null].filter(Boolean).join(" · ");
  const notes = [a.details, a.url].filter(Boolean).join("\n\n").slice(0, NOTES_MAX);
  const t = { title, notes, status: a.status === "submitted" || a.status === "graded" ? "completed" : "needsAction" };
  if (a.dueAt) t.due = `${chicagoDate(a.dueAt)}T00:00:00.000Z`;
  return t;
}

const sameDue = (x, y) => (x ? x.slice(0, 10) : null) === (y ? y.slice(0, 10) : null);

export function diffTasks(assignments, mapping, tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const create = [], patch = [], remove = [], prune = [];
  const seen = new Set();
  for (const a of assignments) {
    seen.add(a.id);
    const wanted = toTask(a);
    const taskId = mapping[a.id];
    const existing = taskId ? byId.get(taskId) : null;
    if (taskId && !existing) prune.push(a.id);
    if (!existing) { create.push({ assignmentId: a.id, task: wanted }); continue; }
    const p = {};
    if ((existing.title ?? "") !== wanted.title) p.title = wanted.title;
    if ((existing.notes ?? "") !== wanted.notes) p.notes = wanted.notes;
    if (!sameDue(existing.due, wanted.due)) p.due = wanted.due ?? null;
    if (existing.status !== wanted.status && !(existing.status === "completed" && wanted.status === "needsAction")) p.status = wanted.status;
    if (Object.keys(p).length) patch.push({ assignmentId: a.id, taskId, patch: p });
  }
  for (const [assignmentId, taskId] of Object.entries(mapping)) {
    if (seen.has(assignmentId)) continue;
    if (byId.has(taskId)) remove.push({ assignmentId, taskId }); else prune.push(assignmentId);
  }
  return { create, patch, remove, prune };
}

export async function runSync({ api, store, assignments, log = () => {} }) {
  const g = store.state.google;
  g.tasklistId = await api.ensureList(LIST_TITLE, g.tasklistId);
  store.save();
  const tasks = await api.listTasks(g.tasklistId);
  const plan = diffTasks(assignments, g.mapping, tasks);
  const errors = [];
  let created = 0, updated = 0, deleted = 0;
  for (const id of plan.prune) delete g.mapping[id];
  for (const { assignmentId, task } of plan.create) {
    try { const t = await api.insertTask(g.tasklistId, task); g.mapping[assignmentId] = t.id; created++; }
    catch (e) { errors.push(`create "${task.title}": ${e.message}`); }
  }
  for (const { taskId, patch } of plan.patch) {
    try { await api.patchTask(g.tasklistId, taskId, patch); updated++; }
    catch (e) { errors.push(`update ${taskId}: ${e.message}`); }
  }
  for (const { assignmentId, taskId } of plan.remove) {
    try { await api.deleteTask(g.tasklistId, taskId); delete g.mapping[assignmentId]; deleted++; }
    catch (e) { errors.push(`delete ${taskId}: ${e.message}`); }
  }
  store.save();
  log(`tasks sync: +${created} ~${updated} -${deleted}${errors.length ? ` errors=${errors.length}` : ""}`);
  return { created, updated, deleted, errors };
}
```

- [ ] **Step 4: PASS, commit** `feat: google tasks sync`.

---

### Task 14: Server

**Files:**
- Create: `server.mjs`, `test/server.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: `createServer({ store, settingsFile, poller, browser, google: { auth, connectUrl }, bus, log, recentLog, publicDir }) -> http.Server`, `main()`.
- Routes (from spec): `GET /`, `GET /api/state`, `GET /api/events` (SSE events `state`, `log`), `POST /api/poll`, `PUT /api/settings`, `GET /api/google/connect` → `{ url }`, `GET /oauth/callback`, `POST /api/google/disconnect`, `POST /api/login/:key` (key = source key, e.g. `prairielearn:223829`; opens headed browser at that source's login URL or page).
- `/api/state` → `{ assignments, changes, sources, lastPoll, nextPoll, polling, google: { connected, tasklistId }, settings: maskSettings(...), log }`.

- [ ] **Step 1: Test**

```js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { Store } from "../lib/store.mjs";
import { createServer } from "../server.mjs";

const dir = mkdtempSync(join(tmpdir(), "ucm-"));
mkdirSync(join(dir, "public"));
writeFileSync(join(dir, "public", "index.html"), "<h1>ui</h1>");
const store = new Store(join(dir, "state.json"));
store.state.assignments = [{ id: "canvas:1:1", course: "X", title: "T", dueAt: null, status: "open" }];
store.state.sources["prairielearn:2"] = { state: "needs_login", loginUrl: "https://shib/x" };
const bus = new EventEmitter();
const calls = [];
const poller = { run: async () => { calls.push("run"); return { changes: [] }; }, running: false, nextAt: "2026-09-03T13:00:00.000Z" };
const browser = { openForLogin: async (u) => calls.push("login:" + u) };
const auth = { connected: false, authUrl: ({ redirectUri }) => ({ url: "https://accounts.google.com/x?r=" + encodeURIComponent(redirectUri), state: "s" }), handleCallback: async ({ code, state }) => { calls.push(`cb:${code}:${state}`); auth.connected = true; }, disconnect: () => { auth.connected = false; } };
const server = createServer({ store, settingsFile: join(dir, "settings.json"), poller, browser, google: { auth }, bus, log: () => {}, recentLog: () => [], publicDir: join(dir, "public") });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());
const j = async (path, opts = {}) => { const res = await fetch(base + path, { headers: { "content-type": "application/json" }, redirect: "manual", ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined }); return { status: res.status, body: res.status === 204 || res.status >= 300 ? null : await res.json(), headers: res.headers }; };

test("index and state", async () => {
  assert.match(await (await fetch(base + "/")).text(), /ui/);
  const { body } = await j("/api/state");
  assert.equal(body.assignments.length, 1);
  assert.equal(body.nextPoll, "2026-09-03T13:00:00.000Z");
  assert.equal(body.google.connected, false);
  assert.equal(body.settings.canvasToken, "");
});

test("rejects foreign origin", async () => {
  const res = await fetch(base + "/api/state", { headers: { origin: "https://evil.example" } });
  assert.equal(res.status, 403);
});

test("poll, settings, login", async () => {
  assert.equal((await j("/api/poll", { method: "POST" })).status, 202);
  assert.ok(calls.includes("run"));
  const s = await j("/api/settings", { method: "PUT", body: { canvasToken: "abcd1234" } });
  assert.equal(s.body.canvasToken, "••••1234");
  assert.equal((await j("/api/settings", { method: "PUT", body: { pollMinutes: 1 } })).status, 400);
  assert.equal((await j("/api/login/prairielearn:2", { method: "POST" })).status, 202);
  assert.ok(calls.includes("login:https://shib/x"));
  assert.equal((await j("/api/login/nope", { method: "POST" })).status, 404);
});

test("google connect + callback + disconnect", async () => {
  const c = await j("/api/google/connect");
  assert.match(c.body.url, /oauth%2Fcallback/);
  const cb = await fetch(base + "/oauth/callback?code=abc&state=s", { redirect: "manual" });
  assert.equal(cb.status, 302);
  assert.ok(calls.includes("cb:abc:s"));
  assert.equal((await j("/api/state")).body.google.connected, true);
  assert.equal((await j("/api/google/disconnect", { method: "POST" })).status, 204);
  assert.equal((await j("/api/state")).body.google.connected, false);
});
```

- [ ] **Step 2: FAIL.** **Step 3: Implement `server.mjs`**

```js
#!/usr/bin/env node
import { createServer as httpCreate } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { loadSettings, saveSettings, maskSettings } from "./lib/settings.mjs";
import { bus as realBus, log as realLog, recentLog as realRecent } from "./lib/log.mjs";
import { Store } from "./lib/store.mjs";
import { Poller, sourceKey } from "./lib/poller.mjs";
import { Browser } from "./lib/browser.mjs";
import { fetchCanvas } from "./lib/sources/canvas.mjs";
import { fetchPrairieLearn, assessmentsUrl } from "./lib/sources/prairielearn.mjs";
import { fetchCs128, CS128_URL } from "./lib/sources/cs128.mjs";
import { GoogleAuth } from "./lib/google/auth.mjs";
import { TasksApi } from "./lib/google/tasks.mjs";
import { runSync } from "./lib/google/sync.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.resume(); } });
    req.on("end", () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error("invalid JSON body"), { status: 400 })); } });
    req.on("error", reject);
  });
}

function isAllowedOrigin(req, port) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  if (!req.headers.host || !hosts.has(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  return new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]).has(origin);
}

export function sourceUrl(cfg) {
  if (cfg.source === "prairielearn") return assessmentsUrl(cfg.instanceId);
  if (cfg.source === "cs128") return CS128_URL;
  return null;
}

export function createServer({ store, settingsFile, poller, browser, google, bus, log, recentLog, publicDir }) {
  const settings = () => loadSettings(settingsFile);
  const statePayload = () => ({
    assignments: store.state.assignments, changes: store.state.changes, sources: store.state.sources,
    lastPoll: store.state.lastPoll, nextPoll: poller.nextAt, polling: poller.running,
    google: { connected: google.auth.connected, tasklistId: store.state.google.tasklistId },
    settings: maskSettings(settings()), log: recentLog(),
  });

  const server = httpCreate(async (req, res) => {
    const m = req.method;
    const port = server.address()?.port;
    if (!port || !isAllowedOrigin(req, port)) return json(res, 403, { error: "forbidden origin" });
    let path = req.url;
    try {
      const url = new URL(req.url, "http://localhost");
      path = url.pathname;
      if (m === "GET" && (path === "/" || path === "/index.html")) {
        const html = readFileSync(join(publicDir, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(html);
      }
      if (m === "GET" && path === "/api/state") return json(res, 200, statePayload());
      if (m === "GET" && path === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        send("state", statePayload());
        const onState = () => send("state", statePayload());
        const onLog = (d) => send("log", d);
        bus.on("state", onState); bus.on("log", onLog);
        const ping = setInterval(() => res.write(": ping\n\n"), 15000);
        const cleanup = () => { clearInterval(ping); bus.off("state", onState); bus.off("log", onLog); };
        req.on("close", cleanup); res.on("close", cleanup); res.on("error", cleanup);
        return;
      }
      if (m === "POST" && path === "/api/poll") { poller.run().catch((e) => log(`poll ERROR ${e.message}`)); return json(res, 202, { ok: true }); }
      if (m === "PUT" && path === "/api/settings") {
        const body = await readBody(req);
        try { const saved = saveSettings(settingsFile, body); bus.emit("state", {}); return json(res, 200, maskSettings(saved)); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      const login = path.match(/^\/api\/login\/(.+)$/);
      if (m === "POST" && login) {
        const key = decodeURIComponent(login[1]);
        const cfg = settings().courses.find((c) => sourceKey(c) === key);
        if (!cfg) return json(res, 404, { error: "unknown source" });
        const target = store.state.sources[key]?.loginUrl || sourceUrl(cfg);
        if (!target) return json(res, 400, { error: "this source has no browser login" });
        browser.openForLogin(target).catch((e) => log(`login window ERROR ${e.message}`));
        return json(res, 202, { ok: true });
      }
      if (m === "GET" && path === "/api/google/connect") {
        try { const { url: u } = google.auth.authUrl({ redirectUri: `http://127.0.0.1:${port}/oauth/callback` }); return json(res, 200, { url: u }); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      if (m === "GET" && path === "/oauth/callback") {
        const err = url.searchParams.get("error");
        if (err) { res.writeHead(400, { "content-type": "text/plain" }); return res.end(`Google sign-in failed: ${err}`); }
        await google.auth.handleCallback({ code: url.searchParams.get("code"), state: url.searchParams.get("state"), redirectUri: `http://127.0.0.1:${port}/oauth/callback` });
        log("Google Tasks connected");
        bus.emit("state", {});
        poller.run().catch(() => {});
        res.writeHead(302, { location: "/" });
        return res.end();
      }
      if (m === "POST" && path === "/api/google/disconnect") { google.auth.disconnect(); bus.emit("state", {}); return json(res, 204); }
      return json(res, 404, { error: "not found" });
    } catch (e) {
      const status = e.status ?? 500;
      if (status === 500) log(`HTTP ERROR ${m} ${path}: ${e.message}`);
      if (res.headersSent) return res.end();
      return json(res, status, { error: e.message });
    }
  });
  return server;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd[0], cmd[1], () => {});
}

export async function main() {
  const settingsFile = join(ROOT, "settings.json");
  const getSettings = () => loadSettings(settingsFile);
  mkdirSync(join(ROOT, "data"), { recursive: true });
  process.on("unhandledRejection", (e) => realLog(`UNHANDLED: ${e?.stack ?? e}`));
  process.on("uncaughtException", (e) => realLog(`UNCAUGHT: ${e?.stack ?? e}`));
  const store = new Store(join(ROOT, "data", "state.json"));
  if (store.loadError) realLog(`STATE FILE PROBLEM: ${store.loadError}`);
  const browser = new Browser({ profileDir: join(ROOT, "profile"), log: realLog });
  const auth = new GoogleAuth({ tokenFile: join(ROOT, "data", "google-token.json"), getSettings });
  const api = new TasksApi({ auth });
  const fetchers = {
    canvas: (cfg, { settings }) => fetchCanvas(cfg, { base: settings.canvasBase, token: settings.canvasToken }),
    prairielearn: (cfg, deps) => fetchPrairieLearn(cfg, deps),
    cs128: (cfg, deps) => fetchCs128(cfg, deps),
  };
  const sync = (assignments) => (auth.connected ? runSync({ api, store, assignments, log: realLog }) : Promise.resolve({ created: 0, updated: 0, deleted: 0, errors: [] }));
  const poller = new Poller({ store, getSettings, fetchers, deps: { browser }, sync: (a) => (auth.connected ? sync(a) : null) && sync(a), log: realLog, bus: realBus });
  const server = createServer({ store, settingsFile, poller, browser, google: { auth }, bus: realBus, log: realLog, recentLog: realRecent, publicDir: join(ROOT, "public") });
  const port = getSettings().port;
  server.on("error", (e) => { if (e.code === "EADDRINUSE") { console.error(`\nPort ${port} in use. Set a different "port" in settings.json.\n`); process.exit(1); } throw e; });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    realLog(`listening on ${url}`);
    openBrowser(url);
    poller.start();
  });
  const shutdown = async () => { poller.stop(); await browser.close(); server.close(); process.exit(0); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

Fix the awkward `sync:` line in `main()` to simply `sync: (a) => auth.connected ? runSync({ api, store, assignments: a, log: realLog }) : { created: 0, updated: 0, deleted: 0, errors: [] }` and delete the separate `sync` const. (The Poller treats a non-null `sync` as callable; returning a plain summary when disconnected is fine.)

- [ ] **Step 4: PASS, commit** `feat: http server, sse, oauth callback`.

---

### Task 15: UI

**Files:**
- Create: `public/index.html`

No unit tests (verified manually in Task 16). Vanilla HTML/CSS/JS, dark-friendly, one file.

- [ ] **Step 1: Write `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UIUC Collective Mind</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --line:#262b36; --fg:#e6e8ee; --muted:#8b93a7; --accent:#ff7a1a; --ok:#3ddc84; --warn:#ffcc33; --bad:#ff5f5f; }
  @media (prefers-color-scheme: light) { :root { --bg:#f6f7fa; --card:#fff; --line:#e3e6ee; --fg:#161922; --muted:#667085; } }
  * { box-sizing:border-box } body { margin:0; font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg) }
  header { display:flex; gap:12px; align-items:center; padding:12px 20px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); z-index:2 }
  header h1 { font-size:16px; margin:0 12px 0 0 } .spacer { flex:1 } .muted { color:var(--muted) }
  button { background:var(--card); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:6px 10px; cursor:pointer } button.primary { background:var(--accent); border-color:var(--accent); color:#000 }
  main { max-width:1100px; margin:0 auto; padding:16px 20px; display:grid; grid-template-columns:2fr 1fr; gap:20px } @media (max-width:800px){ main{grid-template-columns:1fr} }
  .banner { grid-column:1/-1; background:#3a2a00; border:1px solid var(--warn); color:#ffe08a; padding:10px 14px; border-radius:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap }
  .banner.bad { background:#3a0f0f; border-color:var(--bad); color:#ffb3b3 }
  .chips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px } .chip { border:1px solid var(--line); border-radius:999px; padding:3px 10px; cursor:pointer; background:var(--card) } .chip.on { border-color:var(--accent); color:var(--accent) }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:18px 0 8px }
  .day { margin-bottom:14px } .day h3 { font-size:14px; margin:0 0 6px } .day h3 small { color:var(--muted); font-weight:normal; margin-left:6px }
  .item { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 12px; margin-bottom:6px; display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center }
  .course { font-size:11px; font-weight:600; padding:2px 6px; border-radius:4px; background:var(--line); white-space:nowrap }
  .item a { color:inherit; text-decoration:none } .item a:hover { text-decoration:underline }
  .time { color:var(--muted); white-space:nowrap } .status { font-size:11px; padding:2px 6px; border-radius:4px; margin-left:6px }
  .status.open{background:#2b3a55;color:#9dc1ff} .status.submitted{background:#173d2a;color:var(--ok)} .status.graded{background:#173d2a;color:var(--ok)} .status.closed{background:#3d1717;color:var(--bad)} .status.unknown{background:var(--line);color:var(--muted)}
  .item details { grid-column:1/-1; color:var(--muted); white-space:pre-wrap } .item summary { cursor:pointer; color:var(--muted) }
  .overdue .time { color:var(--bad) }
  aside .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:14px }
  .src { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--line) } .src:last-child{border:0}
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px } .dot.ok{background:var(--ok)} .dot.error{background:var(--bad)} .dot.needs_login{background:var(--warn)}
  .change { padding:4px 0; border-bottom:1px solid var(--line); font-size:13px } .change:last-child{border:0} .change .t { color:var(--muted); font-size:11px }
  label { display:block; margin:8px 0 4px; color:var(--muted); font-size:12px } input { width:100%; padding:6px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--fg) }
  dialog { background:var(--card); color:var(--fg); border:1px solid var(--line); border-radius:10px; width:min(560px,90vw) } dialog::backdrop{background:#0008}
  textarea { width:100%; min-height:160px; font:12px/1.4 ui-monospace,Menlo,monospace; background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:8px }
  #log { font:11px/1.4 ui-monospace,Menlo,monospace; max-height:200px; overflow:auto; white-space:pre-wrap; color:var(--muted) }
</style>
</head>
<body>
<header>
  <h1>UIUC Collective Mind</h1>
  <span class="muted" id="pollinfo">…</span>
  <span class="spacer"></span>
  <span id="gstatus" class="muted"></span>
  <button id="gbtn"></button>
  <button id="pull" class="primary">Pull now</button>
  <button id="settingsbtn">Settings</button>
</header>
<main>
  <div id="banners" style="display:contents"></div>
  <section>
    <div class="chips" id="chips"></div>
    <h2>Upcoming</h2>
    <div id="upcoming"></div>
    <h2>No due date</h2>
    <div id="undated"></div>
    <details><summary class="muted">Past</summary><div id="past"></div></details>
  </section>
  <aside>
    <div class="card"><h2 style="margin-top:0">Sources</h2><div id="sources"></div></div>
    <div class="card"><h2 style="margin-top:0">Changes</h2><div id="changes"></div></div>
    <div class="card"><h2 style="margin-top:0">Log</h2><div id="log"></div></div>
  </aside>
</main>
<dialog id="settings">
  <form method="dialog" id="sform">
    <h2 style="margin-top:0">Settings</h2>
    <label>Canvas access token <span class="muted">(Canvas → Account → Settings → New Access Token)</span></label>
    <input name="canvasToken" placeholder="leave blank to keep current">
    <label>Poll interval (minutes)</label><input name="pollMinutes" type="number" min="5" max="720">
    <label>Google OAuth client ID (Desktop app)</label><input name="clientId">
    <label>Google OAuth client secret</label><input name="clientSecret" placeholder="leave blank to keep current">
    <label>Courses (JSON)</label><textarea name="courses"></textarea>
    <p id="serr" style="color:var(--bad)"></p>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px"><button type="button" id="scancel">Cancel</button><button class="primary" id="ssave">Save</button></div>
  </form>
</dialog>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TZ = "America/Chicago";
const fmtTime = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
const dayKey = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const rel = (iso) => { const d = (new Date(iso) - Date.now()) / 36e5; if (Math.abs(d) < 1) return `${Math.round(d * 60)} min`; if (Math.abs(d) < 48) return `${Math.round(d)} h`; return `${Math.round(d / 24)} d`; };
let state = null; let filter = JSON.parse(localStorage.getItem("filter") || "null");

function render() {
  if (!state) return;
  const courses = [...new Set(state.settings.courses.map((c) => c.course))];
  if (filter && !courses.includes(filter)) filter = null;
  $("#chips").innerHTML = [`<span class="chip ${filter ? "" : "on"}" data-c="">All</span>`, ...courses.map((c) => `<span class="chip ${filter === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</span>`)].join("");
  const items = state.assignments.filter((a) => !filter || a.course === filter);
  const now = Date.now();
  const upcoming = items.filter((a) => a.dueAt && Date.parse(a.dueAt) >= now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const past = items.filter((a) => a.dueAt && Date.parse(a.dueAt) < now).sort((a, b) => Date.parse(b.dueAt) - Date.parse(a.dueAt)).slice(0, 60);
  const undated = items.filter((a) => !a.dueAt).sort((a, b) => a.course.localeCompare(b.course) || a.title.localeCompare(b.title));
  const row = (a) => `<div class="item ${a.dueAt && Date.parse(a.dueAt) < now && a.status === "open" ? "overdue" : ""}">
      <span class="course">${esc(a.course)}</span>
      <span><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a><span class="status ${esc(a.status)}">${esc(a.status)}</span></span>
      <span class="time">${a.dueAt ? `${fmtTime(a.dueAt)} <small>(${rel(a.dueAt)})</small>` : ""}</span>
      ${a.details ? `<details><summary>details</summary>${esc(a.details)}</details>` : ""}
    </div>`;
  const groups = (list) => { const g = new Map(); for (const a of list) { const k = dayKey(a.dueAt); if (!g.has(k)) g.set(k, []); g.get(k).push(a); } return [...g.values()].map((arr) => `<div class="day"><h3>${fmtDay(arr[0].dueAt)}<small>${arr.length}</small></h3>${arr.map(row).join("")}</div>`).join(""); };
  $("#upcoming").innerHTML = upcoming.length ? groups(upcoming) : `<p class="muted">Nothing upcoming.</p>`;
  $("#past").innerHTML = groups(past);
  $("#undated").innerHTML = undated.length ? undated.map(row).join("") : `<p class="muted">None.</p>`;

  const src = Object.entries(state.sources).filter(([k]) => k !== "google");
  $("#sources").innerHTML = src.map(([k, s]) => `<div class="src"><span><span class="dot ${esc(s.state)}"></span>${esc(k)}</span><span class="muted" title="${esc(s.message)}">${s.state === "ok" ? `${s.count} items` : esc(s.state)}${s.state === "needs_login" ? ` <button data-login="${esc(k)}">Log in</button>` : ""}</span></div>`).join("") || `<p class="muted">No polls yet.</p>`;
  const g = state.sources.google;
  const banners = [];
  for (const [k, s] of src) if (s.state === "needs_login") banners.push(`<div class="banner">🔐 <b>${esc(k)}</b> needs you to log in. <button data-login="${esc(k)}">Open login window</button> <span class="muted">then click Pull now</span></div>`);
  for (const [k, s] of src) if (s.state === "error") banners.push(`<div class="banner bad">⚠️ <b>${esc(k)}</b>: ${esc(s.message)}</div>`);
  if (g?.state === "error") banners.push(`<div class="banner bad">⚠️ Google Tasks: ${esc(g.message)}</div>`);
  if (!state.settings.canvasToken) banners.push(`<div class="banner">Canvas token not set — open Settings.</div>`);
  $("#banners").innerHTML = banners.join("");

  const label = { added: "added", removed: "removed", due_changed: "due moved", status_changed: "status" };
  const f = (v) => (v && /^\d{4}-/.test(v) ? `${fmtDay(v)} ${fmtTime(v)}` : v ?? "—");
  $("#changes").innerHTML = state.changes.slice(0, 40).map((c) => `<div class="change"><div><b>${esc(c.course)}</b> · ${esc(c.title)} <span class="muted">${label[c.type]}</span>${c.type === "due_changed" || c.type === "status_changed" ? `<div class="muted">${esc(f(c.from))} → ${esc(f(c.to))}</div>` : c.to ? `<div class="muted">due ${esc(f(c.to))}</div>` : ""}</div><div class="t">${esc(fmtDay(c.at))} ${esc(fmtTime(c.at))}</div></div>`).join("") || `<p class="muted">No changes yet.</p>`;

  $("#pollinfo").textContent = `${state.polling ? "polling…" : state.lastPoll ? `last ${fmtTime(state.lastPoll)}` : "not polled yet"}${state.nextPoll ? ` · next ${fmtTime(state.nextPoll)}` : ""}`;
  $("#gstatus").textContent = state.google.connected ? `Google Tasks ✓${g?.message ? " · " + g.message : ""}` : "Google Tasks not connected";
  $("#gbtn").textContent = state.google.connected ? "Disconnect" : "Connect Google";
  $("#log").textContent = state.log.slice(-60).map((l) => `${l.at.slice(11, 19)} ${l.msg}`).join("\n");
}

document.addEventListener("click", async (e) => {
  const chip = e.target.closest(".chip"); if (chip) { filter = chip.dataset.c || null; localStorage.setItem("filter", JSON.stringify(filter)); render(); return; }
  const login = e.target.closest("[data-login]"); if (login) { await fetch(`/api/login/${encodeURIComponent(login.dataset.login)}`, { method: "POST" }); return; }
});
$("#pull").onclick = () => fetch("/api/poll", { method: "POST" });
$("#gbtn").onclick = async () => {
  if (state.google.connected) { await fetch("/api/google/disconnect", { method: "POST" }); return; }
  const r = await fetch("/api/google/connect"); const b = await r.json();
  if (!r.ok) { alert(b.error); $("#settings").showModal(); return; }
  location.href = b.url;
};
$("#settingsbtn").onclick = () => {
  const f = $("#sform"); f.pollMinutes.value = state.settings.pollMinutes; f.clientId.value = state.settings.google.clientId; f.courses.value = JSON.stringify(state.settings.courses, null, 2); f.canvasToken.value = ""; f.clientSecret.value = ""; $("#serr").textContent = "";
  $("#settings").showModal();
};
$("#scancel").onclick = () => $("#settings").close();
$("#sform").onsubmit = async (e) => {
  e.preventDefault(); const f = e.target; const patch = { pollMinutes: Number(f.pollMinutes.value), google: { clientId: f.clientId.value } };
  if (f.canvasToken.value) patch.canvasToken = f.canvasToken.value;
  if (f.clientSecret.value) patch.google.clientSecret = f.clientSecret.value;
  try { patch.courses = JSON.parse(f.courses.value); } catch { $("#serr").textContent = "Courses must be valid JSON"; return; }
  const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
  if (!r.ok) { $("#serr").textContent = (await r.json()).error; return; }
  $("#settings").close();
};

function connect() {
  const es = new EventSource("/api/events");
  es.addEventListener("state", (e) => { state = JSON.parse(e.data); render(); });
  es.addEventListener("log", (e) => { if (!state) return; state.log.push(JSON.parse(e.data)); $("#log").textContent = state.log.slice(-60).map((l) => `${l.at.slice(11, 19)} ${l.msg}`).join("\n"); $("#log").scrollTop = 1e9; });
  es.onerror = () => { es.close(); setTimeout(connect, 2000); };
}
connect();
setInterval(render, 60_000);
</script>
</body>
</html>
```

- [ ] **Step 2: Start server, open `http://localhost:4258`, confirm page renders with "No polls yet" / banners.** `npm start`.

- [ ] **Step 3: Commit** `feat: web ui`.

---

### Task 16: End-to-end bring-up + README

**Files:**
- Create: `README.md`
- Possibly modify adapters if live data differs from fixtures.

- [ ] **Step 1: Canvas** — user creates a token (Canvas → Account → Settings → + New Access Token), pastes it in Settings, clicks Pull now. Verify three Canvas sources show `ok` with counts and assignments appear. If a course returns 401/403, log the message in the banner (course may not be published yet).

- [ ] **Step 2: PrairieLearn + cs128** — first poll will mark them `needs_login` (fresh profile). Click "Log in", complete NetID + Duo in the window, click Pull now. Verify all three PL instances and cs128 show `ok`. Compare due dates against the live pages for 3 items each; fix parsers (and extend fixtures) if any mismatch.

- [ ] **Step 3: Google** — user creates Desktop-app OAuth client in the existing GCP project, enables **Google Tasks API**, adds themselves as test user, pastes client id/secret into Settings, clicks Connect Google, completes consent. Verify a "UIUC Homework" list appears in Google Tasks / Calendar side panel with all upcoming items, titles with due times, and submitted ones checked.

- [ ] **Step 4: Change detection** — edit `data/state.json` to move one assignment's `dueAt` by a day, restart, Pull now; confirm the Changes feed shows `due moved` and the Google task's date updates.

- [ ] **Step 5: README.md**

```markdown
# UIUC Collective Mind

One page for every homework this semester. A local Node server polls Canvas,
PrairieLearn and cs128.org every 30 minutes, shows everything grouped by due
date, tells you what changed, and mirrors each assignment into a Google Tasks
list called **UIUC Homework** (visible in Google Calendar's tasks layer).

## Setup

    npm install
    npx playwright install chromium
    npm start          # opens http://localhost:4258

1. **Canvas**: Canvas → Account → Settings → *New Access Token*. Paste it in Settings.
2. **PrairieLearn / cs128.org**: when a source shows *needs login*, click **Log in**,
   finish NetID + Duo in the Chromium window, then **Pull now**. The session is
   kept in `profile/` (never commit it).
3. **Google Tasks** (optional): in Google Cloud Console enable the *Google Tasks API*,
   create an OAuth client of type **Desktop app**, add yourself as a test user,
   paste client id + secret in Settings, click **Connect Google**.

Courses live in `settings.json` (`courses` array) — edit in Settings for a new term.

## Development

    npm test

- `lib/sources/*` — one adapter per site; `parse()` is pure and fixture-tested.
- `lib/poller.mjs` — polling, failure isolation, change detection.
- `lib/google/*` — OAuth, Tasks client, pure diff sync.
- `test/fixtures/` — captured HTML/JSON (scrubbed of personal data).
```

- [ ] **Step 6: Run full test suite, commit** `docs: README; e2e fixes`.

---

### Task 16: Capture SmartPhysics fixture

**Files:**
- Modify: `test/fixtures/NOTES.md` (add smartphysics notes)
- Create: `test/fixtures/smartphysics-assignments.html`

This task involves running the capture script so we have real HTML to test the parser against.
- [ ] **Step 1: Capture smartphysics**
Run: `node scripts/capture.mjs "https://smart.physics.illinois.edu/Course?enrollmentID=164636" test/fixtures/smartphysics-assignments.html`
- [ ] **Step 2: Scrub + document** (add notes to NOTES.md)
- [ ] **Step 3: Commit**

---

### Task 17: SmartPhysics adapter

**Files:**
- Create: `lib/sources/smartphysics.mjs`, `test/smartphysics.test.mjs`

**Interfaces:**
- Produces: `parseSmartPhysics(html, ctx) -> Assignment[]`, `fetchSmartPhysics({ course, enrollmentId }, { browser, now }) -> Assignment[]`
- [ ] **Step 1: Failing test** based on the fixture
- [ ] **Step 2: Implement adapter**
- [ ] **Step 3: Hook up to `lib/settings.mjs` and `server.mjs`**
- [ ] **Step 4: PASS, commit**

---


## Self-review

**Spec coverage:** Sources (T5–T8), data model (T2), adapters with pure parse (T5–T8), browser session + login flow (T9, T14 `/api/login`), poll loop with isolation/retention/changes/persist/SSE/sync trigger (T10, T14), Google Tasks OAuth/list/task/mapping/diff/manual-complete/prune (T11–T13), HTTP API incl. origin guard and masking (T14), UI sections (T15), config defaults (T1), error handling (T4 corrupt state, T10 source errors, T13 per-item errors), testing (each task). Out-of-scope items untouched.

**Placeholders:** Tasks 6–8 contain fixture-dependent `<...>` slots by design; they are filled from captured HTML at execution time, and the notes file records the values. All other code is complete.

**Type consistency:** `Assignment` fields identical across T2/T3/T5/T7/T8/T10/T13. `sourceKey` shape (`canvas:<id>`, `prairielearn:<id>`, `cs128`) used in T10 store keys, T14 login route, T15 UI. `browser.withPage(url, fn)` / `openForLogin(url)` used by T7/T8/T14. `Store.state.google = { tasklistId, mapping }` used by T4/T13/T14. `GoogleAuth.getAccessToken/forgetAccessToken/connected/authUrl/handleCallback/disconnect` used by T12/T14. `runSync` return `{ created, updated, deleted, errors }` consumed by T10.
