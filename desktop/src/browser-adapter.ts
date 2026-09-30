import { BrowserWindow, session, shell } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export class LoginRequiredError extends Error {
  url: string;
  constructor(url: string) { 
    super(`Login required (landed on ${url})`); 
    this.name = "LoginRequiredError"; 
    this.url = url; 
  }
}

// Keep in sync with lib/browser.mjs. cs128.org SSO starts at /auth (not /login);
// a bare /auth/ substring would false-positive PrairieLearn instructor URLs.
const LOGIN_RE = /shibboleth\.illinois\.edu|login\.microsoftonline\.com|login\.illinois\.edu|lassso(?:\.las)?\.illinois\.edu|\/pl\/login|\/login(?:[/?#]|$)|\/logon(?:[/?#]|$)|\/Account\/|\/saml\/|cs128\.org\/auth(?:[/?#]|$)/i;
export function isLoginUrl(url: string) { return LOGIN_RE.test(String(url)); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url: string) => { try { return new URL(String(url)).host; } catch { return null; } };

// Cloudflare managed-challenge interstitial. Keep in sync with lib/browser.mjs.
const BOT_CHALLENGE_DETECT_JS = `(() => {
  const document = globalThis.document;
  if (!document) return false;
  if (/^just a moment/i.test(document.title || "")) return true;
  if (document.querySelector("#challenge-running, #cf-challenge-running, #challenge-stage, iframe[src*='challenges.cloudflare.com']")) return true;
  const text = (document.body && document.body.innerText) || "";
  return /verify you are (?:a )?human|checking your browser before accessing/i.test(text);
})()`;

// Only auto-close the headed login window after a real SSO URL was seen and the
// user is back on the target site. First paint of cs128.org is Cloudflare's
// "Just a moment..." page on the gradebook URL — treating that as success
// closed the window in ~1s. Keep in sync with lib/browser.mjs.
export function shouldAutoCloseLoginWindow({ url, targetUrl, sawLoginFlow, hasPassword = false, hasSsoForm = false, isChallenge = false }: {
  url: string;
  targetUrl: string;
  sawLoginFlow: boolean;
  hasPassword?: boolean;
  hasSsoForm?: boolean;
  isChallenge?: boolean;
}) {
  if (!sawLoginFlow || isChallenge || hasPassword || hasSsoForm || isLoginUrl(url)) return false;
  if (String(url).includes("login.aspx")) return false;
  const host = hostOf(targetUrl);
  if (host != null && hostOf(url) !== host) return false;
  return true;
}

// Cookie JSON sidecar: LMS hosts only, never IdP. Keep in sync with lib/browser.mjs.
const LMS_COOKIE_HOSTS = [
  "canvas.illinois.edu",
  "us.prairielearn.com",
  "us.prairietest.com",
  "cs128.org",
  "smart.physics.illinois.edu",
];

function hostMatchesAllowed(host: string | undefined, allowed: string) {
  const h = String(host || "").replace(/^\./, "").toLowerCase();
  const a = String(allowed || "").replace(/^\./, "").toLowerCase();
  if (!h || !a) return false;
  return h === a || h.endsWith("." + a);
}

export function isPersistableLmsCookieDomain(domain: string | undefined) {
  return LMS_COOKIE_HOSTS.some((allowed) => hostMatchesAllowed(domain, allowed));
}

function cookieDomainOf(cookie: { domain?: string; url?: string }) {
  if (cookie?.domain) return String(cookie.domain);
  if (cookie?.url) {
    try { return new URL(cookie.url).hostname; } catch { return ""; }
  }
  return "";
}

const LOGIN_POPUP_HOSTS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.windows.net",
  "login.live.com",
  "msauth.net",
  "msauthimages.net",
  "microsoftazuread-sso.com",
  "shibboleth.illinois.edu",
  "login.illinois.edu",
  "lassso.las.illinois.edu",
  "lassso.illinois.edu",
  "duosecurity.com",
  "cloudflare.com",
  "cs128.org",
  "us.prairielearn.com",
  "prairielearn.com",
  "us.prairietest.com",
  "prairietest.com",
  "canvas.illinois.edu",
  "smart.physics.illinois.edu",
];

export function isAllowedLoginPopupUrl(url: string) {
  const raw = String(url || "").trim();
  if (!raw || raw === "about:blank" || raw === "about:srcdoc") return true;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol === "about:") return parsed.pathname === "blank" || parsed.pathname === "srcdoc";
  if (parsed.protocol !== "https:") return false;
  return LOGIN_POPUP_HOSTS.some((allowed) => hostMatchesAllowed(parsed.hostname, allowed));
}

export class ElectronBrowser {
  profileDir: string;
  cookieFile: string | null;
  log: (msg: string) => void;
  ssoWaitMs: number;
  ssoPollMs: number;
  
  private _headed = false;
  private _queue: Promise<any> = Promise.resolve();
  private _loginPage: BrowserWindow | null = null;
  private _session: Electron.Session | null = null;

  constructor({ profileDir, log = () => {}, cookieFile = null, ssoWaitMs = 15_000, ssoPollMs = 500 }: any) {
    this.profileDir = profileDir;
    this.log = log;
    this.cookieFile = cookieFile;
    this.ssoWaitMs = ssoWaitMs;
    this.ssoPollMs = ssoPollMs;
  }
  
  get headed() { return this._headed; }

  private _scraperWebPrefs(): Electron.WebPreferences {
    return {
      session: this._session!,
      nodeIntegration: false,
      contextIsolation: true,
      // Login/scraper windows only — not the loopback UI.
      disableBlinkFeatures: 'AutomationControlled',
    };
  }

  private _loginPopupOpenHandler({ url }: { url: string }) {
    if (!isAllowedLoginPopupUrl(url)) {
      this.log(`Blocked login popup to ${url}`);
      if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' as const };
    }
    return {
      action: 'allow' as const,
      overrideBrowserWindowOptions: {
        width: 1000,
        height: 800,
        webPreferences: this._scraperWebPrefs()
      }
    };
  }

  private _guardLoginPopupNavigations(child: BrowserWindow) {
    const block = (event: Electron.Event, navUrl: string) => {
      if (isAllowedLoginPopupUrl(navUrl)) return;
      event.preventDefault();
      this.log(`Blocked login popup navigation to ${navUrl}`);
      if (/^https:\/\//i.test(navUrl)) shell.openExternal(navUrl).catch(() => {});
    };
    child.webContents.on('will-navigate', block);
    child.webContents.on('will-redirect', block);
    child.webContents.setWindowOpenHandler((details) => this._loginPopupOpenHandler(details));
  }

  private async _ensureSession() {
    if (this._session) return this._session;
    this._session = session.fromPartition('persist:scraper');
    // Electron's default UA includes "Electron/…" which Cloudflare challenges
    // treat as a bot. Strip it so the headed login window can complete the
    // "Just a moment..." / "Verify you are human" interstitial.
    const ua = this._session.getUserAgent().replace(/\sElectron\/\S+/i, '');
    this._session.setUserAgent(ua);
    await this._restoreCookies();
    return this._session;
  }

  private async _restoreCookies() {
    if (!this.cookieFile || !existsSync(this.cookieFile) || !this._session) return;
    try { 
      const cookies = JSON.parse(readFileSync(this.cookieFile, "utf8"));
      // Deduplicate cookies: if there are multiple cookies with the same name and path on overlapping domains,
      // keep only the host-specific one or the newest.
      const cookieMap = new Map<string, any>();
      for (const cookie of cookies) {
        if (!cookie || !cookie.name) continue;
        if (!isPersistableLmsCookieDomain(cookieDomainOf(cookie))) continue;
        const domainKey = (cookie.domain || "").replace(/^\./, "").toLowerCase();
        const key = `${cookie.name}|${domainKey}|${cookie.path || '/'}`;
        // Prefer exact host domain (without leading dot)
        if (!cookieMap.has(key) || !cookie.domain?.startsWith(".")) {
          cookieMap.set(key, cookie);
        }
      }

      for (const cookie of cookieMap.values()) {
        try {
          const cleanDomain = (cookie.domain || "").replace(/^\./, '');
          const url = (cookie.secure ? 'https://' : 'http://') + cleanDomain + (cookie.path || '/');
          
          // Remove any existing cookie first to avoid "overwritten an HttpOnly cookie" errors
          await this._session.cookies.remove(url, cookie.name).catch(() => {});

          await this._session.cookies.set({
            url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain?.startsWith('.') ? cookie.domain : undefined,
            path: cookie.path || '/',
            secure: !!cookie.secure,
            httpOnly: !!cookie.httpOnly,
            expirationDate: cookie.expires > 0 ? cookie.expires : undefined
          });
        } catch (err: any) {
          this.log(`Skipping invalid cookie ${cookie.name}: ${err.message}`);
        }
      }
    }
    catch (e: any) { this.log(`could not restore cookies from ${this.cookieFile}: ${e.message}`); }
  }

  private async _saveCookies() {
    if (!this.cookieFile || !this._session) return;
    try {
      const cookies = await this._session.cookies.get({});
      mkdirSync(dirname(this.cookieFile), { recursive: true });
      const tmp = `${this.cookieFile}.tmp`;
      
      // Deduplicate by name + domainKey + path
      const cookieMap = new Map<string, any>();
      for (const c of cookies) {
        if (!c || !c.name) continue;
        if (!isPersistableLmsCookieDomain(cookieDomainOf(c))) continue;
        const domainKey = (c.domain || "").replace(/^\./, "").toLowerCase();
        const key = `${c.name}|${domainKey}|${c.path || '/'}`;
        if (!cookieMap.has(key) || !c.domain?.startsWith(".")) {
          cookieMap.set(key, {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expirationDate || -1,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite === 'unspecified' ? 'Lax' : c.sameSite
          });
        }
      }

      const formattedCookies = Array.from(cookieMap.values());
      writeFileSync(tmp, JSON.stringify(formattedCookies), { mode: 0o600 });
      renameSync(tmp, this.cookieFile);
      chmodSync(this.cookieFile, 0o600);
    } catch { /* ignore */ }
  }

  private async _isBotChallenge(win: BrowserWindow): Promise<boolean> {
    if (win.isDestroyed()) return false;
    return !!(await win.webContents.executeJavaScript(BOT_CHALLENGE_DETECT_JS).catch(() => false));
  }

  private async _settleLogin(win: BrowserWindow, targetUrl: string) {
    let currentUrl = win.webContents.getURL();
    const hasSsoForm = await win.webContents.executeJavaScript(`!!document.querySelector('form[action*="lassso"], form[action*="shibboleth"]')`).catch(() => false);
    const challenged = await this._isBotChallenge(win);
    if (!isLoginUrl(currentUrl) && !hasSsoForm && !challenged) {
      const hasPassword = await win.webContents.executeJavaScript(`!!document.querySelector('input[type="password"]')`).catch(() => false);
      if (hasPassword) throw new LoginRequiredError(currentUrl);
      return;
    }
    const host = hostOf(targetUrl);
    const deadline = Date.now() + this.ssoWaitMs;
    while (Date.now() < deadline) {
      await sleep(this.ssoPollMs);
      if (win.isDestroyed()) throw new Error("Window closed during SSO");
      currentUrl = win.webContents.getURL();
      
      if (isLoginUrl(currentUrl)) continue;
      if (await this._isBotChallenge(win)) continue;
      if (host !== null && hostOf(currentUrl) !== host) continue;
      
      const hasPassword = await win.webContents.executeJavaScript(`!!document.querySelector('input[type="password"]')`).catch(() => false);
      if (hasPassword) continue;
      const stillHasSsoForm = await win.webContents.executeJavaScript(`!!document.querySelector('form[action*="lassso"], form[action*="shibboleth"]')`).catch(() => false);
      if (stillHasSsoForm) continue;
      
      this.log(`SSO completed on its own (${currentUrl})`);
      return;
    }

    // If settling timed out on SmartPhysics, clear stale session cookies to avoid looping
    if (targetUrl.includes("smart.physics.illinois.edu") && this._session) {
      const spCookies = await this._session.cookies.get({ name: ".smartphysics2" });
      for (const c of spCookies) {
        const dom = (c.domain || "").replace(/^\./, '');
        const u = `https://${dom}${c.path || '/'}`;
        await this._session.cookies.remove(u, c.name).catch(() => {});
      }
    }
    throw new LoginRequiredError(currentUrl);
  }

  private _serial<T>(fn: () => Promise<T>): Promise<T> { 
    const job = this._queue.then(fn, fn); 
    this._queue = job.catch(() => {}); 
    return job; 
  }

  withPage(url: string, fn: (pageShim: any) => Promise<any>) {
    return this._serial(async () => {
      const sess = await this._ensureSession();
      
      // If target is SmartPhysics, ensure conflicting duplicate .smartphysics2 cookies are removed
      if (url.includes("smart.physics.illinois.edu")) {
        const spCookies = await sess.cookies.get({ name: ".smartphysics2" });
        if (spCookies.length > 1) {
          for (const c of spCookies) {
            if (c.domain?.startsWith('.')) {
              const dom = (c.domain || "").replace(/^\./, '');
              const u = `https://${dom}${c.path || '/'}`;
              await sess.cookies.remove(u, c.name).catch(() => {});
            }
          }
        }
      }

      const win = new BrowserWindow({
        show: false,
        webPreferences: this._scraperWebPrefs()
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      try {
        await win.loadURL(url);
        
        // Wait for network idle - Electron doesn't have a direct equivalent, so we poll
        let lastLoadTime = Date.now();
        const navHandler = () => { lastLoadTime = Date.now(); };
        win.webContents.on('did-start-loading', navHandler);
        
        while(Date.now() - lastLoadTime < 500) {
           await sleep(100);
        }
        win.webContents.removeListener('did-start-loading', navHandler);

        await this._settleLogin(win, url);
        
        // Create a shim that looks like a Playwright Page object
        const pageShim = {
          url: () => win.webContents.getURL(),
          content: () => win.webContents.executeJavaScript('document.documentElement.outerHTML'),
          evaluate: (funcStr: string | Function, arg?: any) => {
            const func = typeof funcStr === 'string' ? funcStr : funcStr.toString();
            return win.webContents.executeJavaScript(`(${func})(${JSON.stringify(arg || null)})`);
          },
          $: async (selector: string) => {
            return await win.webContents.executeJavaScript(`document.querySelector('${selector}') ? true : null`);
          },
          waitForSelector: async (selector: string, options?: any) => {
             const timeout = options?.timeout || 30000;
             const start = Date.now();
             while (Date.now() - start < timeout) {
               const found = await win.webContents.executeJavaScript(`!!document.querySelector('${selector}')`);
               if (found) return true;
               await sleep(100);
             }
             throw new Error(`Timeout waiting for selector: ${selector}`);
          }
        };

        const result = await fn(pageShim);
        await this._saveCookies();
        return result;
      } finally {
        if (!win.isDestroyed()) {
          win.close();
        }
      }
    });
  }

  async openForLogin(url: string) {
    const sess = await this._ensureSession();
    if (this._loginPage && !this._loginPage.isDestroyed()) {
      this._loginPage.close();
    }

    // Clear any stale .smartphysics2 cookies that cause the redirect loop
    if (url.includes("smart.physics.illinois.edu")) {
      const spCookies = await sess.cookies.get({ name: ".smartphysics2" });
      for (const c of spCookies) {
        const dom = (c.domain || "").replace(/^\./, '');
        const u = `https://${dom}${c.path || '/'}`;
        await sess.cookies.remove(u, c.name).catch(() => {});
      }
    }
    
    const win = new BrowserWindow({
      width: 1000,
      height: 800,
      show: true,
      title: "Log in - UIUC Collective Mind",
      webPreferences: this._scraperWebPrefs()
    });
    
    this._loginPage = win;
    this._headed = true;

    // Microsoft / Cloudflare / Duo may open a popup. Only known IdP and
    // challenge hosts share persist:scraper; everything else is denied.
    win.webContents.setWindowOpenHandler((details) => this._loginPopupOpenHandler(details));
    win.webContents.on('did-create-window', (child) => {
      this._guardLoginPopupNavigations(child);
    });
    
    win.on("closed", async () => {
      await this._saveCookies();
      if (this._loginPage === win) {
        this._loginPage = null;
        this._headed = false;
      }
    });

    // Detect redirect loops and close only after a real SSO round-trip.
    let loopNavCount = 0;
    let lastNavTime = Date.now();
    let sawLoginFlow = false;

    win.webContents.on("did-navigate", async (_event, navUrl) => {
      const now = Date.now();
      if (now - lastNavTime < 2000 && (navUrl.includes("login.aspx") || navUrl.includes("lassso"))) {
        loopNavCount++;
        if (loopNavCount >= 3) {
          this.log("Redirect loop detected on LASSSO/SmartPhysics, clearing stale session cookies...");
          loopNavCount = 0;
          const spCookies = await sess.cookies.get({ name: ".smartphysics2" });
          for (const c of spCookies) {
            const dom = (c.domain || "").replace(/^\./, '');
            const u = `https://${dom}${c.path || '/'}`;
            await sess.cookies.remove(u, c.name).catch(() => {});
          }
          if (!win.isDestroyed()) {
            win.loadURL(url).catch(() => {});
          }
          return;
        }
      } else if (now - lastNavTime > 3000) {
        loopNavCount = 0;
      }
      lastNavTime = now;

      if (win.isDestroyed()) return;
      if (isLoginUrl(navUrl)) sawLoginFlow = true;

      // Cloudflare paints on the same cs128.org URL as the gradebook. Wait for
      // the interstitial (or the real page) before deciding this navigation
      // was a successful login.
      await sleep(750);
      if (win.isDestroyed()) return;

      const currentUrl = win.webContents.getURL();
      const isChallenge = await this._isBotChallenge(win);
      const hasPassword = await win.webContents.executeJavaScript(`!!document.querySelector('input[type="password"]')`).catch(() => false);
      const hasSsoForm = await win.webContents.executeJavaScript(`!!document.querySelector('form[action*="lassso"], form[action*="shibboleth"]')`).catch(() => false);
      if (isLoginUrl(currentUrl) || hasPassword || hasSsoForm) sawLoginFlow = true;
      if (!shouldAutoCloseLoginWindow({ url: currentUrl, targetUrl: url, sawLoginFlow, hasPassword, hasSsoForm, isChallenge })) {
        return;
      }

      this.log(`Login confirmed (${currentUrl}), saving cookies and closing window.`);
      await this._saveCookies();
      if (!win.isDestroyed()) {
        win.close();
      }
    });
    
    try {
      await win.loadURL(url);
      // If the session is already valid, leave the window open on the target
      // page so the user can confirm. Never close here: loadURL resolves on
      // Cloudflare's interstitial (same cs128.org URL, no password field),
      // which used to look like "already logged in" and auto-close in ~1s.
      await this._settleLogin(win, url).catch((err: any) => {
        if (err?.name === "LoginRequiredError") {
          this.log(`User login required in window: ${err.message}`);
        } else if (!win.isDestroyed()) {
          this.log(`Login window error: ${err.message}`);
        }
      });
    } catch (err: any) {
      if (!win.isDestroyed()) {
        this.log(`Login window error: ${err.message}`);
      }
    }
  }

  releaseIdle() {
    return this._serial(async () => {
      // Nothing to do in Electron usually, since hidden windows are ephemeral
    });
  }

  async close() { 
    if (this._loginPage && !this._loginPage.isDestroyed()) {
      this._loginPage.close();
      this._loginPage = null;
      this._headed = false;
    }
  }
}
