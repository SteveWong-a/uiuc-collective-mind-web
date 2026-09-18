"use client";

import { useRef, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { upsertUser } from "@/lib/dataconnect";
import { dataConnect } from "@/lib/firebase";

import { CourseConfig, CourseConfigsArraySchema } from "@/lib/schemas";

interface OnboardingDialogProps {
  onClose: () => void;
  onOpenExtensionGuide?: () => void;
}

const DEFAULT_COURSES: CourseConfig[] = [
  { source: "prairielearn", course: "CS 173", instanceId: "148201" },
  { source: "cs128", course: "CS 128" },
  { source: "smartphysics", course: "PHYS 211", enrollmentId: "98231" },
];

export default function OnboardingDialog({ onClose, onOpenExtensionGuide }: OnboardingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [courses, setCourses] = useState<CourseConfig[]>(DEFAULT_COURSES);
  const [activeTab, setActiveTab] = useState<"visual" | "json">("visual");
  const [jsonStr, setJsonStr] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newSource, setNewSource] = useState<"prairielearn" | "smartphysics" | "cs128" | "prairietest">("prairielearn");
  const [newInstanceId, setNewInstanceId] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { user } = useAuth();

  useEffect(() => {
    dialogRef.current?.showModal();
    const loadExistingConfig = async () => {
      let initialFound = false;
      if (typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem("uiuc_cmind_courses");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCourses(parsed);
              setJsonStr(JSON.stringify(parsed, null, 2));
              initialFound = true;
            }
          }
        } catch (e) {
          console.error("Failed to parse cached course configs", e);
        }
      }

      if (user) {
        try {
          const { getUser } = await import("@/lib/dataconnect");
          const res = await getUser(dataConnect);
          if (res.data?.user?.courseConfigs) {
            const parsed = JSON.parse(res.data.user.courseConfigs);
            if (Array.isArray(parsed)) {
              setCourses(parsed);
              setJsonStr(JSON.stringify(parsed, null, 2));
              if (typeof window !== "undefined") {
                localStorage.setItem("uiuc_cmind_courses", res.data.user.courseConfigs);
              }
              initialFound = true;
            }
          }
        } catch (e) {
          console.error("Failed to load existing course configs from Data Connect", e);
        }
      }

      if (!initialFound) {
        setJsonStr(JSON.stringify(DEFAULT_COURSES, null, 2));
      }
    };
    loadExistingConfig();
  }, [user]);

  const handleAddCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) {
      setError("Please enter a course name (e.g. CS 225).");
      return;
    }
    setError("");
    const newEntry: CourseConfig = {
      source: newSource,
      course: newCourseName.trim().toUpperCase(),
    };
    if (newSource === "prairielearn" || newSource === "prairietest") {
      newEntry.instanceId = newInstanceId.trim() || "0";
    } else if (newSource === "smartphysics") {
      newEntry.enrollmentId = newInstanceId.trim() || "0";
    }
    const updated = [...courses, newEntry];
    setCourses(updated);
    setJsonStr(JSON.stringify(updated, null, 2));
    setNewCourseName("");
    setNewInstanceId("");
  };

  const handleRemoveCourse = (index: number) => {
    const updated = courses.filter((_, i) => i !== index);
    setCourses(updated);
    setJsonStr(JSON.stringify(updated, null, 2));
  };

  const handleSave = async () => {
    if (!user) return;
    setError("");

    let payload: CourseConfig[];
    if (activeTab === "json") {
      try {
        const parsed = JSON.parse(jsonStr);
        const result = CourseConfigsArraySchema.safeParse(parsed);
        if (!result.success) {
          setError(`Invalid JSON structure: ${result.error.issues[0]?.message || "Schema mismatch"}`);
          return;
        }
        payload = result.data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid JSON";
        setError(`Invalid JSON format: ${msg}`);
        return;
      }
    } else {
      const result = CourseConfigsArraySchema.safeParse(courses);
      if (!result.success) {
        setError(result.error.issues[0]?.message || "Invalid course configuration.");
        return;
      }
      payload = result.data;
    }

    const payloadJson = JSON.stringify(payload);

    // Save locally immediately so changes are never lost
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("uiuc_cmind_courses", payloadJson);
      } catch (e) {
        console.error("Failed to save to localStorage", e);
      }
    }

    try {
      await upsertUser(dataConnect, {
        email: user.email || "",
        courseConfigs: payloadJson,
      });

      setSaved(true);
      setTimeout(() => {
        dialogRef.current?.close();
        onClose();
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      console.warn("Failed to sync course configuration to Data Connect:", err);
      // Saved locally, so still allow the app to reload with updated courses
      setSaved(true);
      setTimeout(() => {
        dialogRef.current?.close();
        onClose();
        window.location.reload();
      }, 1000);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="bg-[var(--color-paper)] text-[var(--color-ink)] w-[min(740px,94vw)] p-[28px] rounded-none z-50 backdrop:bg-black/40"
      style={{
        border: "2px solid var(--color-ink)",
        boxShadow: "12px 12px 0 rgba(0,0,0,0.18)",
      }}
      onClose={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b-[1.5px] border-[var(--color-rule)] mb-5">
        <div>
          <h2 className="text-[17px] font-[800] tracking-tight uppercase m-0">
            Connect &amp; Configure Sources
          </h2>
          <p className="text-[13px] text-[var(--color-muted)] m-0 mt-0.5">
            Connect Canvas, PrairieLearn, SmartPhysics, and CS 128 to track deadlines in one view.
          </p>
        </div>
        <button
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="text-[18px] font-bold text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer bg-transparent border-none p-1"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Part 1: Canvas Extension Banner (Connected to Extension Guide) */}
      <div className="p-4 mb-5 bg-[var(--color-wash)] border-[1.5px] border-[var(--color-ink)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-[800] text-[14px]">1. Canvas Sync (Automatic via Extension)</span>
            <span className="text-[11px] bg-[var(--color-ink)] text-[var(--color-paper)] px-1.5 py-0.5 font-bold uppercase tracking-wider">
              No Config Needed
            </span>
          </div>
          <p className="text-[12px] text-[var(--color-muted)] m-0 mt-1 max-w-md leading-relaxed">
            Canvas requires no manual course IDs. Just install our Chrome Extension and log into Canvas in your browser.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onClose();
              if (onOpenExtensionGuide) onOpenExtensionGuide();
            }}
            className="px-3 py-1.5 bg-transparent border-[1.5px] border-[var(--color-ink)] text-[13px] font-[600] text-[var(--color-ink)] hover:bg-[var(--color-paper)] cursor-pointer transition-all"
          >
            Extension Guide ⓘ
          </button>
          <a
            href="/downloads/uiuc-collective-mind-extension.zip"
            download
            className="px-3 py-1.5 bg-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] text-[13px] font-[600] text-[var(--color-paper)] no-underline hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
            style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
          >
            Download .zip
          </a>
        </div>
      </div>

      {/* Part 2: PrairieLearn & Other Sources */}
      <div className="border-[1.5px] border-[var(--color-rule)] p-4 mb-5">
        <div className="flex items-center justify-between mb-3 border-b border-[var(--color-rule)] pb-2">
          <span className="font-[800] text-[14px]">
            2. Configure Other Courses (PrairieLearn, CS128, SmartPhysics)
          </span>
          <div className="flex gap-2 text-[12px]">
            <button
              type="button"
              onClick={() => setActiveTab("visual")}
              className={`px-2 py-0.5 font-semibold cursor-pointer border-b-2 transition-all ${
                activeTab === "visual"
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              Course Cards
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("json");
                setJsonStr(JSON.stringify(courses, null, 2));
              }}
              className={`px-2 py-0.5 font-semibold cursor-pointer border-b-2 transition-all ${
                activeTab === "json"
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              JSON Editor
            </button>
          </div>
        </div>

        {activeTab === "visual" ? (
          <div>
            {/* List of currently configured courses */}
            <div className="space-y-2 mb-4 max-h-[160px] overflow-y-auto pr-1">
              {courses.length === 0 ? (
                <p className="text-[13px] text-[var(--color-muted)] italic m-0">No courses configured yet. Add one below!</p>
              ) : (
                courses.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 bg-[var(--color-wash)] border border-[var(--color-rule)] text-[13px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-[700] text-[var(--color-ink)]">{c.course}</span>
                      <span className="text-[11px] uppercase tracking-wider bg-[var(--color-paper)] border border-[var(--color-rule)] px-1.5 py-0.5 text-[var(--color-muted)] font-mono">
                        {c.source}
                      </span>
                      {(c.instanceId || c.enrollmentId) && (
                        <span className="text-[12px] text-[var(--color-muted)]">
                          ID: <code>{c.instanceId || c.enrollmentId}</code>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCourse(i)}
                      className="text-[var(--color-muted)] hover:text-[var(--color-red)] font-bold text-[13px] cursor-pointer bg-transparent border-none p-1"
                      title="Remove course"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick Add Form */}
            <form onSubmit={handleAddCourse} className="p-3 bg-[var(--color-paper)] border border-[var(--color-rule)] flex flex-wrap items-end gap-2 text-[13px]">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-[11px] font-bold uppercase text-[var(--color-muted)] mb-1">
                  Course Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. CS 225"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full p-1.5 text-[13px] border border-[var(--color-rule)] bg-white text-[var(--color-ink)]"
                />
              </div>

              <div className="w-[130px]">
                <label className="block text-[11px] font-bold uppercase text-[var(--color-muted)] mb-1">
                  Platform
                </label>
                <select
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value as any)}
                  className="w-full p-1.5 text-[13px] border border-[var(--color-rule)] bg-white text-[var(--color-ink)]"
                >
                  <option value="prairielearn">PrairieLearn</option>
                  <option value="smartphysics">SmartPhysics</option>
                  <option value="cs128">CS 128</option>
                  <option value="prairietest">PrairieTest</option>
                </select>
              </div>

              <div className="w-[140px]">
                <label className="block text-[11px] font-bold uppercase text-[var(--color-muted)] mb-1" title="From PrairieLearn URL: pl/course_instance/XXXXX">
                  Instance ID <span className="font-normal text-[10px] text-[var(--color-muted)]">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 148201"
                  value={newInstanceId}
                  onChange={(e) => setNewInstanceId(e.target.value)}
                  className="w-full p-1.5 text-[13px] border border-[var(--color-rule)] bg-white text-[var(--color-ink)]"
                />
              </div>

              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--color-wash)] border-[1.5px] border-[var(--color-ink)] text-[13px] font-[600] text-[var(--color-ink)] hover:bg-[var(--color-paper)] cursor-pointer"
              >
                + Add
              </button>
            </form>
          </div>
        ) : (
          <div>
            <p className="text-[12px] text-[var(--color-muted)] mb-2">
              Edit the course configs array directly. Keys: <code>source</code>, <code>course</code>, <code>instanceId</code>.
            </p>
            <textarea
              value={jsonStr}
              onChange={(e) => setJsonStr(e.target.value)}
              className="w-full p-2.5 text-[12px] bg-[var(--color-wash)] text-[var(--color-ink)] font-mono border border-[var(--color-rule)] focus:outline-none min-h-[140px]"
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="p-2.5 mb-4 text-[13px] text-[var(--color-red)] bg-red-50 border border-[var(--color-red)] font-semibold">
          {error}
        </div>
      )}

      {saved && (
        <div className="p-2.5 mb-4 text-[13px] text-[var(--color-green)] bg-green-50 border border-[var(--color-green)] font-semibold">
          ✓ Configuration saved securely. Reloading...
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-rule)]">
        <span className="text-[12px] text-[var(--color-muted)]">
          Need help? Click <strong>Extension Guide</strong> above.
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onClose();
            }}
            className="px-4 py-2 text-[14px] bg-transparent border border-[var(--color-rule)] text-[var(--color-ink)] hover:bg-[var(--color-wash)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-[14px] font-[600] bg-[var(--color-ink)] text-[var(--color-paper)] border-[1.5px] border-[var(--color-ink)] cursor-pointer hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
            style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.15)" }}
          >
            Save &amp; Sync Sources
          </button>
        </div>
      </div>
    </dialog>
  );
}
