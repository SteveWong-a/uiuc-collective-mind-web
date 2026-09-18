const BASE = "https://tasks.googleapis.com/tasks/v1";
const MAX_PAGES = 50;

export class TasksApi {
  constructor({ auth, fetchImpl = fetch }) { this.auth = auth; this.fetchImpl = fetchImpl; }

  async #request(method, path, { body, query } = {}) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const send = async () => this.fetchImpl(url, { ...(method !== "GET" ? { method } : {}), headers: { Authorization: `Bearer ${await this.auth.getAccessToken()}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let res = await send();
    if (res.status === 401) { this.auth.forgetAccessToken(); res = await send(); }
    if (res.status === 204) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) { const e = new Error(data?.error?.message || `${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  async ensureList(title, cachedId) {
    const lists = [];
    let pageToken;
    let pages = 0;
    do {
      if (++pages > MAX_PAGES) throw new Error(`Google Tasks pagination exceeded ${MAX_PAGES} pages`);
      const page = await this.#request("GET", "/users/@me/lists", { query: { maxResults: "100", ...(pageToken ? { pageToken } : {}) } });
      lists.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    const byId = cachedId ? lists.find((l) => l.id === cachedId) : undefined;
    if (byId) return byId.id;
    const byTitle = lists.find((l) => l.title === title);
    if (byTitle) return byTitle.id;
    return (await this.#request("POST", "/users/@me/lists", { body: { title } })).id;
  }

  async listTasks(listId) {
    const items = [];
    let pageToken;
    let pages = 0;
    do {
      if (++pages > MAX_PAGES) throw new Error(`Google Tasks pagination exceeded ${MAX_PAGES} pages`);
      const page = await this.#request("GET", `/lists/${encodeURIComponent(listId)}/tasks`, { query: { maxResults: "100", showCompleted: "true", showHidden: "true", ...(pageToken ? { pageToken } : {}) } });
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  insertTask(listId, task) { return this.#request("POST", `/lists/${encodeURIComponent(listId)}/tasks`, { body: task }); }
  patchTask(listId, id, patch) { return this.#request("PATCH", `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, { body: patch }); }
  deleteTask(listId, id) { return this.#request("DELETE", `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`); }
}
