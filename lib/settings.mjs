import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { log } from "./log.mjs";

export const SOURCES = ["canvas", "prairielearn", "cs128", "smartphysics", "prairietest"];

export const DEFAULTS = Object.freeze({
  port: 4258,
  pollMinutes: 30,
  taskLeadDays: 3,
  blockStartHour: 20,
  blockEndHour: 23,
  blockWithinHours: 24,
  appHost: "course.localhost",
  canvasToken: "",
  canvasFeedUrl: "",
  canvasBase: "https://canvas.illinois.edu",
  // Shared OAuth "Desktop app" client using RFC 7636 PKCE.
  // Google does not treat desktop-client secrets as confidential, and PKCE does not require one.
  google: { clientId: process.env.GOOGLE_CLIENT_ID || "desktop-client.apps.googleusercontent.com", clientSecret: process.env.GOOGLE_CLIENT_SECRET || "desktop-client-secret" },
  // No default courses: courses must be added in Settings (or settings.json).
  // An empty default prevents any hardcoded IDs from being polled on first run.
  courses: [],
});

export function validateSettings(patch) {
  const out = {};
  for (const key of ["pollMinutes", "port", "taskLeadDays", "blockStartHour", "blockEndHour", "blockWithinHours"]) {
    if (patch[key] === undefined) continue;
    const n = Number(patch[key]);
    if (!Number.isInteger(n)) throw new Error(`${key} must be an integer`);
    out[key] = n;
  }
  if (out.pollMinutes !== undefined && (out.pollMinutes < 5 || out.pollMinutes > 720)) throw new Error("pollMinutes must be between 5 and 720");
  if (out.taskLeadDays !== undefined && (out.taskLeadDays < 0 || out.taskLeadDays > 30)) throw new Error("taskLeadDays must be between 0 and 30");
  if (out.port !== undefined && (out.port < 1024 || out.port > 65535)) throw new Error("port must be between 1024 and 65535");
  for (const key of ["blockStartHour", "blockEndHour"]) if (out[key] !== undefined && (out[key] < 0 || out[key] > 23)) throw new Error(`${key} must be between 0 and 23`);
  if (out.blockWithinHours !== undefined && (out.blockWithinHours < 1 || out.blockWithinHours > 72)) throw new Error("blockWithinHours must be between 1 and 72");
  // Both hours always travel together from the Settings dialog, so an inverted
  // evening is caught here rather than becoming an event Google refuses.
  if (out.blockStartHour !== undefined && out.blockEndHour !== undefined && out.blockEndHour <= out.blockStartHour) throw new Error("blockEndHour must be after blockStartHour");
  for (const key of ["canvasToken", "canvasBase", "canvasFeedUrl"]) if (patch[key] !== undefined) out[key] = String(patch[key]).trim();
  if (patch.appHost !== undefined) {
    const h = String(patch.appHost).trim().toLowerCase();
    if (!(h === "localhost" || h === "127.0.0.1" || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.localhost$/.test(h))) throw new Error("appHost must be localhost, 127.0.0.1 or a name ending in .localhost");
    out.appHost = h;
  }
  if (out.canvasBase !== undefined && !/^https?:\/\//.test(out.canvasBase)) throw new Error("canvasBase must start with http:// or https://");
  // The personal calendar feed is a bearer secret in URL form: pin it to the
  // exact https .../feeds/calendars/user_<token>.ics shape so a typo or a
  // pasted-in different link cannot turn the poller into a general fetcher.
  if (out.canvasFeedUrl && !/^https:\/\/[^/]+\/feeds\/calendars\/user_[A-Za-z0-9]+\.ics$/.test(out.canvasFeedUrl))
    throw new Error("canvasFeedUrl must look like https://canvas.illinois.edu/feeds/calendars/user_<token>.ics");
  if (patch.google !== undefined) {
    if (typeof patch.google !== "object" || patch.google === null) throw new Error("google must be an object");
    out.google = {};
    for (const k of ["clientId", "clientSecret"]) if (patch.google[k] !== undefined) out.google[k] = String(patch.google[k]).trim();
  }
  if (patch.courses !== undefined) {
    if (!Array.isArray(patch.courses)) throw new Error("courses must be an array");
    out.courses = patch.courses.map((c) => {
      if (!c || typeof c.course !== "string" || !c.course.trim()) throw new Error("each course needs a name");
      if (!SOURCES.includes(c.source)) throw new Error(`source must be one of ${SOURCES.join(", ")}`);
      const row = { course: c.course.trim(), source: c.source };
      if (c.source === "prairielearn") { if (!/^\d+$/.test(String(c.instanceId))) throw new Error("prairielearn needs numeric instanceId"); row.instanceId = String(c.instanceId); }
      if (c.source === "canvas") { if (!/^\d+$/.test(String(c.courseId))) throw new Error("canvas needs numeric courseId"); row.courseId = String(c.courseId); }
      if (c.source === "smartphysics") { if (!/^\d+$/.test(String(c.enrollmentId))) throw new Error("smartphysics needs numeric enrollmentId"); row.enrollmentId = String(c.enrollmentId); }
      return row;
    });
  }
  return out;
}

export function loadSettings(file) {
  if (!existsSync(file)) return structuredClone(DEFAULTS);
  let json = {};
  try { json = JSON.parse(readFileSync(file, "utf8")); } catch (e) { log(`SETTINGS FILE PROBLEM: could not parse ${file}: ${e.message} — using defaults`); json = {}; }
  return { ...structuredClone(DEFAULTS), ...json, google: mergeGoogle(json.google) };
}

// An empty clientId / clientSecret in the file means "use the shared client",
// not "no client": settings.example.json used to ship them blank, and the
// Settings dialog posts the id field even when it was cleared.
function mergeGoogle(g) {
  const out = { ...DEFAULTS.google };
  for (const k of ["clientId", "clientSecret"]) if (g?.[k]) out[k] = g[k];
  // If settings.json has the legacy David/repo-owner client ID, seamlessly migrate it to the current default
  if (out.clientId === "legacy-repo-owner.apps.googleusercontent.com") {
    out.clientId = DEFAULTS.google.clientId;
    out.clientSecret = DEFAULTS.google.clientSecret;
  }
  return out;
}

export function saveSettings(file, patch) {
  const current = loadSettings(file);
  const valid = validateSettings(patch);
  const merged = { ...current, ...valid, google: { ...current.google, ...(valid.google ?? {}) } };
  // Holds the Canvas token, the secret Canvas feed URL and the Google client
  // secret: owner-only, always.
  writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return merged;
}

const mask = (s) => (s ? "••••" + String(s).slice(-4) : "");
export function maskSettings(s) {
  return { ...s, canvasToken: mask(s.canvasToken), canvasFeedUrl: mask(s.canvasFeedUrl), google: { ...s.google, clientSecret: mask(s.google?.clientSecret) } };
}
