# Fixture notes

All fixtures captured 2026-09-03 with `node scripts/capture.mjs <url> <file>` and
scrubbed (user name replaced by "Student Name").

## PrairieLearn assessments pages

- `pl-assessments.html` — CS 173, instance 223829 (3 rows, all started).
- `pl-assessments-cs128.html` — CS 128 PL, instance 143409 (2 rows: one with no link and
  no credit text, "Not started"; one demo).
- `pl-assessments-math257.html` — MATH 257, instance 217654 (7 rows, mix of started /
  not started, multi-window credit, no-deadline rows).

Structure (`<table aria-label="Assessments">`, one `<tbody>` per set):

```
<tr><th colspan="4" data-testid="assessment-group-heading">Homeworks</th></tr>   <- group header, skip
<tr>
  <td><span class="badge …" data-testid="assessment-set-badge">HW1</span></td>     <- label (always present, unique per instance)
  <td><a href="/pl/course_instance/217654/assessment_instance/14541935/">Week 1 - Modules 1-4</a></td>
      or  <a href="/pl/course_instance/217654/assessment/2690420/">…</a>              <- not yet started
      or  plain text "Quiz 1" with NO <a>                                            <- not yet available
  <td class="text-center align-middle">
      80% until 23:59, Tue, Sep 8                                                    <- current credit line (may be empty, or "100%" with no until)
      <button … data-bs-content="&lt;table …&gt; rows: Credit | Start | End &lt;/table&gt;">  <- html-escaped popover table, exact timestamps
  </td>
  <td>
      <div data-testid="scorebar">…110%…</div>        <- score, or plain text "Not started"
  </td>
</tr>
```

Popover table rows (after html-unescaping `data-bs-content`):

```
Credit | Start                      | End
110%   | 2026-08-24 00:00:01 (CDT)  | 2026-08-28 23:59:59 (CDT)
100%   | 2026-08-29 00:00:01 (CDT)  | 2026-09-01 23:59:59 (CDT)
80%    | 2026-09-02 00:00:01 (CDT)  | 2026-09-08 23:59:59 (CDT)
None   | 2026-09-09 00:00:01 (CDT)  | 2026-12-31 23:59:59 (CST)
```

Timestamps are `YYYY-MM-DD HH:MM:SS (CDT|CST)`, America/Chicago.

Observed credit-line texts:
- `100% until 08:00, Tue, Sep 8`
- `110% until 23:59, Thu, Sep 3`
- `80% until 23:59, Tue, Sep 8`
- `100% until 00:00, Thu, Dec 10`
- `100%` (no deadline)
- empty cell (not available yet, or finished)

Observed score cells: `0%`, `100%`, `110%`, `Not started`.

Parsing decisions for the adapter:
- id = `pl:<instanceId>:<slug(label)>` — the link changes from `/assessment/<id>/` to
  `/assessment_instance/<id>/` once started, so link ids are not stable; labels are.
- dueAt = End of the access-table row that matters right now among the rows offering
  >= 100% credit: the soonest one that has not ended yet, or — when every full-credit
  window has already expired — the most recently expired one. If there is no popover
  table, fall back to the credit line ("... until <time>"); if neither, null.
- url = link href if present, else the assessments page.
- details = credit line + popover rows rendered as text + score.
- status: score "Not started"/absent -> open; score >= 100% -> graded; 0% < score < 100% -> submitted;
  no dueAt and none of the above -> open; dueAt in the past and score 0%/Not started -> closed.

Expected values used by tests (from the fixtures):
- 223829 / label `Pre-Unit Homework1` / title `Week 1: Prereqs and Logic` / due `2026-09-08 08:00:00 CDT` = `2026-09-08T13:00:00.000Z` / score 100% -> graded / url …/assessment_instance/14536974/
- 223829 / label `PracticeL` / title `Free-response Sandbox` / no credit -> dueAt null, status open, score 0%
- 217654 / label `HW1` / title `Week 1 - Modules 1-4` / due (100% row end) `2026-09-01 23:59:59 CDT` = `2026-09-02T04:59:59.000Z` / score 110% -> graded
- 217654 / label `HW2` / title `Week 2 - Modules 5-9` / credit line `110% until 23:59, Fri, Sep 4` / score Not started -> open, url …/assessment/<id>/
- 217654 / label `CL1` / title `Python tutorial` (trailing icon stripped) / no credit / 100% -> graded, dueAt null
- 143409 / label `Q1` / title `Quiz 1` / no link, no credit, Not started -> open, url = assessments page

## cs128.org

Login-gated (Illinois SSO via `/auth` -> login.microsoftonline.com). Two useful sources:

### `cs128-my-gradebook.html` — https://cs128.org/my/gradebook

Sections (h2): Overview, Lessons, Attendance, Other Resources. Assignment rows live in the
Lessons table (more tables — e.g. Machine Problems — are expected to appear later in the
term; parse every table the same way). Row markup:

```
<tr>
  <td>
    <div class="fw-semibold">The Preprocessor, the Linker, and Overloading</div>   <- title
    <div class="text-muted small">Due Sep 3, 2026</div>                             <- due (date only, no time)
  </td>
  <td class="text-end fw-semibold">0.00/100.00</td>                                 <- score/max
  <td class="text-end fw-semibold">0.00%</td>                                        <- percent
  <td class="text-end"> … <a href="/2026c/the-preprocessor-the-linker-and-overloading-1906">Lesson</a>
       <a href="#gb_row_…" data-bs-toggle="collapse">More</a> … </td>              <- link to the lesson page
</tr>
<tr class="collapse" id="gb_row_…"> … component sub-rows (Greenhouse Controller 0.00/100.00) … </tr>   <- skip
```

Only rows whose first cell contains a `.fw-semibold` title AND a `Due …` line are assignments;
collapse/component rows have neither. Due text format: `Due Aug 24, 2026` (no time).

Parsing decisions:
- id = `cs128:lesson:<slug(title)>` (title unique within the gradebook).
- dueAt = 23:59 America/Chicago on the given date (site shows no time; assumption).
- status: percent >= 100 -> graded; 0 < percent < 100 -> submitted; else open (closed if due passed).
- details = `Score 0.00/100.00 (0.00%)`.
- url = the `Lesson` link, absolute.

Expected values used by tests:
- title `The Preprocessor, the Linker, and Overloading`, due `2026-09-03` -> `2026-09-04T04:59:00.000Z`, score 0/100 -> open (not yet past on 2026-09-03T12:00Z), url https://cs128.org/2026c/the-preprocessor-the-linker-and-overloading-1906
- title `Declaring, Defining, and Calling Functions`, due `2026-09-02` -> `2026-09-03T04:59:00.000Z`, 100% -> graded
- title `Howdy, World!`, due `2026-08-24`, 0% and past -> closed
- 9 assignment rows in total in the fixture (titles are html-escaped, e.g. `Playground &amp; Question System` -> `Playground & Question System`) (`Print the Software Development Process`, `Cowboy's Hello`, `Guess the Animal`, `Course Number` etc. are component sub-rows and must NOT appear).

### calendar feed — not used any more

`/pages/_api/public_calendar` only ever carried "Quiz N Window" all-day events for
the CBTF quizzes. Those are covered by PrairieTest (below) with the actual reserved
slot, so the feed, its fixture and its parser were removed on 2026-09-06.

## PrairieTest

### `prairietest-home.html` — https://us.prairietest.com/pt

Captured 2026-09-06 with `scripts/capture.mjs` (student name, email and CSRF tokens
scrubbed). Login-gated (same Illinois SSO as PrairieLearn). One page, three cards
(`div.card` with an `h2` heading):

- **Exams available for reservations** — `li.list-group-item` rows with
  `[data-testid="action"] a[href="/pt/student/exam/<id>"]` ("Make a reservation"),
  `[data-testid="exam"]` ("CS 124 (Fa26): Q2: Loops and Arrays (Q1 Retakes)") and
  `[data-testid="dates"] span[data-format-date-range]` whose attribute is JSON
  `{start, end, timezone}` with exact ISO instants.
- **Exam reservations** — rows with `[data-testid="exam"] a[href="/pt/student/reservation/<id>"]`,
  `[data-testid="date"] span[data-format-date]` (JSON `{date}` ISO instant of the
  reserved slot), `[data-testid="location"]` ("CBTF: <a>Grainger Library 057</a><br><small>Room 057 …</small>")
  and a last column "50min, In-person, No accommodations" (no testid; the div after location).
- **Past exam reservations** — same shape as reservations but without links. Skipped.

Parsing decisions (`lib/sources/prairietest.mjs`):
- Exam text splits as `<course> (<term>): <title>`; a cross-listed "ENG 100/101/300/398"
  becomes "ENG 100".
- Anything mentioning CS 124 is dropped (a PrairieTest enrollment error on the student's side).
- Reservation id = `prairietest:reservation:<id>` from the link; dueAt = the reserved instant;
  details = "50min · CBTF: Grainger Library 057" / room / "In-person, No accommodations";
  status open, or closed once the slot has passed.
- Reservable exams are not assignments: they travel on the source status as `reservable`
  `[{ id, course, title, start, end, url }]` and the UI lists them above Sources.
- The fetcher sets `trustedEmpty` on its result: no reservation is a normal state.

Expected values used by tests: reservation 3576802 = CS 128 / Quiz 2 / 2026-09-11T23:00:00.000Z
(Fri Sep 11, 6 PM CDT) / Grainger Library 057 / 50min; ENG 100 Intro to CBTF at
2026-09-08T23:15:00.000Z; both reservable rows are CS 124 and so filtered to none.

## smartphysics.com

Login-gated (Illinois SSO). 

### `smartphysics-assignments.html` — https://smart.physics.illinois.edu/Course?enrollmentID=164636

The page contains assignments grouped by unit in `.accordion-body.unit` elements.

```html
<div class="accordion-body unit" id="Unit-1">
  <h3><button><span class="UnitTitle">Coulomb's Law</span></button></h3>
  <div class="unit-assignment Prelecture-Type">
    <div class="unit-assignment-title"><a href="...">Prelecture</a></div>
    <div class="duedate"><strong>Due:</strong> Aug. 25 at 8:00 AM <span>for 100% credit</span></div>
    <div class="scorebars"><div class="bar" aria-valuenow="100.0"></div></div>
  </div>
</div>
```

Parsing decisions:
- id = `smartphysics:<enrollmentId>:<slug(unitTitle)>:<slug(title)>`
- dueAt = Parse "Aug. 25 at 8:00 AM" using the year from `<title>Physics 212 Fall 2026</title>`.
- status: score >= 100 -> graded; 0 < score < 100 -> submitted; else open (closed if due passed).
- title = `${unitTitle}: ${title}`
- details = `Score: 100.0%`
- url = absolute URL from `href`

Expected values:
- `Coulomb's Law: Prelecture`, due `2026-08-25T13:00:00.000Z` (CDT to UTC), score 100.0 -> graded.
- `Coulomb's Law: Homework`, due `2026-09-09T13:00:00.000Z`, score 98.7 -> submitted.

## PrairieTest anonymous home

- `prairietest-anon.html` — `https://us.prairietest.com/pt` with no session, captured
  2026-09-08 with curl. HTTP 200, title "Home — PrairieTest", no password field: only a
  `<a href="https://us.prairielearn.com/pl/prairietest/auth">Login</a>` button. This is
  why the browser's login-URL check cannot tell it from the real home page.
