import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoogleAuth } from "../lib/google/auth.mjs";

const dir = mkdtempSync(join(tmpdir(), "ucm-"));
const settings = () => ({ google: { clientId: "cid", clientSecret: "sec" } });

test("authUrl carries client id, scope, redirect, state, and PKCE challenge", () => {
  const g = new GoogleAuth({ tokenFile: join(dir, "t.json"), getSettings: settings });
  const { url, state } = g.authUrl({ redirectUri: "http://127.0.0.1:4258/oauth/callback" });
  const u = new URL(url);
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("state"), state);
  assert.ok(u.searchParams.get("code_challenge"), "carries PKCE code_challenge");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
});

test("callback exchanges code with PKCE verifier, stores refresh token, refreshes when expired", async () => {
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
  assert.ok(posts[0].code_verifier, "token exchange carried PKCE code_verifier");
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

test("operates without clientSecret using PKCE and falls back to default client ID", async () => {
  const posts = [];
  const fetchImpl = async (url, opts) => {
    posts.push(Object.fromEntries(new URLSearchParams(opts.body)));
    return { ok: true, json: async () => ({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }) };
  };
  const noSecretSettings = () => ({ google: {} });
  const g = new GoogleAuth({ tokenFile: join(dir, "t_nosec.json"), getSettings: noSecretSettings, fetchImpl });
  const { url, state } = g.authUrl({ redirectUri: "http://127.0.0.1:1/oauth/callback" });
  const u = new URL(url);
  assert.ok(u.searchParams.get("client_id"), "has default client ID");
  assert.ok(!u.searchParams.get("client_secret"));
  assert.ok(u.searchParams.get("code_challenge"));
  await g.handleCallback({ code: "c", state, redirectUri: "http://127.0.0.1:1/oauth/callback" });
  assert.equal(posts[0].client_secret, "desktop-client-secret", "carries default client_secret for Google token endpoint");
  assert.ok(posts[0].code_verifier, "carried code_verifier");
});

test("operates without clientSecret if custom client does not supply one", async () => {
  const posts = [];
  const fetchImpl = async (url, opts) => {
    posts.push(Object.fromEntries(new URLSearchParams(opts.body)));
    return { ok: true, json: async () => ({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }) };
  };
  const customNoSecret = () => ({ google: { clientId: "custom-no-sec" } });
  const g = new GoogleAuth({ tokenFile: join(dir, "t_custom_nosec.json"), getSettings: customNoSecret, fetchImpl });
  const { state } = g.authUrl({ redirectUri: "http://127.0.0.1:1/oauth/callback" });
  await g.handleCallback({ code: "c", state, redirectUri: "http://127.0.0.1:1/oauth/callback" });
  assert.equal(posts[0].client_secret, undefined);
  assert.ok(posts[0].code_verifier);
});

test("getAccessToken throws when not connected", async () => {
  const g = new GoogleAuth({ tokenFile: join(dir, "t3.json"), getSettings: settings });
  await assert.rejects(g.getAccessToken(), /not connected/i);
});

test(
  "token file is written with 0600 permissions",
  { skip: process.platform === "win32" },
  async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }) });
    const tokenFile = join(dir, "t4.json");
    const g = new GoogleAuth({ tokenFile, getSettings: settings, fetchImpl, now: () => 1_000_000 });
    const { state } = g.authUrl({ redirectUri: "http://127.0.0.1:1/oauth/callback" });
    await g.handleCallback({ code: "c", state, redirectUri: "http://127.0.0.1:1/oauth/callback" });
    assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
  },
);
