"use client";

import { useRef, useEffect } from "react";

interface SettingsDialogProps {
  onClose: () => void;
}

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="bg-[var(--color-paper)] text-[var(--color-ink)] w-[min(560px,92vw)] p-[30px]"
      style={{
        border: "2px solid var(--color-ink)",
        borderRadius: 0,
        boxShadow: "12px 12px 0 rgba(0,0,0,0.15)",
      }}
      onClose={onClose}
    >
      <form method="dialog">
        <h2 className="text-[var(--color-ink)] font-bold m-0 mb-3 uppercase text-[15px] tracking-[0.5px]">Settings</h2>

        <label className="block mt-[14px] mb-[6px] font-medium text-[15px]">
          Pull interval (minutes)
        </label>
        <input
          type="number"
          min="5"
          max="720"
          defaultValue={20}
          className="w-full py-[8px] px-[12px] text-[15px] bg-[var(--color-paper)] text-[var(--color-ink)] transition-all duration-200 focus:outline-none"
          style={{
            border: "1.5px solid var(--color-rule)",
            borderRadius: 0,
            font: "inherit",
          }}
        />

        <label className="block mt-[14px] mb-[6px] font-medium text-[15px]">
          Google Tasks lead days
          <small className="block text-[var(--color-muted)] font-normal leading-[1.4] mt-[2px]">
            Show Google tasks this many days before the deadline.
          </small>
        </label>
        <input
          type="number"
          min="0"
          max="30"
          defaultValue={3}
          className="w-full py-[8px] px-[12px] text-[15px] bg-[var(--color-paper)] text-[var(--color-ink)] transition-all duration-200 focus:outline-none"
          style={{
            border: "1.5px solid var(--color-rule)",
            borderRadius: 0,
            font: "inherit",
          }}
        />

        <div className="flex gap-[10px] justify-end mt-[20px]">
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onClose();
            }}
            className="text-[var(--color-ink)] bg-transparent py-[6px] px-[14px] cursor-pointer text-[15px] font-[inherit] transition-all duration-200 hover:bg-[var(--color-wash)]"
            style={{
              border: "1.5px solid var(--color-rule)",
              borderRadius: 0,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="text-[var(--color-paper)] bg-[var(--color-ink)] py-[6px] px-[14px] cursor-pointer text-[15px] font-[inherit] transition-all duration-200 hover:translate-x-[-1px] hover:translate-y-[-1px]"
            style={{
              border: "1.5px solid var(--color-ink)",
              borderRadius: 0,
              boxShadow: "2px 2px 0 rgba(0,0,0,0.1)",
            }}
          >
            Save changes
          </button>
        </div>

        <div className="mt-[24px] pt-[14px] border-t border-[var(--color-rule)] text-[12px] text-[var(--color-muted)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
          <span>UIUC Collective Mind</span>
          <span>
            Original local version by{" "}
            <a
              href="https://github.com/axion66/uiuc_collective_mind"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-ink)] underline font-medium hover:text-[var(--color-accent)]"
            >
              axion66
            </a>
          </span>
        </div>
      </form>
    </dialog>
  );
}
