// Due dates are compared at minute granularity: sources encode the same deadline
// with different seconds (Canvas feed 23:59:00 vs API 23:59:59).
const minute = (iso) => (iso ? iso.slice(0, 16) : null);

export function diffSnapshots(previous, current) {
  const at = new Date().toISOString();
  const prev = new Map(previous.map((x) => [x.id, x]));
  const out = [];
  const base = (x) => ({ id: x.id, course: x.course, title: x.title, at });
  for (const cur of current) {
    const old = prev.get(cur.id);
    prev.delete(cur.id);
    if (!old) { out.push({ type: "added", ...base(cur), to: cur.dueAt }); continue; }
    if (minute(old.dueAt) !== minute(cur.dueAt)) out.push({ type: "due_changed", ...base(cur), from: old.dueAt, to: cur.dueAt });
    // A grade on its own is never an event: status_changed already announces
    // "graded", and a regrade would otherwise spam the feed. The grade rides
    // along on that event so it can read "graded: 9/10".
    if (old.status !== cur.status) out.push({ type: "status_changed", ...base(cur), from: old.status, to: cur.status, grade: cur.grade ?? null });
  }
  for (const old of prev.values()) out.push({ type: "removed", ...base(old), from: old.dueAt });
  return out;
}
