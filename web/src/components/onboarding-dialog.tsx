"use client";

import { useRef, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { upsertUser } from "@/lib/dataconnect";
import { dataConnect } from "@/lib/firebase";

interface OnboardingDialogProps {
  onClose: () => void;
}

export default function OnboardingDialog({ onClose }: OnboardingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [courseConfigsStr, setCourseConfigsStr] = useState("[\n  {\n    \"source\": \"prairielearn\",\n    \"course\": \"CS 173\",\n    \"instanceId\": \"9999\"\n  },\n  {\n    \"source\": \"cs128\",\n    \"course\": \"CS 128\"\n  },\n  {\n    \"source\": \"smartphysics\",\n    \"course\": \"PHYS 211\",\n    \"enrollmentId\": \"9999\"\n  }\n]");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { user } = useAuth();

  useEffect(() => {
    dialogRef.current?.showModal();
    // Preload existing config if any
    const loadExistingConfig = async () => {
      if (user) {
        try {
          const { getUser } = await import("@/lib/dataconnect");
          const res = await getUser(dataConnect);
          if (res.data?.user?.courseConfigs) {
            setCourseConfigsStr(res.data.user.courseConfigs);
          }
        } catch (e) {
          console.error("Failed to load existing course configs", e);
        }
      }
    };
    loadExistingConfig();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setError("");
    
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(courseConfigsStr);
      if (!Array.isArray(parsedConfig)) throw new Error("Configuration must be a JSON array.");
    } catch (err: any) {
      setError("Invalid JSON format: " + err.message);
      return;
    }
    
    try {
      // Save the configuration to Firebase Data Connect
      await upsertUser(dataConnect, {
        email: user.email || "",
        courseConfigs: JSON.stringify(parsedConfig),
      });
      
      setSaved(true);
      setTimeout(() => {
        dialogRef.current?.close();
        onClose();
        // Reload page to reflect new settings
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError("Failed to save configuration.");
      console.error(err);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="bg-[var(--color-paper)] text-[var(--color-ink)] w-[min(700px,92vw)] p-[30px]"
      style={{
        border: "2px solid var(--color-ink)",
        borderRadius: 0,
        boxShadow: "12px 12px 0 rgba(0,0,0,0.15)",
      }}
      onClose={onClose}
    >
      <h2 className="text-[var(--color-ink)] font-bold m-0 mb-3 uppercase text-[15px] tracking-[0.5px]">
        Configure Your Courses
      </h2>
      <p className="text-[var(--color-muted)] text-[14px] mb-6 leading-relaxed">
        The Universal Sync Extension fetches your assignments automatically for Canvas. For 
        PrairieLearn, CS128, and SmartPhysics, please configure your course identifiers below.
      </p>

      {/* Course Config Section */}
      <div className="p-4 mb-4" style={{ border: "1.5px solid var(--color-rule)", boxShadow: "4px 4px 0 rgba(0,0,0,0.05)" }}>
        <h3 className="text-[15px] font-bold m-0 mb-2">Custom Sources JSON Configuration</h3>
        <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mb-3">
          Paste your JSON array specifying the sources and IDs for the courses you want to track.
        </p>
        <textarea
          value={courseConfigsStr}
          onChange={(e) => setCourseConfigsStr(e.target.value)}
          className="w-full py-[12px] px-[12px] text-[13px] bg-[var(--color-paper)] text-[var(--color-ink)] transition-all duration-200 focus:outline-none"
          style={{ border: "1.5px solid var(--color-rule)", borderRadius: 0, font: "monospace", minHeight: "220px", resize: "vertical" }}
          spellCheck={false}
        />
        {error && (
          <p className="text-[13px] text-[var(--color-red)] font-semibold mt-2">{error}</p>
        )}
      </div>

      {saved && (
        <div
          className="p-3 mb-4 font-semibold text-[var(--color-green)]"
          style={{ border: "1.5px solid var(--color-green)", background: "#f0fdf4" }}
        >
          ✓ Configuration saved securely. Reloading...
        </div>
      )}

      <div className="flex gap-[10px] justify-end mt-[20px]">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="text-[var(--color-ink)] bg-transparent py-[6px] px-[14px] cursor-pointer text-[15px] font-[inherit] transition-all duration-200 hover:bg-[var(--color-wash)]"
          style={{ border: "1.5px solid var(--color-rule)", borderRadius: 0 }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="text-[var(--color-paper)] bg-[var(--color-ink)] py-[6px] px-[14px] cursor-pointer text-[15px] font-[inherit] transition-all duration-200 hover:translate-x-[-1px] hover:translate-y-[-1px] disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0"
          style={{ border: "1.5px solid var(--color-ink)", borderRadius: 0, boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
        >
          Save & Sync
        </button>
      </div>
    </dialog>
  );
}
