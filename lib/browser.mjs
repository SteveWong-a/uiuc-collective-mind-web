import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export class LoginRequiredError extends Error {
  constructor(url) { super(`Login required (landed on ${url})`); this.name = "LoginRequiredError"; this.url = url; }
}

const LOGIN_RE = /shibboleth\.illinois\.edu|login\.microsoftonline\.com|login\.illinois\.edu|lassso(?:\.las)?\.illinois\.edu|\/pl\/login|\/login(?:[/?#]|$)|\/logon(?:[/?#]|$)|\/Account\/|\/saml\//i;
export function isLoginUrl(url) { return LOGIN_RE.test(String(url)); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url) => { try { return new URL(String(url)).host; } catch { return null; } };

export async function defaultLaunch(profileDir, { headless }) {
  const { chromium } = await import("playwright");
  return chromium.launchPersistentContext(profileDir, { headless, viewport: headless ? { width: 1280, height: 900 } : null, args: ["--disable-blink-features=AutomationControlled"] });
}

export class Browser {
  #ctx = null; #headed = false; #queue = Promise.resolve(); #loginPage = null;
  constructor({ profileDir, launch = defaultLaunch, log = () => {}, cookieFile = null, ssoWaitMs = 15_000, ssoPollMs = 500 }) {
    Object.assign(this, { profileDir, launch, log, cookieFile, ssoWaitMs, ssoPollMs });
  }
  get headed() { return this.#headed; }

  async #ensure(headless) {
    if (this.#ctx) return this.#ctx;
    this.log(`launching browser (${headless ? "headless" : "headed"})`);
    const ctx = await this.launch(this.profileDir, { headless });
    ctx.on("close", () => { if (this.#ctx === ctx) { this.#ctx = null; this.#headed = false; this.#loginPage = null; } });
    this.#ctx = ctx; this.#headed = !headless;
    await this.#restoreCookies(ctx);
    return ctx;
  }

  // Cookies also live in the persistent profile; this copy survives a profile
  // that Chromium decided to reset and makes the "log in again after every
  // restart" case rarer. Best effort only — never fail a poll over it.
  async #restoreCookies(ctx) {
    if (!this.cookieFile || typeof ctx.addCookies !== "function" || !existsSync(this.cookieFile)) return;
    try { await ctx.addCookies(JSON.parse(readFileSync(this.cookieFile, "utf8"))); }
    catch (e) { this.log(`could not restore cookies from ${this.cookieFile}: ${e.message}`); }
  }

  async #saveCookies(ctx) {
    if (!this.cookieFile || typeof ctx.cookies !== "function") return;
    try {
      const cookies = await ctx.cookies();
      mkdirSync(dirname(this.cookieFile), { recursive: true });
      const tmp = `${this.cookieFile}.tmp`;
      writeFileSync(tmp, JSON.stringify(cookies), { mode: 0o600 });
      renameSync(tmp, this.cookieFile);
      chmodSync(this.cookieFile, 0o600);
    } catch { /* ignore */ }
  }

  // A live SSO session bounces through the IdP and back on its own within a few
  // seconds, so a login URL is only a real login prompt if it is still there
  // after ssoWaitMs. Throws LoginRequiredError when the user must act.
  async #settleLogin(page, targetUrl) {
    if (!isLoginUrl(page.url())) {
      if (await page.$('input[type="password"]')) throw new LoginRequiredError(page.url());
      return;
    }
    const host = hostOf(targetUrl);
    const deadline = Date.now() + this.ssoWaitMs;
    while (Date.now() < deadline) {
      await sleep(this.ssoPollMs);
      const current = page.url();
      if (isLoginUrl(current)) continue;
      if (host !== null && hostOf(current) !== host) continue;
      if (await page.$('input[type="password"]')) continue;
      this.log(`SSO completed on its own (${current})`);
      return;
    }
    throw new LoginRequiredError(page.url());
  }

  // True when no login window is open. A page object without isClosed() (older
  // test fakes) is treated as still open: never close a window we cannot ask.
  #loginDone() { return !this.#loginPage || this.#loginPage.isClosed?.() === true; }

  #serial(fn) { const job = this.#queue.then(fn, fn); this.#queue = job.catch(() => {}); return job; }

  withPage(url, fn) {
    return this.#serial(async () => {
      const wasHeaded = this.#headed;
      const ctx = await this.#ensure(!this.#headed);
      // Never drive the window the user is logging in through.
      const page = ctx.pages().find((p) => p !== this.#loginPage) ?? (await ctx.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await this.#settleLogin(page, url);
      const result = await fn(page);
      await this.#saveCookies(ctx);
      // The headed window exists only so the user can log in. A fetch that got
      // through it proves the session works, so drop it and poll headless again
      // — but only once the login window is gone: a sibling source polling
      // successfully must never kill a window the user is still typing into.
      if (wasHeaded && this.#ctx === ctx && this.#loginDone()) {
        this.#ctx = null; this.#headed = false; this.#loginPage = null;
        this.log("login confirmed, closing the visible browser window");
        await ctx.close().catch(() => {});
      }
      return result;
    });
  }

  openForLogin(url) {
    return this.#serial(async () => {
      if (this.#ctx && !this.#headed) { await this.#ctx.close().catch(() => {}); this.#ctx = null; this.#headed = false; this.#loginPage = null; }
      const ctx = await this.#ensure(false);
      const page = await ctx.newPage();
      this.#loginPage = page;
      page.on?.("close", () => { if (this.#loginPage === page) this.#loginPage = null; });
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.bringToFront().catch(() => {});
    });
  }

  /** Close the browser when it is idle (headless, no login window) so nothing runs between polls. */
  releaseIdle() {
    return this.#serial(async () => {
      if (this.#ctx && !this.#headed) { const c = this.#ctx; this.#ctx = null; this.#loginPage = null; await c.close().catch(() => {}); }
    });
  }

  async close() { if (this.#ctx) { const c = this.#ctx; this.#ctx = null; this.#headed = false; this.#loginPage = null; await c.close().catch(() => {}); } }
}
