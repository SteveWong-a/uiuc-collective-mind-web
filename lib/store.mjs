import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const EMPTY = () => ({ assignments: [], changes: [], sources: {}, lastPoll: null, google: { tasklistId: null, calendarId: null, mapping: {} } });
const MAX_CHANGES = 200;

export class Store {
  constructor(file) {
    this.file = file;
    this.loadError = null;
    this.state = EMPTY();
    if (existsSync(file)) {
      try {
        const json = JSON.parse(readFileSync(file, "utf8"));
        this.state = { ...EMPTY(), ...json, google: { ...EMPTY().google, ...(json.google ?? {}) } };
      } catch (e) { this.loadError = `could not read ${file}: ${e.message}`; }
    }
  }
  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.state, null, 2) + "\n");
    renameSync(tmp, this.file);
  }
  pushChanges(changes) {
    this.state.changes = [...changes, ...this.state.changes].slice(0, MAX_CHANGES);
  }
}
