import { BrowserWindow, session } from 'electron';
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

const LOGIN_RE = /shibboleth\.illinois\.edu|login\.microsoftonline\.com|login\.illinois\.edu|lassso(?:\.las)?\.illinois\.edu|\/pl\/login|\/login(?:[/?#]|$)|\/logon(?:[/?#]|$)|\/Account\/|\/saml\//i;
export function isLoginUrl(url: string) { return LOGIN_RE.test(String(url)); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url: string) => { try { return new URL(String(url)).host; } catch { return null; } };

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

  private async _ensureSession() {
    if (this._session) return this._session;
    this._session = session.fromPartition('persist:scraper');
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

  private async _settleLogin(win: BrowserWindow, targetUrl: string) {
    let currentUrl = win.webContents.getURL();
    const hasSsoForm = await win.webContents.executeJavaScript(`!!document.querySelector('form[action*="lassso"], form[action*="shibboleth"]')`).catch(() => false);
    if (!isLoginUrl(currentUrl) && !hasSsoForm) {
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
        webPreferences: {
          session: sess,
          nodeIntegration: false,
          contextIsolation: true
        }
      });

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
      webPreferences: {
        session: sess,
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    this._loginPage = win;
    this._headed = true;
    
    win.on("closed", async () => {
      await this._saveCookies();
      if (this._loginPage === win) {
        this._loginPage = null;
        this._headed = false;
      }
    });

    // Detect redirect loops and monitor successful login
    let loopNavCount = 0;
    let lastNavTime = Date.now();
    const targetHost = hostOf(url);

    win.webContents.on("did-navigate", async (event, navUrl) => {
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

      // Check if we reached the target authenticated page
      if (targetHost && hostOf(navUrl) === targetHost && !isLoginUrl(navUrl) && !navUrl.includes("login.aspx")) {
        const hasPassword = await win.webContents.executeJavaScript(`!!document.querySelector('input[type="password"]')`).catch(() => false);
        const hasSsoForm = await win.webContents.executeJavaScript(`!!document.querySelector('form[action*="lassso"], form[action*="shibboleth"]')`).catch(() => false);
        if (!hasPassword && !hasSsoForm) {
          this.log(`Login confirmed (${navUrl}), saving cookies and closing window.`);
          await this._saveCookies();
          if (!win.isDestroyed()) {
            win.close();
          }
        }
      }
    });
    
    try {
      await win.loadURL(url);
      // Wait for SSO redirect to settle if already authenticated
      await this._settleLogin(win, url);
      
      this.log("Login confirmed, saving cookies and closing window.");
      await this._saveCookies();
      if (!win.isDestroyed()) {
        win.close();
      }
    } catch (err: any) {
      if (err.name === "LoginRequiredError") {
        this.log(`User login required in window: ${err.message}`);
      } else {
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
