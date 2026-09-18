import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Browser, LoginRequiredError, isLoginUrl } from "../lib/browser.mjs";

test("isLoginUrl", () => {
  assert.ok(isLoginUrl("https://shibboleth.illinois.edu/idp/profile/SAML2/Redirect/SSO"));
  assert.ok(isLoginUrl("https://login.microsoftonline.com/x"));
  assert.ok(isLoginUrl("https://us.prairielearn.com/pl/login"));
  assert.ok(isLoginUrl("https://cs128.org/login?next=/"));
  assert.ok(!isLoginUrl("https://us.prairielearn.com/pl/course_instance/1/assessments"));
  assert.ok(!isLoginUrl("https://us.prairielearn.com/pl/course_instance/1/instructor/auth/permissions"));
});

function fakeLaunch(landing, hasPassword = false) {
  const launched = [];
  const launch = async (dir, { headless }) => {
    const page = { url: () => landing, goto: async () => {}, waitForLoadState: async () => {}, $: async () => (hasPassword ? {} : null), bringToFront: async () => {} };
    const ctx = { pages: () => [page], newPage: async () => page, on: () => {}, close: async () => {}, cookies: async () => [], addCookies: async () => {} };
    launched.push({ headless });
    return ctx;
  };
  return { launch, launched };
}

// A launcher whose contexts track their own pages, so "which page did withPage
// use" is observable.
function multiPageLaunch({ url = "https://cs128.org/hw", cookies = [] } = {}) {
  const launched = [], made = [], added = [];
  let closed = 0;
  const launch = async (dir, { headless }) => {
    launched.push({ headless });
    const pages = [];
    const ctx = {
      pages: () => pages.slice(),
      newPage: async () => {
        const handlers = {};
        const page = {
          url: () => url, goto: async () => {}, waitForLoadState: async () => {}, $: async () => null, bringToFront: async () => {},
          closed: false,
          isClosed: () => page.closed,
          on: (event, fn) => { handlers[event] = fn; },
          // Playwright drops a closed page from ctx.pages(); the fake does too.
          close: async () => { page.closed = true; pages.splice(pages.indexOf(page), 1); handlers.close?.(); },
        };
        pages.push(page); made.push(page);
        return page;
      },
      on: () => {},
      close: async () => { closed++; },
      cookies: async () => cookies,
      addCookies: async (c) => added.push(c),
    };
    return ctx;
  };
  return { launch, launched, made, added, closedCount: () => closed };
}

test("withPage runs fn when not a login page", async () => {
  const { launch, launched } = fakeLaunch("https://us.prairielearn.com/pl/course_instance/1/assessments");
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  const r = await b.withPage("https://us.prairielearn.com/pl/course_instance/1/assessments", async (p) => p.url());
  assert.match(r, /assessments/);
  assert.deepEqual(launched, [{ headless: true }]);
});

test("withPage throws LoginRequiredError when SSO never comes back", async () => {
  const { launch } = fakeLaunch("https://shibboleth.illinois.edu/idp/x");
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {}, ssoWaitMs: 20, ssoPollMs: 1 });
  await assert.rejects(b.withPage("https://cs128.org/hw", async () => "no"), LoginRequiredError);
});

test("withPage waits out an SSO round trip that lands back on the target", async () => {
  let calls = 0;
  const page = {
    url: () => (++calls <= 3 ? "https://login.microsoftonline.com/x" : "https://cs128.org/hw"),
    goto: async () => {}, waitForLoadState: async () => {}, $: async () => null,
  };
  const launch = async () => ({ pages: () => [page], newPage: async () => page, on: () => {}, close: async () => {}, cookies: async () => [], addCookies: async () => {} });
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {}, ssoWaitMs: 2000, ssoPollMs: 1 });
  assert.equal(await b.withPage("https://cs128.org/hw", async () => "ok"), "ok");
});

test("openForLogin launches headed and withPage reuses it", async () => {
  const { launch, launched } = fakeLaunch("https://cs128.org/hw");
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  await b.openForLogin("https://cs128.org/login");
  assert.equal(b.headed, true);
  await b.withPage("https://cs128.org/hw", async () => 1);
  assert.deepEqual(launched, [{ headless: false }]);
});

test("close resets headed, next withPage launches headless", async () => {
  const { launch, launched } = fakeLaunch("https://cs128.org/hw");
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  await b.openForLogin("https://cs128.org/login");
  assert.equal(b.headed, true);
  await b.close();
  assert.equal(b.headed, false);
  await b.withPage("https://cs128.org/hw", async () => 1);
  assert.deepEqual(launched, [{ headless: false }, { headless: true }]);
});

test("a poll never uses or closes the login window while the user is still in it", async () => {
  const { launch, launched, made, closedCount } = multiPageLaunch();
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  await b.openForLogin("https://cs128.org/login");
  const loginPage = made[0];
  assert.equal(b.headed, true);

  // Another source polls successfully while the user is still mid-login.
  const used = await b.withPage("https://cs128.org/hw", async (p) => p);
  assert.notEqual(used, loginPage, "the poll must open its own page, not steal the login window");
  assert.equal(launched.length, 1, "no second launch: the headed context is reused");
  assert.equal(b.headed, true, "the user is still logging in — leave the window alone");
  assert.equal(closedCount(), 0, "the context (and the user's login window) survives the poll");

  // The user finishes and closes the login window.
  await loginPage.close();
  await b.withPage("https://cs128.org/hw", async () => 1);
  assert.equal(closedCount(), 1, "with the login window gone, the headed context is dropped");
  assert.equal(b.headed, false);

  await b.withPage("https://cs128.org/hw", async () => 1);
  assert.deepEqual(launched, [{ headless: false }, { headless: true }], "back to headless for the next poll");
});

test("cookies are written after a success and restored on the next launch", async () => {
  const cookieFile = join(mkdtempSync(join(tmpdir(), "ucm-")), "cookies.json");
  const jar = [{ name: "session", value: "abc", domain: "cs128.org" }];
  const { launch, added } = multiPageLaunch({ cookies: jar });
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {}, cookieFile });

  await b.withPage("https://cs128.org/hw", async () => 1);
  assert.deepEqual(JSON.parse(readFileSync(cookieFile, "utf8")), jar);
  if (process.platform !== "win32") assert.equal(statSync(cookieFile).mode & 0o777, 0o600);
  assert.deepEqual(added, [], "nothing to restore on the first launch");

  await b.close();
  await b.withPage("https://cs128.org/hw", async () => 1);
  assert.deepEqual(added, [jar], "the saved jar is re-added to the fresh context");
});

test("releaseIdle closes a headless context but never a headed one", async () => {
  const { launch, launched, closedCount } = multiPageLaunch({ url: "https://us.prairielearn.com/pl/course_instance/1/assessments" });
  const b = new Browser({ profileDir: "/tmp/x", launch, log: () => {} });
  await b.withPage("https://us.prairielearn.com/pl/course_instance/1/assessments", async () => 1);
  await b.releaseIdle();
  assert.equal(closedCount(), 1);
  await b.withPage("https://us.prairielearn.com/pl/course_instance/1/assessments", async () => 1);
  assert.equal(launched.length, 2, "relaunched after release");
  await b.openForLogin("https://cs128.org/login");
  await b.releaseIdle();
  assert.equal(b.headed, true, "headed login context is left alone");
});
