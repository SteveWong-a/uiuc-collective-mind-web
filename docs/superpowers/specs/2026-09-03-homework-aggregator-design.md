# UIUC Collective Mind — homework aggregator design

Date: 2026-09-03

## Goal

A localhost web app that continuously aggregates homework, due dates and details
from every course site the user has this term, shows them in one place, and
mirrors them into a dedicated Google Tasks list (which Google Calendar renders
as all-day chips on the due date). No manual "sync" step: while the
server runs it re-pulls every 30 minutes, detects changes, and updates both the
UI and the calendar.

## Sources (Fall 2026)

| Course   | Source                                                    | Access                        |
|----------|-----------------------------------------------------------|-------------------------------|
| CS 128   | https://cs128.org (HW listing, login-gated)               | Playwright, logged-in profile |
| CS 128   | PrairieLearn course instance 143409 (weekly MPs/quizzes)  | Playwright, same profile      |
| CS 173   | PrairieLearn course instance 223829                       | Playwright, same profile      |
| MATH 257 | PrairieLearn course instance 217654                       | Playwright, same profile      |
| MATH 580 | Canvas course 74998                                       | personal .ics feed; browser session for status |
| RHET 105 | Canvas course 72592                                       | personal .ics feed; browser session for status |
| ENG 100  | Canvas course 74325                                       | personal .ics feed; browser session for status |

PrairieLearn assessment pages: `https://us.prairielearn.com/pl/course_instance/<id>/assessments`.

Canvas personal calendar feed (Calendar -> Calendar Feed):
`https://canvas.illinois.edu/feeds/calendars/user_<token>.ics` — one unauthenticated
request covering every enrolled course, so it is the primary Canvas path. It has no
submission status; the logged-in browser session supplies that when available and a
missing session degrades the source to `ok (status via login unavailable)` rather than
failing it.
Canvas base: `https://canvas.illinois.edu`.

Course list and ids live in `settings.json` so next term is a config edit.

## Architecture

Plain Node.js (>= 20, ESM), no framework, no build step. Modeled on the
`uiuc_course_automatic_register` repo (local HTTP server + SSE + Playwright
persistent profile) and the `uiuc_extension_for_praireTest` repo (Google REST client + pure diff sync,
retargeted from Calendar to Tasks).

```
server.mjs            HTTP + SSE + static UI, starts scheduler
lib/model.mjs         Assignment shape, id helpers, normalization
lib/sources/canvas.mjs        fetch personal .ics feed (+ optional session), parse -> Assignment[]
lib/sources/prairielearn.mjs  fetch via Playwright page, parse HTML -> Assignment[]
lib/sources/cs128.mjs         fetch via Playwright page, parse HTML -> Assignment[]
lib/browser.mjs       Playwright persistent context, login detection
lib/poller.mjs        runs all sources, isolates failures, diffs, persists, emits
lib/diff.mjs          pure: previous[] + current[] -> change events
lib/store.mjs         data/state.json read/write (snapshot, changes, source health)
lib/settings.mjs      settings.json load/save with defaults
lib/google/auth.mjs   Desktop OAuth (loopback redirect), refresh-token persistence
lib/google/tasks.mjs  Tasks v1 client (tasklists + tasks CRUD, paging)
lib/google/sync.mjs   pure toTask/diff + runSync (adapted from extension's calendar sync)
lib/google/calendar.mjs  Calendar v3 client (calendarList + events CRUD, paging)
lib/google/blocks.mjs    pure planBlocks/toEvent/diffBlocks + runBlockSync
public/index.html     single-page UI, vanilla JS
test/*.test.mjs       node --test, fixtures under test/fixtures/
```

## Data model

```js
Assignment = {
  id: "canvas:74998:123" | "pl:223829:hw3" | "cs128:mp3",  // deterministic per source
  source: "canvas" | "prairielearn" | "cs128",
  course: "MATH 580",
  title: "Homework 3",
  dueAt: ISO string | null,
  openAt: ISO string | null,
  url: string,
  details: string,            // plain text; description / credit windows / points
  status: "open" | "submitted" | "graded" | "closed" | "unknown",
  seenAt: ISO string          // last poll that returned it
}
```

All times normalized to ISO 8601 UTC; sites report `America/Chicago`, parsers
convert explicitly.

## Adapters

Each adapter exports:

- `parse(input) -> Assignment[]` — pure. Canvas: JSON arrays. PrairieLearn and
  cs128: HTML string. Tested against fixtures captured from the live sites.
- `fetch(ctx) -> Assignment[]` — thin network layer. Canvas: `fetch()` with
  bearer token. PrairieLearn / cs128: navigate a Playwright page, return
  `page.content()`.

Canvas endpoints per course: `GET /api/v1/courses/:id/assignments?include[]=submission&per_page=100`
(follow `Link: rel=next`). Status derived from `submission.workflow_state`.

PrairieLearn: assessments table rows -> label, title, due/credit rule text,
score. Due date = end of the 100% credit window (or the only window). Extra
credit / reduced-credit windows go into `details`.

cs128.org: exact page and selectors determined from HTML the user provides
(or captured via the logged-in Playwright session) during implementation. The
adapter contract stays the same.

## Browser session

`lib/browser.mjs` wraps `chromium.launchPersistentContext("profile/")`.
Default headless. If a navigation lands on a Shibboleth / login URL, the
adapter throws `LoginRequiredError`; the poller marks the source
`needs_login`, and the UI shows a banner with a "Log in" button that relaunches
the browser headed on that URL. After the user finishes Duo, the next poll
proceeds headless again. `profile/` is gitignored.

## Poll loop

`Poller` runs on start and every `pollMinutes` (default 30). Per run:

1. Run every adapter, each wrapped in try/catch. A failure records
   `{ state: "error" | "needs_login", message, at }` for that source and keeps
   the source's previous assignments.
2. Merge successful results with retained results into `current[]`.
3. `diff(previous, current)` -> change events: `added`, `removed`,
   `due_changed`, `status_changed`. Removal is only reported for sources whose
   fetch succeeded this run.
4. Persist snapshot, source health and the last 200 changes to `data/state.json`.
5. Emit `state` over SSE.
6. If any change and Google is connected, run Tasks sync.

`POST /api/poll` triggers an immediate run ("Pull now").

## Google Tasks

Why Tasks, not Calendar events: the user wants checkable to-dos. Tasks with a
due date appear in Google Calendar (tasks layer), the Tasks app, and the Gmail
side panel. Known API limits: `due` keeps the date only (time discarded);
`notes` max 1024 chars; no custom metadata on tasks; no own reminders.

- OAuth: Desktop-app client, scopes
  `https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar`
  (the calendar scope was added later: an older token keeps working for Tasks
  and 403s on Calendar until the user disconnects and connects again).
  `GET /api/google/connect` returns the consent URL; Google redirects to
  `http://127.0.0.1:<port>/oauth/callback`; code exchanged for access + refresh
  tokens stored in `data/google-token.json` (gitignored). Access token refreshed
  automatically; a 401 triggers one refresh + retry.
- Task list named `UIUC Homework`, created if missing; id cached in state.
- The list mirrors outstanding work only: an assignment is mirrored while its
  status is `open` or `unknown`. As soon as it becomes `submitted`, `graded` or
  `closed` it is treated as absent — never created, and a task it is already
  mapped to is **deleted** (finishing the work removes the to-do rather than
  ticking it off). The mapping entry goes with it.
- One task per mirrored assignment:
  - `title`: `HW4 · CS 173 · due 11:59 PM` (time kept in the title because
    the API drops it).
  - `due`: due date in `America/Chicago`, sent as `YYYY-MM-DDT00:00:00.000Z`.
  - `notes`: details + blank line + url, truncated to 1024 chars.
  - `status`: always `needsAction` — everything in the list is still to do.
- Mapping `assignment.id -> task.id` stored in `data/state.json` (Tasks has no
  extendedProperties). On startup, mapping entries whose task no longer exists
  are dropped and recreated.
- Sync = pure `diff(assignments, mappedTasks)` -> create / patch / delete, then
  `runSync` applies with per-item error capture:
  - create for still-outstanding assignments without a mapped task;
  - patch when title, due or notes differ, except that a task the user
    completed manually is never reopened or otherwise patched back open;
  - delete mapped tasks whose assignment is finished, or disappeared from a
    source that fetched successfully; tasks not in the mapping are never
    touched.
- Assignments without a due date get a task with no `due` (shows in the list
  only, not on the calendar).
- Tasks failures are logged and shown in the UI; retried on next poll.

## Google Calendar — evening homework blocks

Tasks answer *what is left*; the blocks answer *when to do it*. On a dedicated
`UIUC Homework` calendar (`timeZone: America/Chicago`, id cached in
`state.google.calendarId`):

- An assignment is blocked while it is `open`/`unknown`, has a deadline, and
  `now >= dueAt - blockWithinHours` (default 24 h).
- Its block is `blockStartHour`–`blockEndHour` (default 20:00–23:00, Chicago)
  on the last evening that still precedes the deadline: the deadline's own
  date when the block starts before it, otherwise the day before. A block
  whose end is already in the past is dropped rather than created.
- Assignments sharing an evening share one event: summary
  `Homework block: <n> due` (or `Homework block: <title> · <course>` for a
  single one), description one `• title · course · due <time>` line plus the
  link per assignment.
- Each event carries `extendedProperties.private.uiucBlock = "YYYY-MM-DD"`.
  `listEvents` returns only marked events, so hand-made events on that
  calendar can never be patched or deleted. The diff is keyed by that date:
  create a missing evening, patch a drifted summary/description/start/end,
  delete an evening that no longer has work (and any duplicate).
- `runBlockSync` lists `now - 2 days … now + 14 days`, applies the diff with
  per-item error capture, and writes its own `sources.googleCalendar`
  (`blocks: +1 ~0 -0`). A 403 anywhere means the calendar scope was never
  granted and is reported as *Google Calendar needs re-consent: click
  Disconnect, then Connect Google again*.

## HTTP API

```
GET  /                      UI
GET  /api/state             { assignments, changes, sources, google, settings(masked), lastPoll }
GET  /api/events            SSE: state, log
POST /api/poll              run now
POST /api/settings          update settings.json (token, feed url, pollMinutes, courses, google client)
GET  /api/google/connect    starts OAuth, returns { url }
GET  /oauth/callback        OAuth redirect target
POST /api/google/disconnect
POST /api/login/:source     relaunch browser headed at the source login page
```

Requests accepted only from `localhost`/`127.0.0.1` host and origin (same
guard as the sniper server).

## UI

Single page, no build:

- Header: last poll time, next poll countdown, "Pull now", Google Tasks connected/not.
- Banner when any source is `needs_login` or `error` — except when *every*
  non-Google source failed with a networking error
  (`ERR_INTERNET_DISCONNECTED`, `fetch failed`, `ENOTFOUND`, `ECONNRESET`,
  `net::ERR_`), which is one fact rather than n failures: a single soft
  *Offline — showing what was pulled at <time>* note replaces the per-source
  and Google notices. The sources list still shows each state.
- Main list: assignments with `dueAt` in the future, grouped by day, sorted by
  time; course chip, title (link), status badge, details on expand. Past-due
  and undated items in a collapsed section.
- Course filter chips.
- Changes feed: newest first, e.g. "CS 173 · HW4 due moved Sep 12 → Sep 14".
- Settings drawer: Canvas token, poll interval, Google client id/secret,
  course table.

## Configuration

`settings.json` (gitignored, created with defaults on first run):

```json
{
  "port": 4258,
  "pollMinutes": 30,
  "taskLeadDays": 3,
  "blockStartHour": 20,
  "blockEndHour": 23,
  "blockWithinHours": 24,
  "canvasToken": "",
  "canvasFeedUrl": "",
  "canvasBase": "https://canvas.illinois.edu",
  "google": { "clientId": "", "clientSecret": "" },
  "courses": [
    { "course": "CS 128",   "source": "cs128" },
    { "course": "CS 128",   "source": "prairielearn", "instanceId": "143409" },
    { "course": "CS 173",   "source": "prairielearn", "instanceId": "223829" },
    { "course": "MATH 257", "source": "prairielearn", "instanceId": "217654" },
    { "course": "MATH 580", "source": "canvas", "courseId": "74998" },
    { "course": "RHET 105", "source": "canvas", "courseId": "72592" },
    { "course": "ENG 100",  "source": "canvas", "courseId": "74325" }
  ]
}
```

## Error handling summary

- Adapter error: source marked, previous data kept, others unaffected.
- Login wall: `needs_login`, headed browser on demand, no polling of that
  source until resolved.
- Tasks error: logged, retried next poll; deletions only after a successful
  fetch for that source.
- Corrupt `data/state.json`: start empty, log a warning.

## Testing

`node --test`. Covered:

- Each `parse()` against fixture HTML/JSON, including timezone conversion,
  missing due dates, submitted/graded states.
- `diff()` change detection incl. "removed only when fetch succeeded".
- Google `toTask`/`diff` incl. manual-complete preservation and notes truncation.
- Google `planBlocks`/`diffBlocks`/`runBlockSync` incl. the last-evening rule,
  shared evenings, an evening already over, and the 403 re-consent path.
- Poller with fake adapters: failure isolation, retention, change emission.
- Server routes with fake poller: origin guard, settings masking, poll trigger.

Network and Playwright layers stay thin and untested.

## Out of scope (v1)

Notifications (email/push), grades tracking, multiple users, hosting. (Timed
calendar events arrived after v1 as the evening homework blocks above; the
per-assignment task itself still carries only a date, as the Tasks API has no
time.)
