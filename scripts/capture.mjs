// Usage: node scripts/capture.mjs <url> <outfile>
// Opens a headed Chromium with the persistent profile, waits until the page is
// not a login page (you log in manually), then saves page.content() to outfile.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error("usage: node scripts/capture.mjs <url> <outfile>"); process.exit(1); }
const profile = join(dirname(fileURLToPath(import.meta.url)), "..", "profile");
const ctx = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: ["--disable-blink-features=AutomationControlled"] });
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(url, { waitUntil: "domcontentloaded" });
console.log("Log in if prompted. Capturing when the page URL matches the target host and has no login form (up to 5 min)...");
const target = new URL(url).host;
const ready = async () => {
  if (page.url().startsWith("http") === false) return false;
  const u = new URL(page.url());
  if (u.host !== target || /login|saml|auth/i.test(u.pathname)) return false;
  return !(await page.$('input[type="password"]'));
};
// Wait until the page has been on the target host, logged in, for 3 consecutive seconds
// (the first hit on the target host may redirect to SSO a moment later).
const deadline = Date.now() + 300_000;
let stableSince = null;
while (Date.now() < deadline) {
  if (await ready().catch(() => false)) {
    stableSince ??= Date.now();
    if (Date.now() - stableSince >= 3000) break;
  } else stableSince = null;
  await new Promise((r) => setTimeout(r, 500));
}
if (!stableSince) { console.error("timed out waiting for login"); await ctx.close(); process.exit(2); }
await page.waitForLoadState("networkidle").catch(() => {});
const html = await page.content();
writeFileSync(out, html);
console.log(`saved ${out} (${html.length} bytes) from ${page.url()}`);
await ctx.close();
