"use client";

import { useRef, useEffect } from "react";
import { IconX, IconDownload } from "@/components/icons";

interface ExtensionGuideDialogProps {
  onClose: () => void;
}

export default function ExtensionGuideDialog({ onClose }: ExtensionGuideDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="bg-[var(--color-paper)] text-[var(--color-ink)] w-[min(720px,94vw)] p-[30px] rounded-none z-50 backdrop:bg-black/40"
      style={{
        border: "1px solid var(--color-ink)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
      }}
      onClose={onClose}
    >
      <div className="flex justify-between items-start pb-4 mb-4 border-b border-[var(--color-rule)]">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-1">
            Documentation
          </div>
          <h2 className="text-[20px] font-[800] tracking-tight m-0">
            Install Chrome Extension for Canvas Sync
          </h2>
        </div>
        <button
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer bg-transparent border-none p-1 transition-colors"
          title="Close"
        >
          <IconX className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[14px] text-[var(--color-muted)] leading-relaxed mb-5">
        Because web browsers block cross-origin requests for security reasons, the Chrome Extension acts as a local bridge
        to securely read your active sessions and assignments directly from <strong>Canvas</strong>, <strong>PrairieLearn</strong>, and <strong>SmartPhysics</strong>.
      </p>

      {/* Download Action */}
      <div className="p-4 mb-6 bg-[var(--color-wash)] border border-[var(--color-rule)] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="font-[700] text-[14px]">Step 0: Download the Extension Package</div>
          <div className="text-[12px] text-[var(--color-muted)]">Includes manifest, background worker, and sync content scripts.</div>
        </div>
        <a
          href="/downloads/uiuc-collective-mind-extension.zip"
          download
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--color-ink)] text-[var(--color-paper)] text-[13px] font-[600] no-underline transition-all hover:opacity-90"
          style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}
        >
          <IconDownload className="w-4 h-4" />
          Download Extension (.zip)
        </a>
      </div>

      {/* Step by step list */}
      <div className="space-y-4 text-[13px] leading-relaxed mb-6">
        <div className="flex gap-3 items-start">
          <span className="w-6 h-6 rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] font-bold text-[12px] flex items-center justify-center shrink-0">
            1
          </span>
          <div>
            <strong className="text-[var(--color-ink)]">Unzip the downloaded file:</strong>
            <p className="text-[var(--color-muted)] m-0 mt-0.5">
              Extract <code>uiuc-collective-mind-extension.zip</code> into a folder on your computer (e.g., in your <em>Documents</em> or <em>Downloads</em> folder).
            </p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          <span className="w-6 h-6 rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] font-bold text-[12px] flex items-center justify-center shrink-0">
            2
          </span>
          <div>
            <strong className="text-[var(--color-ink)]">Open Chrome Extensions Manager:</strong>
            <p className="text-[var(--color-muted)] m-0 mt-0.5">
              Open Google Chrome and navigate to <code className="bg-[var(--color-wash)] px-1.5 py-0.5 border border-[var(--color-rule)]">chrome://extensions</code> in the address bar (or go to <strong>⋮ &gt; Extensions &gt; Manage Extensions</strong>).
            </p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          <span className="w-6 h-6 rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] font-bold text-[12px] flex items-center justify-center shrink-0">
            3
          </span>
          <div>
            <strong className="text-[var(--color-ink)]">Turn on &quot;Developer mode&quot;:</strong>
            <p className="text-[var(--color-muted)] m-0 mt-0.5">
              Toggle the <strong>Developer mode</strong> switch in the top-right corner of the extensions page to <em>ON</em>.
            </p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          <span className="w-6 h-6 rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] font-bold text-[12px] flex items-center justify-center shrink-0">
            4
          </span>
          <div>
            <strong className="text-[var(--color-ink)]">Click &quot;Load unpacked&quot;:</strong>
            <p className="text-[var(--color-muted)] m-0 mt-0.5">
              Click the <strong>Load unpacked</strong> button that appears in the top-left toolbar, and select the unzipped extension folder (the directory containing <code>manifest.json</code>).
            </p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          <span className="w-6 h-6 rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] font-bold text-[12px] flex items-center justify-center shrink-0">
            5
          </span>
          <div>
            <strong className="text-[var(--color-ink)]">Log in to Canvas &amp; Sync:</strong>
            <p className="text-[var(--color-muted)] m-0 mt-0.5">
              Make sure you are logged into <a href="https://canvas.illinois.edu" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-[var(--color-ink)]">canvas.illinois.edu</a> in Chrome, then return here and click <strong>Sync</strong>!
            </p>
          </div>
        </div>
      </div>

      <div className="p-3 bg-[var(--color-wash)] border border-[var(--color-rule)] text-[12px] text-[var(--color-muted)] mb-6 leading-relaxed">
        <strong>Tip:</strong> If you prefer not to install the extension, you can download the <strong>Desktop App</strong> from the download page, which handles all background polling and native session cookies automatically!
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="px-5 py-2 bg-[var(--color-ink)] text-[var(--color-paper)] font-[600] text-[13px] border-[1.5px] border-[var(--color-ink)] cursor-pointer"
          style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}
