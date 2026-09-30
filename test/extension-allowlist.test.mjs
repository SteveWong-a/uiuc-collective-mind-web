import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = readFileSync(join(root, "extension/allowlist.js"), "utf8");
const sandbox = { URL };
vm.runInNewContext(code, sandbox);

test("dashboard origins are allowlisted; any vercel.app is not", () => {
  assert.equal(sandbox.isCmindAppOrigin("http://localhost:3000"), true);
  assert.equal(sandbox.isCmindAppOrigin("https://uiuc-collective-mind-web.vercel.app"), true);
  assert.equal(sandbox.isCmindAppOrigin("https://uiuc-cmind-2026.web.app"), true);
  assert.equal(sandbox.isCmindAppOrigin("https://uiuc-cmind-2026.firebaseapp.com"), true);
  assert.equal(sandbox.isCmindAppOrigin("https://evil.vercel.app"), false);
  assert.equal(sandbox.isCmindAppOrigin("https://uiuc-collective-mind-web-git-preview.vercel.app"), false);
  assert.equal(sandbox.isCmindAppOrigin("https://canvas.illinois.edu"), false);
});

test("sender check uses the tab/page URL origin", () => {
  assert.equal(sandbox.isCmindAppSender({ url: "https://uiuc-collective-mind-web.vercel.app/dashboard" }), true);
  assert.equal(sandbox.isCmindAppSender({ tab: { url: "http://localhost:3000/" } }), true);
  assert.equal(sandbox.isCmindAppSender({ url: "https://attacker.vercel.app/" }), false);
  assert.equal(sandbox.isCmindAppSender({}), false);
});

test("FETCH_HTML only allows listing pages, not lessons or assessments", () => {
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://us.prairielearn.com/pl/course_instance/223829/assessments"), true);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://cs128.org/my/gradebook"), true);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://smart.physics.illinois.edu/Course?enrollmentID=164636"), true);

  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://us.prairielearn.com/pl/course_instance/223829/assessment/1"), false);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://us.prairielearn.com/pl/course_instance/foo/assessments"), false);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://cs128.org/2026c/the-preprocessor-the-linker-and-overloading-1906"), false);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://canvas.illinois.edu/courses/1"), false);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://evil.vercel.app/"), false);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("http://localhost:3000/"), false);
  assert.equal(sandbox.isAllowedHtmlFetchUrl("https://user:pass@cs128.org/my/gradebook"), false);
});
