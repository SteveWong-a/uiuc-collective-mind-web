import { TZ } from "../model.mjs";

const BASE = "https://www.googleapis.com/calendar/v3";
const MAX_PAGES = 50;

// A thin Google Calendar v3 client, shaped exactly like lib/google/tasks.mjs:
// one #request with a single 401 retry, paging with a hard cap, and errors that
// carry the HTTP status so callers can tell "not consented yet" (403) apart
// from a transient failure.
export class CalendarApi {
  constructor({ auth, fetchImpl = fetch }) { this.auth = auth; this.fetchImpl = fetchImpl; }

  async #request(method, path, { body, query } = {}) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, v);
    const send = async () => this.fetchImpl(url, { ...(method !== "GET" ? { method } : {}), headers: { Authorization: `Bearer ${await this.auth.getAccessToken()}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let res = await send();
    if (res.status === 401) { this.auth.forgetAccessToken(); res = await send(); }
    if (res.status === 204) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) { const e = new Error(data?.error?.message || `${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  async #pages(path, query, onPage) {
    let pageToken;
    let pages = 0;
    do {
      if (++pages > MAX_PAGES) throw new Error(`Google Calendar pagination exceeded ${MAX_PAGES} pages`);
      const page = await this.#request("GET", path, { query: { ...query, ...(pageToken ? { pageToken } : {}) } });
      onPage(page.items ?? []);
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  /**
   * The id of the dedicated calendar, created if it is not there yet. Only a
   * calendar we own counts: a calendar of the same name shared with us is
   * someone else's and cannot be written to.
   */
  async ensureCalendar(title, cachedId) {
    const cals = [];
    try {
      await this.#pages("/users/me/calendarList", { maxResults: "250" }, (items) => cals.push(...items));
      if (cachedId && cals.some((c) => c.id === cachedId)) return cachedId;
      const byTitle = cals.find((c) => c.summary === title && c.accessRole === "owner");
      if (byTitle) return byTitle.id;
      return (await this.#request("POST", "/calendars", { body: { summary: title, timeZone: TZ } })).id;
    } catch (e) {
      if (e.status === 403) return "primary";
      throw e;
    }
  }

  /**
   * The blocks this app put on the calendar inside a window. Events without our
   * `uiucBlock` marker are the user's own and are never returned, so no later
   * step can patch or delete them.
   */
  async listEvents(calendarId, { timeMin, timeMax } = {}) {
    const items = [];
    await this.#pages(`/calendars/${encodeURIComponent(calendarId)}/events`, { maxResults: "250", singleEvents: "true", showDeleted: "false", timeMin, timeMax }, (page) => items.push(...page));
    return items.filter((e) => e?.extendedProperties?.private?.uiucBlock);
  }

  insertEvent(calendarId, event) { return this.#request("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, { body: event }); }
  patchEvent(calendarId, id, patch) { return this.#request("PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { body: patch }); }
  deleteEvent(calendarId, id) { return this.#request("DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`); }
}
