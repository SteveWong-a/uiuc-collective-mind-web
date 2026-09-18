import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, createHash } from "node:crypto";

// Desktop OAuth Client ID for UIUC Collective Mind.
// For Desktop apps (RFC 7636 PKCE), client secrets are not confidential and are not required.
export const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "desktop-client.apps.googleusercontent.com";
export const DEFAULT_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "desktop-client-secret";

// Calendar events, full calendar, and tasks scope for managing homework and study blocks.
export const SCOPE = "https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SKEW_MS = 60_000;

export class GoogleAuth {
  #tok = null; #state = null; #verifier = null;
  constructor({ tokenFile, getSettings, fetchImpl = fetch, now = () => Date.now() }) {
    Object.assign(this, { tokenFile, getSettings, fetchImpl, now });
    if (existsSync(tokenFile)) { try { this.#tok = JSON.parse(readFileSync(tokenFile, "utf8")); } catch { this.#tok = null; } }
  }
  get connected() { return Boolean(this.#tok?.refreshToken); }

  #creds() {
    const google = this.getSettings?.().google ?? {};
    let clientId = google.clientId || DEFAULT_CLIENT_ID;
    if (clientId === "legacy-repo-owner.apps.googleusercontent.com") {
      clientId = DEFAULT_CLIENT_ID;
    }
    const isDefault = clientId === DEFAULT_CLIENT_ID;
    const clientSecret = google.clientSecret || (isDefault ? DEFAULT_CLIENT_SECRET : null);
    return {
      clientId,
      clientSecret,
    };
  }

  authUrl({ redirectUri, scope = SCOPE }) {
    const { clientId } = this.#creds();
    this.#state = randomBytes(16).toString("hex");
    this.#verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(this.#verifier).digest("base64url");
    const u = new URL(AUTH_URL);
    for (const [k, v] of Object.entries({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
      state: this.#state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })) u.searchParams.set(k, v);
    return { url: u.toString(), state: this.#state };
  }

  async #token(params) {
    const { clientId, clientSecret } = this.#creds();
    const body = { client_id: clientId, ...params };
    if (clientSecret) body.client_secret = clientSecret;
    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(`Google token error: ${data.error_description || data.error || res.status}`);
    return data;
  }

  #save() {
    mkdirSync(dirname(this.tokenFile), { recursive: true, mode: 0o700 });
    writeFileSync(this.tokenFile, JSON.stringify(this.#tok, null, 2) + "\n", { mode: 0o600 });
    chmodSync(this.tokenFile, 0o600);
  }

  async handleCallback({ code, state, redirectUri }) {
    if (!state || state !== this.#state) throw new Error("OAuth state mismatch");
    this.#state = null;
    const verifier = this.#verifier;
    this.#verifier = null;
    const params = { grant_type: "authorization_code", code, redirect_uri: redirectUri };
    if (verifier) params.code_verifier = verifier;
    const d = await this.#token(params);
    if (!d.refresh_token) throw new Error("Google did not return a refresh token; remove the app at myaccount.google.com/permissions and connect again");
    this.#tok = { refreshToken: d.refresh_token, accessToken: d.access_token, expiresAt: this.now() + d.expires_in * 1000 };
    this.#save();
  }

  async getAccessToken() {
    if (!this.connected) throw new Error("Google not connected");
    if (this.#tok.accessToken && this.#tok.expiresAt - SKEW_MS > this.now()) return this.#tok.accessToken;
    const d = await this.#token({ grant_type: "refresh_token", refresh_token: this.#tok.refreshToken });
    this.#tok = { ...this.#tok, accessToken: d.access_token, expiresAt: this.now() + d.expires_in * 1000 };
    this.#save();
    return this.#tok.accessToken;
  }

  forgetAccessToken() { if (this.#tok) { this.#tok.expiresAt = 0; } }

  disconnect() { this.#tok = null; if (existsSync(this.tokenFile)) unlinkSync(this.tokenFile); }
}
