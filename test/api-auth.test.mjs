import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateApiToken, hasValidApiToken, tokensEqual, isBrowserLikeMissingOrigin, API_COOKIE } from "../lib/api-auth.mjs";

test("loadOrCreateApiToken persists a 0600 token and reuses it", () => {
  const file = join(mkdtempSync(join(tmpdir(), "ucm-tok-")), "api-token");
  const a = loadOrCreateApiToken(file);
  const b = loadOrCreateApiToken(file);
  assert.equal(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(readFileSync(file, "utf8").trim(), a);
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("loadOrCreateApiToken replaces a truncated file", () => {
  const file = join(mkdtempSync(join(tmpdir(), "ucm-tok-")), "api-token");
  writeFileSync(file, "short\n");
  const t = loadOrCreateApiToken(file);
  assert.notEqual(t, "short");
  assert.match(t, /^[A-Za-z0-9_-]{32,}$/);
});

test("hasValidApiToken accepts Bearer and cookie", () => {
  const token = "a".repeat(32);
  assert.equal(hasValidApiToken({ headers: { authorization: `Bearer ${token}` } }, token), true);
  assert.equal(hasValidApiToken({ headers: { cookie: `${API_COOKIE}=${token}` } }, token), true);
  assert.equal(hasValidApiToken({ headers: { authorization: `Bearer ${token}x` } }, token), false);
  assert.equal(hasValidApiToken({ headers: {} }, token), false);
  assert.equal(tokensEqual(token, token), true);
  assert.equal(tokensEqual(token, "b".repeat(32)), false);
  assert.equal(tokensEqual("", ""), false);
});

test("isBrowserLikeMissingOrigin", () => {
  assert.equal(isBrowserLikeMissingOrigin({ headers: { "sec-fetch-site": "cross-site" } }), true);
  assert.equal(isBrowserLikeMissingOrigin({ headers: { "sec-fetch-site": "same-origin" } }), true);
  assert.equal(isBrowserLikeMissingOrigin({ headers: { origin: "http://127.0.0.1:4258", "sec-fetch-site": "same-origin" } }), false);
  assert.equal(isBrowserLikeMissingOrigin({ headers: { "sec-fetch-site": "none" } }), false);
  assert.equal(isBrowserLikeMissingOrigin({ headers: {} }), false);
});
