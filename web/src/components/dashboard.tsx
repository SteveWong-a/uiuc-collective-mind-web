"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  getUser, 
  myAssignments, 
  upsertCourse, 
  addEnrollment, 
  upsertAssignment, 
  upsertUserAssignment 
} from "@/lib/dataconnect";
import { dataConnect } from "@/lib/firebase";
import { fetchHtmlViaExtension } from "@/lib/extensionFetch";
import { parsePrairieLearn } from "@/lib/sources/prairielearn";
import { parseGradebook as parseCs128, GRADEBOOK_URL as CS128_URL } from "@/lib/sources/cs128";
import { parseSmartPhysics, SMARTPHYSICS_URL } from "@/lib/sources/smartphysics";
import SettingsDialog from "@/components/settings-dialog";
import OnboardingDialog from "@/components/onboarding-dialog";
import ExtensionGuideDialog from "@/components/extension-guide-dialog";

type Toast = { id: string; message: string; type: "success" | "error" | "info" };

// Mock data type for assignments
interface Assignment {
  id: string;
  course: string;
  title: string;
  dueAt: string | null;
  status: "open" | "submitted" | "graded" | "closed" | "unknown" | "in_progress";
  grade: string | null;
  url: string | null;
  source: string;
  details?: string | null;
}

// Status glyphs — same as the original app
const GLYPH: Record<string, string> = {
  open: "○",
  submitted: "✓",
  graded: "✓",
  closed: "⊘",
  unknown: "○",
  in_progress: "◐",
};
const GLYPH_TITLE: Record<string, string> = {
  open: "not turned in",
  submitted: "turned in, not graded yet",
  graded: "graded",
  closed: "closed",
  unknown: "status unknown",
  in_progress: "in progress",
};

const TZ = "America/Chicago";
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(iso)
  );
const dayParts = (iso: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "2-digit" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  );
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
const rel = (iso: string) => {
  const d = (new Date(iso).getTime() - Date.now()) / 36e5;
  if (Math.abs(d) < 1) return `${Math.round(d * 60)} min`;
  if (Math.abs(d) < 48) return `${Math.round(d)} h`;
  return `${Math.round(d / 24)} d`;
};


function parsePercent(grade: string | null): number | null {
  if (!grade) return null;
  const m1 = grade.match(/([\d.]+)\s*%/);
  if (m1) return Math.min(100, Math.max(0, parseFloat(m1[1])));
  const m2 = grade.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (m2 && parseFloat(m2[2]) > 0) return Math.min(100, Math.max(0, (parseFloat(m2[1]) / parseFloat(m2[2])) * 100));
  return null;
}

function getScore(a: Assignment) {
  if (a.grade) return a.grade;
  if (a.details) {
    const m = a.details.match(/Score:?\s+([\d.]+(?:\s*\/\s*[\d.]+(?:\s*\([\d.]+%\))?|%))/i);
    if (m) return m[1];
  }
  return null;
}

function checkOverdue(a: Assignment, now = Date.now()) {
  if (!a.dueAt || Date.parse(a.dueAt) >= now) return false;
  const score = getScore(a);
  const pct = parsePercent(score);
  if (pct !== null && pct > 0) return false;
  if (pct !== null && pct === 0) return true;
  return a.status === "open" || a.status === "unknown";
}

function AssignmentRow({ a }: { a: Assignment }) {
  const rawGrade = getScore(a);
  const pct = parsePercent(rawGrade);
  const overdue = checkOverdue(a);
  const cls = overdue ? "overdue" : ["graded", "submitted", "in_progress"].includes(a.status) ? "done" : a.status === "closed" ? "closed" : "";

  return (
    <div
      className={`grid items-baseline gap-[10px] py-[10px] px-[12px] mx-[-12px] border-[1.5px] border-transparent transition-all duration-200 hover:bg-[var(--color-wash)] hover:border-[var(--color-rule)] hover:translate-x-[2px] ${cls === "done" ? "opacity-70" : ""}`}
      style={{ gridTemplateColumns: "22px 92px minmax(0, 1fr) auto auto" }}
    >
      <span
        className={`text-[15px] leading-none translate-y-[1px] ${
          overdue ? "text-[var(--color-red)] font-bold" :
          a.status === "submitted" || a.status === "graded" ? "text-[var(--color-green)]" : ""
        } ${a.status === "graded" && !overdue ? "font-bold" : ""} ${a.status === "in_progress" ? "text-[var(--color-amber)]" : ""}`}
        title={overdue ? "Overdue" : GLYPH_TITLE[a.status] ?? a.status}
      >
        {overdue ? "○" : (GLYPH[a.status] ?? "○")}
      </span>
      <span
        className="text-[13px] text-[var(--color-muted)] whitespace-nowrap overflow-hidden text-ellipsis font-semibold text-right"
        title={a.course}
      >
        {a.course}
      </span>
      <span className="min-w-0 font-medium">
        {a.url && a.url !== "#" ? (
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`no-underline hover:underline hover:underline-offset-[3px] ${cls === "done" ? "text-[var(--color-muted)] line-through" : ""}`}
          >
            {a.title}
          </a>
        ) : (
          <span className={cls === "done" ? "text-[var(--color-muted)] line-through" : ""}>{a.title}</span>
        )}
        {overdue && (
          <span className="font-bold ml-2 text-[11px] bg-[#fee] text-[var(--color-red)] py-[2px] px-[6px] border-[1.5px] border-[var(--color-red)] uppercase tracking-[0.5px] align-middle">
            overdue
          </span>
        )}
      </span>
      <span className="whitespace-nowrap text-[var(--color-muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {a.dueAt && (
          <>
            <b className="text-[var(--color-ink)] font-semibold">{fmtTime(a.dueAt)}</b> {rel(a.dueAt)}
          </>
        )}
      </span>
      <span
        className="whitespace-nowrap text-[var(--color-ink)] font-semibold"
        style={{
          fontVariantNumeric: "tabular-nums",
          ...(pct !== null
            ? {
                background: `hsl(${Math.round(pct * 1.2)}, 70%, 85%)`,
                padding: "2px 6px",
                borderRadius: "4px",
              }
            : {}),
        }}
      >
        {rawGrade ? rawGrade.replace(/^[\d.]+\/[\d.]+\s*\(([\d.]+%)\)$/, "$1") : ""}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [extensionGuideOpen, setExtensionGuideOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPLSyncing, setIsPLSyncing] = useState(false);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    // Fetch the user's configured tokens from Data Connect
    const loadData = async () => {
      try {
        await getUser(dataConnect).catch(() => {});
        
        const assignmentsRes = await myAssignments(dataConnect);
        if (assignmentsRes.data?.userAssignments) {
          const loaded: Assignment[] = assignmentsRes.data.userAssignments.map(ua => ({
            id: ua.assignment.externalId,
            course: ua.assignment.course.name,
            title: ua.assignment.title,
            dueAt: ua.assignment.dueDate || null,
            status: (ua.status as any) || "open",
            grade: ua.score || null,
            url: (ua.assignment as any).url || "#",
            source: (ua.assignment as any).source || "unknown",
          }));
          setAssignments(loaded);
        }
      } catch (err) {
        console.error("Failed to load Data Connect data:", err);
      }
    };
    
    const loadSettings = async () => {
      try {
        const res = await getUser(dataConnect);
        if (res.data?.user?.courseConfigs) {
          setAppSettings({ courses: JSON.parse(res.data.user.courseConfigs) });
        }
      } catch (err) {
        console.error("Failed to load custom courses from DB:", err);
      }
    };

    if (user) {
      loadData();
      loadSettings();
    }
  }, [user]);

  const saveAssignmentsToDB = async (syncedData: Assignment[]) => {
    try {
      const uniqueCourses = [...new Set(syncedData.map(a => a.course))];
      
      // Upsert courses and enrollments
      await Promise.all(uniqueCourses.map(async (courseName) => {
        await upsertCourse(dataConnect, { name: courseName });
        await addEnrollment(dataConnect, { courseName });
      }));

      // Upsert assignments and user scores
      await Promise.all(syncedData.map(async (a) => {
        await upsertAssignment(dataConnect, {
          courseName: a.course,
          title: a.title,
          dueDate: a.dueAt || null,
          externalId: a.id,
          url: a.url,
          source: a.source
        });
        await upsertUserAssignment(dataConnect, {
          assignmentExternalId: a.id,
          score: a.grade,
          status: a.status
        });
      }));
    } catch (err) {
      console.error("Failed to save to Data Connect:", err);
      throw err;
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === "CMIND_SYNC_RESPONSE") {
        const { payload } = event.data;
        if (payload?.success) {
          try {
            await saveAssignmentsToDB(payload.data);
            
            // Reload all assignments from DB
            const assignmentsRes = await myAssignments(dataConnect);
            if (assignmentsRes.data?.userAssignments) {
              const loaded: Assignment[] = assignmentsRes.data.userAssignments.map(ua => ({
                id: ua.assignment.externalId,
                course: ua.assignment.course.name,
                title: ua.assignment.title,
                dueAt: ua.assignment.dueDate || null,
                status: (ua.status as any) || "open",
                grade: ua.score || null,
                url: (ua.assignment as any).url || "#",
                source: (ua.assignment as any).source || "unknown",
              }));
              setAssignments(loaded);
            }
            addToast(`Successfully synced and saved ${payload.data.length} assignments!`, "success");
          } catch (err) {
            addToast("Sync succeeded, but saving to the database failed.", "error");
          }
        } else {
          addToast(`Sync failed: ${payload?.error || "Unknown error"}`, "error");
        }
        setIsSyncing(false);
        setIsPLSyncing(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const courses = [...new Set(assignments.map((a) => a.course))];
  const filtered = assignments.filter((a) => !filter || a.course === filter);

  const [hideOverdue, setHideOverdue] = useState(false);
  const now = Date.now();
  const todayStr = dayKey(new Date().toISOString());
  const isOverdue = (a: Assignment) => checkOverdue(a, now);
  const upcoming = filtered
    .filter((a) => a.dueAt && (Date.parse(a.dueAt) >= now || isOverdue(a)))
    .filter((a) => !hideOverdue || !isOverdue(a))
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  const past = filtered
    .filter((a) => a.dueAt && Date.parse(a.dueAt) < now && !isOverdue(a))
    .sort((a, b) => Date.parse(b.dueAt!) - Date.parse(a.dueAt!));
  const undated = filtered.filter((a) => !a.dueAt);

  // Group upcoming by day
  const groups = new Map<string, Assignment[]>();
  for (const a of upcoming) {
    const k = isOverdue(a) ? todayStr : dayKey(a.dueAt!);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }

  const handleCanvasSync = useCallback(() => {
    setIsSyncing(true);
    window.postMessage({ type: "CMIND_SYNC_REQUEST", source: "canvas", settings: appSettings }, "*");
    
    setTimeout(() => {
      setIsSyncing((current) => {
        if (current) {
          addToast("Sync timed out. Is the UIUC Collective Mind Chrome Extension installed and enabled?", "error");
          return false;
        }
        return current;
      });
    }, 5000);
  }, [appSettings, addToast]);

  const handlePLSync = useCallback(async () => {
    setIsPLSyncing(true);
    
    try {
      if (!appSettings || !appSettings.courses) throw new Error("Settings not loaded.");
      
      const plCourses = appSettings.courses.filter((c: any) => c.source === "prairielearn");
      let allAssignments: any[] = [];
      
      for (const c of plCourses) {
        if (!c.instanceId) continue;
        const url = `https://us.prairielearn.com/pl/course_instance/${c.instanceId}/assessments`;
        const html = await fetchHtmlViaExtension(url);
        const parsed = parsePrairieLearn(html, { course: c.course, instanceId: c.instanceId });
        allAssignments = allAssignments.concat(parsed);
      }
      
      if (allAssignments.length > 0) {
        await saveAssignmentsToDB(allAssignments);
        const assignmentsRes = await myAssignments(dataConnect);
        if (assignmentsRes.data?.userAssignments) {
          const loaded: Assignment[] = assignmentsRes.data.userAssignments.map(ua => ({
            id: ua.assignment.externalId,
            course: ua.assignment.course.name,
            title: ua.assignment.title,
            dueAt: ua.assignment.dueDate || null,
            status: (ua.status as any) || "open",
            grade: ua.score || null,
            url: (ua.assignment as any).url || "#",
            source: (ua.assignment as any).source || "unknown",
          }));
          setAssignments(loaded);
        }
        addToast(`Successfully synced ${allAssignments.length} assignments from PrairieLearn!`, "success");
      } else {
        addToast("No PrairieLearn assignments found or no PrairieLearn courses configured.", "info");
      }
    } catch (err: any) {
      addToast(`PrairieLearn sync failed: ${err.message}`, "error");
    } finally {
      setIsPLSyncing(false);
    }
  }, [appSettings, addToast]);

  const [isCustomSyncing, setIsCustomSyncing] = useState(false);
  const handleCustomSync = useCallback(async () => {
    setIsCustomSyncing(true);
    try {
      if (!appSettings || !appSettings.courses) throw new Error("Settings not loaded.");
      let allAssignments: any[] = [];
      
      const cs128Courses = appSettings.courses.filter((c: any) => c.source === "cs128");
      for (const c of cs128Courses) {
        const html = await fetchHtmlViaExtension(CS128_URL);
        const parsed = parseCs128(html, { course: c.course });
        allAssignments = allAssignments.concat(parsed);
      }

      const spCourses = appSettings.courses.filter((c: any) => c.source === "smartphysics");
      for (const c of spCourses) {
        if (!c.enrollmentId) continue;
        const url = SMARTPHYSICS_URL(c.enrollmentId);
        const html = await fetchHtmlViaExtension(url);
        const parsed = parseSmartPhysics(html, { course: c.course, enrollmentId: c.enrollmentId });
        allAssignments = allAssignments.concat(parsed);
      }
      
      if (allAssignments.length > 0) {
        await saveAssignmentsToDB(allAssignments);
        const assignmentsRes = await myAssignments(dataConnect);
        if (assignmentsRes.data?.userAssignments) {
          const loaded: Assignment[] = assignmentsRes.data.userAssignments.map(ua => ({
            id: ua.assignment.externalId,
            course: ua.assignment.course.name,
            title: ua.assignment.title,
            dueAt: ua.assignment.dueDate || null,
            status: (ua.status as any) || "open",
            grade: ua.score || null,
            url: (ua.assignment as any).url || "#",
            source: (ua.assignment as any).source || "unknown",
          }));
          setAssignments(loaded);
        }
        addToast(`Successfully synced ${allAssignments.length} assignments from Custom Sources!`, "success");
      } else {
        addToast("No custom assignments found or configured.", "info");
      }
    } catch (err: any) {
      addToast(`Custom Sync failed: ${err.message}`, "error");
    } finally {
      setIsCustomSyncing(false);
    }
  }, [appSettings, addToast]);

  return (
    <>
      {/* Header */}
      <header
        className="flex items-baseline gap-4 px-7 pb-[14px] flex-wrap bg-[rgba(255,255,255,0.95)] sticky top-0 z-10"
        style={{
          borderBottom: "1.5px solid var(--color-ink)",
          backdropFilter: "blur(4px)",
          paddingTop: "44px",
          marginTop: "-22px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
        }}
      >
        <h1 className="m-0 text-[20px] font-[800] tracking-tight">UIUC Collective Mind</h1>
        <span className="text-[var(--color-muted)]">
          {user?.displayName ? `Hi, ${user.displayName.split(" ")[0]}` : "Connected"}
        </span>
        <span className="flex-1" />
        <div className="flex gap-2 items-center flex-wrap">
          <a
            href="/download"
            className="flex items-center gap-1.5 text-[var(--color-ink)] bg-[var(--color-wash)] border-[1.5px] border-[var(--color-ink)] py-[6px] px-[14px] cursor-pointer transition-all duration-200 text-[15px] font-[500] hover:bg-[var(--color-paper)] hover:translate-x-[-1px] hover:translate-y-[-1px]"
            style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Desktop App
          </a>
          <button
            onClick={() => setOnboardingOpen(true)}
            className="text-[var(--color-paper)] bg-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] py-[6px] px-[14px] cursor-pointer transition-all duration-200 text-[15px] font-[inherit] hover:translate-x-[-1px] hover:translate-y-[-1px]"
            style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
          >
            Connect Sources
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-[var(--color-ink)] bg-transparent border-[1.5px] border-[var(--color-rule)] py-[6px] px-[14px] cursor-pointer transition-all duration-200 text-[15px] font-[inherit] hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)]"
          >
            Settings
          </button>
          <button
            onClick={logout}
            className="text-[var(--color-ink)] bg-transparent border-[1.5px] border-[var(--color-rule)] py-[6px] px-[14px] cursor-pointer transition-all duration-200 text-[15px] font-[inherit] hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)]"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1160px] mx-auto py-[18px] px-7 pb-[60px] grid gap-10" style={{ gridTemplateColumns: "minmax(0, 1fr) 300px" }}>
        {/* Left column */}
        <section>
          {/* Course filter chips & Overdue toggle */}
          <div className="flex justify-between items-center flex-wrap gap-3 my-[4px] mb-[22px]">
            <div className="flex gap-[6px] flex-wrap m-0">
              <span
                onClick={() => setFilter(null)}
                className={`border-[1.5px] py-[4px] px-[12px] cursor-pointer select-none text-[13px] font-medium transition-all duration-200 hover:translate-y-[-1px] ${
                  !filter
                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                    : "border-[var(--color-rule)] bg-[var(--color-paper)] hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)]"
                }`}
                style={{ boxShadow: !filter ? "2px 2px 0 rgba(0,0,0,0.15)" : "none" }}
              >
                All courses
              </span>
              {courses.map((c) => (
                <span
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`border-[1.5px] py-[4px] px-[12px] cursor-pointer select-none text-[13px] font-medium transition-all duration-200 hover:translate-y-[-1px] ${
                    filter === c
                      ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                      : "border-[var(--color-rule)] bg-[var(--color-paper)] hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)]"
                  }`}
                  style={{ boxShadow: filter === c ? "2px 2px 0 rgba(0,0,0,0.15)" : "none" }}
                >
                  {c}
                </span>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer select-none whitespace-nowrap font-medium">
              <input
                type="checkbox"
                checked={hideOverdue}
                onChange={(e) => setHideOverdue(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Hide overdue</span>
            </label>
          </div>

          <h2 className="text-[15px] font-semibold text-[var(--color-muted)] mt-0 mb-[10px] uppercase tracking-[0.5px]">
            Coming up
          </h2>
          {upcoming.length > 0 ? (
            [...groups.entries()].map(([k, arr]) => {
              const p = dayParts(k === todayStr ? new Date().toISOString() : arr[0].dueAt!);
              return (
                <div
                  key={k}
                  className={`grid py-[14px] ${k === todayStr ? "bg-[var(--color-wash)] mx-[-10px] px-[10px]" : ""}`}
                  style={{ gridTemplateColumns: "76px minmax(0, 1fr)", borderTop: "1.5px solid var(--color-ink)" }}
                >
                  <div className="leading-none pt-[4px]">
                    <span className="block text-[13px] text-[var(--color-muted)] mb-[2px]">
                      {k === todayStr ? "Today" : p.weekday}
                    </span>
                    <span className="block text-[42px] font-[800] tracking-[-0.03em] text-[var(--color-ink)]">
                      {p.day}
                    </span>
                    <span className="block text-[13px] text-[var(--color-muted)] mt-[4px]">{p.month}</span>
                  </div>
                  <div className="grid">
                    {arr.map((a) => (
                      <AssignmentRow key={a.id} a={a} />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-[var(--color-muted)] italic text-[14px]">Nothing due. Sync now to check again.</p>
          )}

          {undated.length > 0 && (
            <>
              <h2 className="text-[15px] font-semibold text-[var(--color-muted)] mt-[34px] mb-[10px] uppercase tracking-[0.5px]">
                No due date
              </h2>
              <div>
                {undated.map((a) => (
                  <AssignmentRow key={a.id} a={a} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Right sidebar */}
        <aside>
          <section className="mb-[30px]">
            <div className="flex items-center justify-between mt-0 mb-[8px]">
              <h2 className="text-[15px] font-semibold text-[var(--color-muted)] m-0 uppercase tracking-[0.5px]">
                Sources
              </h2>
              <button
                onClick={() => setExtensionGuideOpen(true)}
                className="text-[12px] font-semibold text-[var(--color-ink)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
              >
                <span>Extension Guide</span>
                <span>ⓘ</span>
              </button>
            </div>
            <div className="py-[8px]" style={{ borderTop: "1.5px solid var(--color-ink)" }}>
              {/* Canvas Source */}
              <div className="flex justify-between items-center py-[8px] border-b-[1px] border-[var(--color-rule)]">
                <span className="font-semibold text-[14px]">Canvas</span>
                <button
                  onClick={handleCanvasSync}
                  disabled={isSyncing}
                  className="text-[var(--color-ink)] bg-transparent border-[1.5px] border-[var(--color-rule)] py-[4px] px-[10px] text-[13px] font-medium cursor-pointer hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)] transition-all duration-200 disabled:opacity-50 disabled:cursor-wait"
                >
                  {isSyncing ? "Syncing..." : "Sync"}
                </button>
              </div>

              {/* PrairieLearn Source */}
              <div className="flex justify-between items-center py-[8px] border-b-[1px] border-[var(--color-rule)]">
                <span className="font-semibold text-[14px]">PrairieLearn</span>
                <button
                  onClick={handlePLSync}
                  disabled={isPLSyncing}
                  className="text-[var(--color-ink)] bg-transparent border-[1.5px] border-[var(--color-rule)] py-[4px] px-[10px] text-[13px] font-medium cursor-pointer hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)] transition-all duration-200 disabled:opacity-50 disabled:cursor-wait"
                >
                  {isPLSyncing ? "Syncing..." : "Sync"}
                </button>
              </div>

              {/* Custom Sources */}
              <div className="flex justify-between items-center py-[8px] border-b-[1px] border-[var(--color-rule)]">
                <span className="font-semibold text-[14px]">Custom Sources</span>
                <button
                  onClick={handleCustomSync}
                  disabled={isCustomSyncing || !appSettings}
                  className="text-[var(--color-ink)] bg-transparent border-[1.5px] border-[var(--color-rule)] py-[4px] px-[10px] text-[13px] font-medium cursor-pointer hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)] transition-all duration-200 disabled:opacity-50 disabled:cursor-wait"
                >
                  {isCustomSyncing ? "Syncing..." : "Sync"}
                </button>
              </div>
            </div>
            <p className="text-[var(--color-muted)] text-[12px] mt-3 leading-relaxed">
              Connect your Canvas and PrairieLearn accounts by clicking "Connect Sources" above.
            </p>
          </section>

          <section className="mb-[30px]">
            <h2 className="text-[15px] font-semibold text-[var(--color-muted)] mt-0 mb-[8px] uppercase tracking-[0.5px]">
              Past Assignments
            </h2>
            {past.length > 0 ? (
              past.map((a) => (
                <div
                  key={a.id}
                  className="py-[10px] px-[8px] mx-[-8px] text-[14px] transition-colors duration-200 hover:bg-[var(--color-wash)]"
                  style={{ borderTop: "1px solid var(--color-rule)" }}
                >
                  <div>
                    <b>{a.course}</b> {a.title}
                  </div>
                  <div className="text-[var(--color-muted)] text-[12px]">
                    {a.dueAt ? `${fmtDay(a.dueAt)} ${fmtTime(a.dueAt)}` : ""}{" "}
                    {a.grade && <span className="font-semibold text-[var(--color-ink)]">{a.grade}</span>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[var(--color-muted)] italic text-[14px]">No past assignments.</p>
            )}
          </section>
        </aside>
      </main>

      {/* Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`p-3 min-w-[250px] shadow-lg flex items-start gap-2 pointer-events-auto transition-all ${
              t.type === "error" ? "bg-[var(--color-red)] text-white" : 
              t.type === "success" ? "bg-[#f0fdf4] text-[var(--color-green)] border border-[var(--color-green)]" : 
              "bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-rule)]"
            }`}
            style={{ borderRadius: 0 }}
          >
            <div className="font-medium text-[13px]">{t.message}</div>
          </div>
        ))}
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {onboardingOpen && <OnboardingDialog onClose={() => setOnboardingOpen(false)} />}
      {extensionGuideOpen && <ExtensionGuideDialog onClose={() => setExtensionGuideOpen(false)} />}
    </>
  );
}
