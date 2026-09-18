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

test("ensureList creates when no cached id and no title match", async () => {
  const { api, calls } = fake((url, opts) => {
    if (url.includes("/users/@me/lists") && !opts.method) return { status: 200, body: { items: [{ id: "L1", title: "Other" }] } };
    if (url.includes("/users/@me/lists") && opts.method === "POST") return { status: 200, body: { id: "L2", title: "UIUC Homework" } };
    return { status: 500 };
  });
  assert.equal(await api.ensureList("UIUC Homework"), "L2");
  assert.equal(calls.at(-1).body.title, "UIUC Homework");
});

test("ensureList returns cachedId when still present, no create", async () => {
  const { api, calls } = fake((url, opts) => {
    if (url.includes("/users/@me/lists") && !opts.method) return { status: 200, body: { items: [{ id: "L9", title: "Renamed by user" }] } };
    return { status: 500 };
  });
  assert.equal(await api.ensureList("UIUC Homework", "L9"), "L9");
  assert.ok(!calls.some((c) => c.method === "POST"));
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

test("listTasks throws when pagination exceeds 50 pages", async () => {
  const { api } = fake(() => ({ status: 200, body: { items: [{ id: "t" }], nextPageToken: "loop" } }));
  await assert.rejects(api.listTasks("L1"), /pagination exceeded/);
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
