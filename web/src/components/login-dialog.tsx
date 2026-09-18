"use client";

import { useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { IconUser, IconX } from "@/components/icons";

interface LoginDialogProps {
  onClose: () => void;
  onSelectGuest?: () => void;
}

export default function LoginDialog({ onClose, onSelectGuest }: LoginDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { signInWithGoogle, signInWithGoogleRedirect, loginAsGuest, error, clearError } = useAuth();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleGuest = () => {
    loginAsGuest();
    dialogRef.current?.close();
    onClose();
    if (onSelectGuest) onSelectGuest();
  };

  return (
    <dialog
      ref={dialogRef}
      className="bg-[var(--color-paper)] text-[var(--color-ink)] w-[min(460px,94vw)] p-7 rounded-none z-50 backdrop:bg-black/40"
      style={{
        border: "1px solid var(--color-ink)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
      }}
      onClose={onClose}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b-[1.5px] border-[var(--color-rule)] mb-5">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0">
            <rect width="32" height="32" fill="var(--color-ink)" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="var(--color-paper)" strokeWidth="3" />
          </svg>
          <div>
            <h2 className="text-[18px] font-[800] tracking-tight m-0">Sign In</h2>
            <p className="text-[12px] text-[var(--color-muted)] m-0">UIUC Collective Mind</p>
          </div>
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

      <p className="text-[14px] text-[var(--color-muted)] mb-5 leading-relaxed">
        Sign in to synchronize your assignments and custom courses across devices. Use your <strong>@illinois.edu</strong> or personal Google account.
      </p>

      {error && (
        <div className="mb-5 p-3.5 border border-[var(--color-red)] bg-[rgba(239,68,68,0.08)] text-[13px] text-[var(--color-ink)] leading-relaxed">
          <div className="font-[700] text-[var(--color-red)] mb-1 flex items-center justify-between">
            <span>Sign-in Notice</span>
            <button
              onClick={clearError}
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer p-0.5"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>{error}</div>
          <div className="mt-2.5 pt-2 border-t border-[rgba(239,68,68,0.2)]">
            <button
              onClick={signInWithGoogleRedirect}
              className="underline font-[600] text-[var(--color-ink)] hover:text-black cursor-pointer bg-transparent border-0 p-0 text-[12px]"
            >
              Try Redirect Sign-In instead →
            </button>
          </div>
        </div>
      )}

      {/* Primary Google Sign In Button */}
      <button
        onClick={signInWithGoogle}
        className="w-full flex items-center justify-center gap-3 text-[var(--color-paper)] bg-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] py-3 px-5 text-[15px] font-[600] cursor-pointer transition-all duration-150 hover:translate-x-[-1px] hover:translate-y-[-1px]"
        style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        <span>Sign in with Google</span>
      </button>

      {/* Alternative options */}
      <div className="mt-3 text-center">
        <button
          onClick={signInWithGoogleRedirect}
          className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-ink)] underline cursor-pointer bg-transparent border-0"
        >
          Trouble with popups? Use redirect sign-in
        </button>
      </div>

      <div className="relative flex py-4 items-center">
        <div className="flex-grow border-t border-[var(--color-rule)]"></div>
        <span className="flex-shrink mx-3 text-[11px] text-[var(--color-muted)] uppercase tracking-wider font-semibold">
          or
        </span>
        <div className="flex-grow border-t border-[var(--color-rule)]"></div>
      </div>

      {/* Guest Mode CTA inside dialog */}
      <button
        onClick={handleGuest}
        className="w-full py-2.5 px-4 text-[13px] font-[500] text-[var(--color-ink)] bg-[var(--color-wash)] border border-[var(--color-rule)] hover:border-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors cursor-pointer flex items-center justify-center gap-2"
      >
        <IconUser className="w-4 h-4 text-[var(--color-muted)]" />
        <span>Explore as Guest</span>
      </button>

      <p className="text-[11px] text-[var(--color-muted)] mt-4 text-center">
        Zero passwords stored · Powered by Firebase Authentication &amp; PostgreSQL
      </p>
    </dialog>
  );
}
