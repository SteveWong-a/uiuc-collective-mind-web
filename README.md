# UIUC Collective Mind

One page for every homework this semester. A local Node server polls Canvas,
PrairieLearn, cs128.org, smartPhysics and PrairieTest every 30 minutes, shows
everything grouped by due date — CBTF exam reservations marked **[Test]** with
their slot, length and room — tells you what changed, and mirrors each
assignment into a Google Tasks
list called **UIUC Homework** (visible in Google Calendar's tasks layer, the
Tasks app, and the Gmail side panel). It also books an 8–11 PM **homework
block** on a calendar of the same name for whatever is due within a day.
> **Credits & Origin**: This project is based on and extends the original local application created by [**axion66**](https://github.com/axion66) at [axion66/uiuc_collective_mind](https://github.com/axion66/uiuc_collective_mind). It expands the original concept with a cloud-synchronized Web Application, Firebase PostgreSQL backend, cross-platform Electron desktop app, and a Chrome Extension.

## Setting it up for yourself (any UIUC student)

Nothing in this repo is tied to one person. Your courses, logins and keys live in
files that are never committed (`settings.json`, `profile/`, `data/`). To use it:

1. Do the install steps below.
2. Find your ids: for PrairieLearn open a course and copy the number in
   `https://us.prairielearn.com/pl/course_instance/<number>/…`; for Canvas the
   number in `https://canvas.illinois.edu/courses/<number>`; cs128.org needs no id.
3. Copy `settings.example.json` to `settings.json` and edit the `courses` list
   (the `course` name is just a label), or paste the list in the app's Settings.
4. In the app, paste your own Canvas calendar feed URL (Canvas → Calendar →
   Calendar Feed). Log into PrairieLearn / cs128 when the app asks.
5. Optional Google: send the repo owner the Gmail you will connect, then
   click **Connect Google** (see step 3 under Setup).

## Setup on a new Mac (laptop, iMac, …)

Install [Node.js](https://nodejs.org) 20+ (LTS installer is fine), then in Terminal:

    git clone https://github.com/SteveWong-a/uiuc-collective-mind-web.git
    cd uiuc-collective-mind-web
    npm install
    npx playwright install chromium
    bash scripts/install-launchagent.sh     # starts now, at every login, and after crashes (no sudo)
    open http://course.localhost:4258

Then, once, in the app's **Settings** (gear, top right): paste your Canvas
calendar feed URL (step 1 below) and, if you use it, the Google client id +
secret (step 3). `settings.json`, `profile/`, `data/` are per-machine and
gitignored, so each Mac keeps its own logins and settings.

### Web Application & Chrome Extension (Canvas Sync)

If you are using the Web App hosted on Vercel at [uiuc-collective-mind-web.vercel.app](https://uiuc-collective-mind-web.vercel.app) (or locally at `localhost:3000`):

1. **Download the Extension:** Download `uiuc-collective-mind-extension.zip` from the Web App download page or use the `extension/` folder in this repo.
2. **Open Extensions in Chrome:** Navigate to `chrome://extensions` in your Chrome address bar.
3. **Turn on Developer Mode:** Toggle the **Developer mode** switch (top-right corner) to **ON**.
4. **Load Unpacked:** Click the **Load unpacked** button (top-left) and select the `extension/` folder.
5. **Sync Assignments:** Log into [canvas.illinois.edu](https://canvas.illinois.edu) in Chrome, open the UIUC Collective Mind dashboard, and click **Sync** next to Canvas!

Optional, macOS: drop the port number so the app is at http://course.localhost —
one-time, reboot-safe, no sudo: `bash scripts/port80.sh` (undo with
`bash scripts/uninstall-port80.sh`). It runs a small forwarder as a second
LaunchAgent that only accepts connections from this Mac.

To run it by hand instead of the agent: `npm start` (opens the page). Any
`*.localhost` name works; change it in `settings.json` as `appHost`.

1. **Canvas**: open Canvas, go to **Calendar**, click **Calendar Feed** in the
   right-hand column and copy the link
   (`https://canvas.illinois.edu/feeds/calendars/user_<token>.ics`). Paste it
   into **Canvas calendar feed URL** in Settings (gear button, top right). That
   feed needs no login, is regenerated on every request, and lists every
   assignment with a due date across all your courses — it is the primary
   Canvas path because UIUC has personal access tokens disabled and a Canvas
   web session rarely survives a restart. Treat the URL as a password: anyone
   holding it can read your calendar. It carries no submission status, so if
   you are also logged into Canvas in the app's browser window the app reads
   submitted / graded from there and merges it on top; when that login is
   missing the source still reports *ok* and just notes that status is
   unavailable. The token field is only for institutions that still allow
   *+ New Access Token*; leave the feed blank to fall back to token-then-login.
2. **PrairieLearn / cs128.org / PrairieTest**: when a source shows *needs login*, click
   **Log in**, finish NetID + Duo in the Chromium window that opens, then
   **Pull now**. The window closes itself as soon as a pull succeeds through
   it. The browser session is kept in `profile/`, with a copy of the live
   session cookies in `data/cookies.json` so a reset profile does not always
   mean logging in again (both are gitignored — never commit them).
3. **Google** (optional). A shared OAuth client is built in (`DEFAULTS.google`
   in `lib/settings.mjs`), so there is nothing to paste: message the repo
   owner the Gmail address you will connect, wait for them to add it as a
   test user on the shared Google Cloud project, then click **Connect
   Google**. Until you are a test user Google refuses the consent screen
   with *access_denied*. The client is a "Desktop app" type, which Google
   does not treat as confidential; the repo is private, keep it that way.
   To use your own project instead, create a **Desktop app** OAuth client
   with the *Google Tasks API* and *Google Calendar API* enabled, add
   yourself as a test user, and paste its id + secret in Settings (they
   override the built-in ones).

   Whichever you use, the refresh token Google hands back lands in
   `data/google-token.json` (owner-only, gitignored) and is yours alone: it
   grants write access to *your* Tasks and Calendar. Never share that file.
   If you connected before the calendar blocks existed, your token only
   carries the Tasks scope and the app will say *Google Calendar needs
   re-consent*: click **Disconnect Google Tasks**, then connect again.

Courses live in `settings.json` (`courses` array) — edit them in Settings for a
new term. Each row is one of:

```json
{ "course": "CS 173",   "source": "prairielearn", "instanceId": "223829" }
{ "course": "MATH 580", "source": "canvas",       "courseId": "74998" }
{ "course": "CS 128",   "source": "cs128" }
{ "course": "PHYS 212", "source": "smartphysics", "enrollmentId": "164636" }
{ "course": "CBTF",     "source": "prairietest" }
```

The `prairietest` row needs no id and is not a course: it reads your CBTF
reservations at us.prairietest.com for every course at once, each shown under
its own course with a **[Test]** mark, and lists exams you can still reserve
above **Sources**. Past reservations are not read, and anything mentioning
CS 124 is dropped (PrairieTest lists it in error).

## Run it forever (macOS LaunchAgent)

    bash scripts/install-launchagent.sh     # install: starts at login, restarts after crashes, no sudo
    bash scripts/uninstall-launchagent.sh   # stop and remove
    tail -f logs/server.log                 # watch it

What it installs: `~/Library/LaunchAgents/com.uiuc-collective-mind.plist`,
which runs `scripts/run-forever.sh` in your login session (so login windows can
still open). That loop restarts `node server.mjs` five seconds after any exit.
It does not open a browser tab on boot; bookmark http://course.localhost:4258.
After `git pull`, restart it with
`launchctl kickstart -k gui/$(id -u)/com.uiuc-collective-mind`.

## Google Tasks timing

A Google task carries one date. Each assignment's task is placed `taskLeadDays`
(default 3, Settings) before its deadline and, while still open, moves forward
one day at a time — so it is on today's calendar every day of that window. The
deadline itself is in the task title. Miss the deadline and the task keeps
rolling onto today until the work is turned in (or the site closes it).

## Evening homework blocks

Once an assignment is still open and its deadline is less than
`blockWithinHours` away (default 24), it gets an 8:00–11:00 PM
(`blockStartHour`/`blockEndHour`, America/Chicago) block on the last evening
that still precedes that deadline — the deadline's own evening when 8 PM comes
before it, otherwise the evening before. Everything landing on the same evening
shares **one** event, titled `Homework block: 3 due` with each assignment,
its course, its deadline and its link in the description. An evening that has
already finished is never written into the past, so at 11:30 PM with something
due at 11:59 PM there is simply no block left to make. Once that deadline has
passed and the work is still open (Canvas keeps most assignments submittable,
late, until their lock date), it gets tonight's block — or tomorrow's, once
tonight is over — every day until it is turned in.

The blocks live on their own **UIUC Homework** calendar (created on first sync)
and each carries a private `uiucBlock` marker, so the app only ever touches
events it made itself — anything you put on that calendar by hand is left
alone. Blocks are re-planned on every poll: finish the work and the event
disappears.

## How it works

- Every `pollMinutes` (default 30) the server fetches all sources. A failing
  source keeps its previous data and shows an error; the others still update.
- Overdue work that can still be turned in (open, not closed) is not filed under
  *Past*: it heads the **Today** group with a negative countdown (`11:59 PM -2 d`)
  and an *overdue* flag until it is submitted or the site closes it. What
  "closed" means per site: Canvas — the lock date has passed (login needed;
  the feed alone closes everything past due); PrairieLearn — no access window
  paying any credit is still running (an `80%: Sep 4 – Sep 10` late window
  keeps it open); cs128.org — nothing is earned after the due date, so past-due
  lessons are always closed.
- Work that is in gets a check mark — hollow `✓` once turned in, bold `✓`
  once graded — with the grade the site shows (`9/10`, `110%`, `A`) next to it;
  Canvas check marks and grades come from the one-time Canvas login in the app's
  browser window, since the calendar feed alone carries only due dates.
- New / moved / removed assignments appear in the **Changes** feed, and a
  newly graded one reads `graded: 9/10`.
- If every source fails with a networking error at once, the page shows a
  single soft *Offline — showing what was pulled at …* note instead of one
  error per course, and keeps the last successful pull on screen.
- If Google is connected, one task per outstanding assignment is kept in sync:
  title `HW4 · CS 173 · due 11:59 PM` (`[Test] Quiz 2 · CS 128 · …` for a CBTF
  reservation), due date on the calendar, notes with
  details and a link. Once an assignment is submitted, graded or closed its
  task is deleted, so the list is only what is still left to do; a task you
  check off yourself is left alone until then.

## Development

    npm test

- `lib/sources/*` — one adapter per site; `parse*()` functions are pure and
  tested against captured HTML/JSON/ICS in `test/fixtures/`. `canvas.mjs` also
  carries a tiny RFC 5545 unfolder/parser (`unfoldIcs`, `parseIcsEvents`) so the
  calendar feed needs no dependency.
- `lib/poller.mjs` — polling, failure isolation, change detection.
- `lib/google/*` — OAuth (desktop loopback), Tasks and Calendar clients, and a
  pure diff sync for each: `sync.mjs` (tasks) and `blocks.mjs` (evening blocks,
  `planBlocks`/`toEvent`/`diffBlocks`).
- `server.mjs` — localhost HTTP + SSE; `public/index.html` — the UI.
- `scripts/capture.mjs <url> <file>` — capture a logged-in page as a fixture.

Runtime files (`settings.json`, `data/`, `profile/`) are gitignored.

## Acknowledgements & Credits

- **Original Author**: [axion66](https://github.com/axion66) — creator of the original [uiuc_collective_mind](https://github.com/axion66/uiuc_collective_mind) local CLI/server tool.
- **Web, Desktop & Cloud Synchronizer**: [Steve Wong](https://github.com/SteveWong-a) and the open source contributors.
