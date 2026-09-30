import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const API_COOKIE = "ucm_api";

export function tokensEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function loadOrCreateApiToken(file) {
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (/^[A-Za-z0-9_-]{32,}$/.test(existing)) return existing;
  }
  const token = randomBytes(32).toString("base64url");
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${token}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
  return token;
}

export function apiCookieHeader(token) {
  return `${API_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}

function cookieValue(header, name) {
  if (!header) return null;
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function providedApiToken(req) {
  const auth = req.headers?.authorization;
  if (auth) {
    const m = String(auth).match(/^Bearer\s+(\S+)/i);
    if (m) return m[1];
  }
  return cookieValue(req.headers?.cookie, API_COOKIE);
}

export function hasValidApiToken(req, token) {
  return tokensEqual(providedApiToken(req) ?? "", token ?? "");
}

// Browsers send Sec-Fetch-Site on fetch / XHR / SSE / subresources. A missing
// Origin plus a site other than "none" is a page-initiated request (including
// CSRF). curl and other non-browser clients omit the header.
export function isBrowserLikeMissingOrigin(req) {
  const origin = req.headers?.origin;
  if (origin !== undefined && origin !== "") return false;
  const site = String(req.headers?.["sec-fetch-site"] ?? "").toLowerCase();
  return site === "cross-site" || site === "same-site" || site === "same-origin";
}
