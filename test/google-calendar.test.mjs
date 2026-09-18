import { test } from "node:test";
import assert from "node:assert/strict";
import { CalendarApi } from "../lib/google/calendar.mjs";

function fake(routes) {
  const calls = [];
  const auth = { n: 0, getAccessToken: async () => "tok" + auth.n, forgetAccessToken: () => { auth.n++; } };
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method ?? "GET", auth: opts.headers?.Authorization, body: opts.body ? JSON.parse(opts.body) : null });
    const r = routes(String(url), opts, calls.length);
    return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)) };
  };
  return { api: new CalendarApi({ auth, fetchImpl }), calls };
}

const blockEvent = (over = {}) => ({ id: "E1", summary: "Homework block: 2 due", extendedProperties: { private: { uiucBlock: "2026-09-12" } }, ...over });

test("ensureCalendar creates when no cached id and no summary match", async () => {
  const { api, calls } = fake((url, opts) => {
    if (url.includes("/users/me/calendarList")) return { status: 200, body: { items: [{ id: "C1", summary: "Other", accessRole: "owner" }] } };
    if (url.includes("/calendars") && opts.method === "POST") return { status: 200, body: { id: "C2", summary: "UIUC Homework" } };
    return { status: 500 };
  });
  assert.equal(await api.ensureCalendar("UIUC Homework"), "C2");
  assert.deepEqual(calls.at(-1).body, { summary: "UIUC Homework", timeZone: "America/Chicago" });
});

test("ensureCalendar finds an owned calendar by summary and never creates a second one", async () => {
  const { api, calls } = fake((url) => {
    if (url.includes("/users/me/calendarList")) return { status: 200, body: { items: [{ id: "C7", summary: "UIUC Homework", accessRole: "owner" }] } };
    return { status: 500 };
  });
  assert.equal(await api.ensureCalendar("UIUC Homework"), "C7");
  assert.ok(!calls.some((c) => c.method === "POST"));
});

test("ensureCalendar ignores a same-named calendar someone else shared with us", async () => {
  const { api } = fake((url, opts) => {
    if (url.includes("/users/me/calendarList")) return { status: 200, body: { items: [{ id: "SHARED", summary: "UIUC Homework", accessRole: "reader" }] } };
    if (opts.method === "POST") return { status: 200, body: { id: "MINE" } };
    return { status: 500 };
  });
  assert.equal(await api.ensureCalendar("UIUC Homework"), "MINE");
});

test("ensureCalendar returns cachedId when it is still in the list, even if renamed", async () => {
  const { api, calls } = fake((url) => {
    if (url.includes("/users/me/calendarList")) return { status: 200, body: { items: [{ id: "C9", summary: "Renamed by user", accessRole: "owner" }] } };
    return { status: 500 };
  });
  assert.equal(await api.ensureCalendar("UIUC Homework", "C9"), "C9");
  assert.ok(!calls.some((c) => c.method === "POST"));
});

test("ensureCalendar pages the calendar list", async () => {
  const { api } = fake((url) => {
    if (url.includes("pageToken=p2")) return { status: 200, body: { items: [{ id: "C2", summary: "UIUC Homework", accessRole: "owner" }] } };
    return { status: 200, body: { items: [{ id: "C1", summary: "Other", accessRole: "owner" }], nextPageToken: "p2" } };
  });
  assert.equal(await api.ensureCalendar("UIUC Homework"), "C2");
});

test("listEvents pages, expands recurrences and returns only our own blocks", async () => {
  const { api, calls } = fake((url) => {
    if (url.includes("pageToken=p2")) return { status: 200, body: { items: [blockEvent({ id: "E2", extendedProperties: { private: { uiucBlock: "2026-09-13" } } })] } };
    return { status: 200, body: { items: [blockEvent(), { id: "MINE_BUT_MANUAL", summary: "Dinner" }, { id: "OTHER", extendedProperties: { private: { somethingElse: "x" } } }], nextPageToken: "p2" } };
  });
  const events = await api.listEvents("C1", { timeMin: "2026-09-10T00:00:00.000Z", timeMax: "2026-09-24T00:00:00.000Z" });
  assert.deepEqual(events.map((e) => e.id), ["E1", "E2"], "hand-made events on the calendar are never returned");
  assert.match(calls[0].url, /singleEvents=true/);
  assert.match(calls[0].url, /maxResults=250/);
  assert.match(calls[0].url, /timeMin=2026-09-10T00%3A00%3A00.000Z/);
  assert.match(calls[0].url, /timeMax=2026-09-24T00%3A00%3A00.000Z/);
  assert.match(calls[0].url, /\/calendars\/C1\/events/);
});

test("listEvents throws when pagination exceeds 50 pages", async () => {
  const { api } = fake(() => ({ status: 200, body: { items: [blockEvent()], nextPageToken: "loop" } }));
  await assert.rejects(api.listEvents("C1", {}), /pagination exceeded/);
});

test("retries once on 401 with a fresh token", async () => {
  const { api, calls } = fake((url, opts, n) => (n === 1 ? { status: 401, body: { error: { message: "expired" } } } : { status: 200, body: { id: "E1" } }));
  await api.insertEvent("C1", { summary: "x" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer tok0");
  assert.equal(calls[1].auth, "Bearer tok1");
});

test("delete returns null on 204 and errors carry their status", async () => {
  const { api } = fake((url, opts) => (opts.method === "DELETE" ? { status: 204 } : { status: 403, body: { error: { message: "Request had insufficient authentication scopes." } } }));
  assert.equal(await api.deleteEvent("C1", "E1"), null);
  const e = await api.patchEvent("C1", "E1", { summary: "y" }).then(() => null, (err) => err);
  assert.match(e.message, /insufficient/);
  assert.equal(e.status, 403);
});

test("insert and patch hit the right urls with a JSON body", async () => {
  const { api, calls } = fake(() => ({ status: 200, body: { id: "E1" } }));
  await api.insertEvent("c a l", { summary: "s" });
  await api.patchEvent("c a l", "e/1", { summary: "t" });
  assert.match(calls[0].url, /\/calendars\/c%20a%20l\/events$/);
  assert.equal(calls[0].method, "POST");
  assert.match(calls[1].url, /\/calendars\/c%20a%20l\/events\/e%2F1$/);
  assert.equal(calls[1].method, "PATCH");
  assert.deepEqual(calls[1].body, { summary: "t" });
});
