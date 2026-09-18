import { EventEmitter } from "node:events";

export const bus = new EventEmitter();
bus.setMaxListeners(100);

const ring = [];
const RING = 300;

export function log(msg) {
  const entry = { at: new Date().toISOString(), msg: String(msg) };
  console.log(`${entry.at} ${entry.msg}`);
  ring.push(entry);
  if (ring.length > RING) ring.splice(0, ring.length - RING);
  bus.emit("log", entry);
}

export function recentLog() { return ring.slice(); }
