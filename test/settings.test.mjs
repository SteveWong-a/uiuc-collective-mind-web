import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSettings, saveSettings, validateSettings, maskSettings, DEFAULTS } from "../lib/settings.mjs";
import { recentLog } from "../lib/log.mjs";

const file = join(mkdtempSync(join(tmpdir(), "ucm-")), "settings.json");

test("defaults when file missing", () => {
  const s = loadSettings(file);
  assert.equal(s.port, 4258);
  assert.equal(s.pollMinutes, 30);
  // No hardcoded courses: the user must configure courses in Settings.
  assert.equal(s.courses.length, 0);
  assert.deepEqual([s.blockStartHour, s.blockEndHour, s.blockWithinHours], [20, 23, 24], "8-11 PM blocks for work due within a day");
});

test("save merges and validates", () => {
  const s = saveSettings(file, { pollMinutes: 15, canvasToken: "abc123XYZ" });
  assert.equal(s.pollMinutes, 15);
  assert.equal(loadSettings(file).canvasToken, "abc123XYZ");
  assert.throws(() => validateSettings({ pollMinutes: 2 }), /pollMinutes/);
  assert.throws(() => validateSettings({ port: 80 }), /port/);
  assert.equal(validateSettings({ taskLeadDays: 5 }).taskLeadDays, 5);
  assert.throws(() => validateSettings({ taskLeadDays: 40 }), /taskLeadDays/);
  assert.equal(validateSettings({ blockStartHour: 19 }).blockStartHour, 19);
  assert.throws(() => validateSettings({ blockStartHour: 24 }), /blockStartHour/);
  assert.throws(() => validateSettings({ blockEndHour: -1 }), /blockEndHour/);
  assert.throws(() => validateSettings({ blockStartHour: 22, blockEndHour: 21 }), /blockEndHour must be after/);
  assert.equal(validateSettings({ blockWithinHours: 48 }).blockWithinHours, 48);
  assert.throws(() => validateSettings({ blockWithinHours: 0 }), /blockWithinHours/);
  assert.throws(() => validateSettings({ blockWithinHours: 73 }), /blockWithinHours/);
  assert.throws(() => validateSettings({ blockStartHour: 20.5 }), /integer/);
  assert.equal(validateSettings({ appHost: "Course.localhost" }).appHost, "course.localhost");
  assert.throws(() => validateSettings({ appHost: "course.example.com" }), /appHost/);
  assert.equal(validateSettings({ appHost: "127.0.0.1" }).appHost, "127.0.0.1");
  assert.throws(() => validateSettings({ courses: [{ course: "X", source: "nope" }] }), /source/);
  assert.throws(() => validateSettings({ canvasBase: "canvas.illinois.edu" }), /canvasBase/);
  assert.throws(() => validateSettings({ canvasBase: "" }), /canvasBase/);
  assert.equal(validateSettings({ canvasBase: " https://canvas.illinois.edu " }).canvasBase, "https://canvas.illinois.edu");
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

test("corrupt file logs error and returns defaults", () => {
  const corruptFile = join(mkdtempSync(join(tmpdir(), "ucm-")), "corrupt.json");
  writeFileSync(corruptFile, "{nope");
  const s = loadSettings(corruptFile);
  assert.equal(s.port, 4258);
  const recent = recentLog();
  const found = recent.some((entry) => /SETTINGS FILE PROBLEM/.test(entry.msg));
  assert.ok(found, "Expected SETTINGS FILE PROBLEM in recentLog");
});

test("settings file is written owner-only", { skip: process.platform === "win32" ? "posix modes only" : false }, () => {
  const f = join(mkdtempSync(join(tmpdir(), "ucm-")), "settings.json");
  saveSettings(f, { pollMinutes: 10 });
  assert.equal(statSync(f).mode & 0o777, 0o600, "settings.json holds the Canvas token and Google secret");
  saveSettings(f, { pollMinutes: 20 });
  assert.equal(statSync(f).mode & 0o777, 0o600, "still owner-only after a rewrite");
});

test("canvasFeedUrl defaults to empty, validates shape, and masks like a secret", () => {
  assert.equal(DEFAULTS.canvasFeedUrl, "");
  assert.equal(loadSettings(join(mkdtempSync(join(tmpdir(), "ucm-")), "settings.json")).canvasFeedUrl, "");

  const ok = "https://canvas.illinois.edu/feeds/calendars/user_aBc123XyZ.ics";
  assert.equal(validateSettings({ canvasFeedUrl: ` ${ok} ` }).canvasFeedUrl, ok);
  assert.equal(validateSettings({ canvasFeedUrl: "" }).canvasFeedUrl, "");
  for (const bad of [
    "http://canvas.illinois.edu/feeds/calendars/user_abc.ics",
    "https://canvas.illinois.edu/feeds/calendars/user_abc.ical",
    "https://canvas.illinois.edu/calendar",
    "https://evil.example/x/../feeds/calendars/user_abc.ics",
  ]) assert.throws(() => validateSettings({ canvasFeedUrl: bad }), /canvasFeedUrl/, `${bad} should be rejected`);

  const f = join(mkdtempSync(join(tmpdir(), "ucm-")), "settings.json");
  assert.equal(saveSettings(f, { canvasFeedUrl: ok }).canvasFeedUrl, ok);
  assert.equal(maskSettings({ ...DEFAULTS, canvasFeedUrl: ok }).canvasFeedUrl, "••••.ics");
  assert.equal(maskSettings({ ...DEFAULTS }).canvasFeedUrl, "");
});

test("prairietest is a source with no id: one entry covers every CBTF course", () => {
  const out = validateSettings({ courses: [{ course: "CBTF", source: "prairietest", instanceId: "ignored" }] });
  assert.deepEqual(out.courses, [{ course: "CBTF", source: "prairietest" }]);
});

test("blank google id/secret in the file fall back to the shared client", () => {
  const f = join(mkdtempSync(join(tmpdir(), "ucm-")), "settings.json");
  writeFileSync(f, JSON.stringify({ google: { clientId: "", clientSecret: "" } }));
  const s = loadSettings(f);
  assert.deepEqual(s.google, DEFAULTS.google);
  assert.ok(DEFAULTS.google.clientId && DEFAULTS.google.clientSecret, "shared client is built in");
  writeFileSync(f, JSON.stringify({ google: { clientId: "mine", clientSecret: "" } }));
  assert.deepEqual(loadSettings(f).google, { clientId: "mine", clientSecret: DEFAULTS.google.clientSecret });
});

test("old repo owner client id is migrated to default client id", () => {
  const f = join(mkdtempSync(join(tmpdir(), "ucm-")), "settings.json");
  writeFileSync(f, JSON.stringify({ google: { clientId: "legacy-repo-owner.apps.googleusercontent.com", clientSecret: "legacy-test-secret" } }));
  const s = loadSettings(f);
  assert.equal(s.google.clientId, DEFAULTS.google.clientId);
});
