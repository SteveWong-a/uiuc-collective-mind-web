"use client";

import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { signInWithGoogle, signInWithGoogleRedirect, error, clearError } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-paper)] px-6">
      <div
        className="w-full max-w-md border-[2px] border-[var(--color-ink)] p-10"
        style={{ boxShadow: "8px 8px 0 rgba(0,0,0,0.1)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-2">
          <svg viewBox="0 0 32 32" className="w-8 h-8">
            <rect width="32" height="32" fill="var(--color-ink)" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="var(--color-paper)" strokeWidth="3" />
          </svg>
          <h1 className="text-[22px] font-[800] tracking-tight m-0">UIUC Collective Mind</h1>
        </div>

        <p className="text-[var(--color-muted)] text-[15px] mb-6 mt-3 leading-relaxed">
          Track your assignments, grades, and deadlines across Canvas, PrairieLearn, SmartPhysics, and more — all in one
          place.
        </p>

        {error && (
          <div className="mb-6 p-4 border border-[var(--color-red)] bg-[rgba(239,68,68,0.08)] text-[13px] text-[var(--color-ink)] rounded leading-relaxed">
            <div className="font-[700] text-[var(--color-red)] mb-1 flex items-center justify-between">
              <span>Sign-in Error</span>
              <button
                onClick={clearError}
                className="text-[var(--color-muted)] hover:text-[var(--color-ink)] text-[14px] cursor-pointer"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
            <div>{error}</div>
            <div className="mt-3 pt-2 border-t border-[rgba(239,68,68,0.2)]">
              <button
                onClick={signInWithGoogleRedirect}
                className="underline font-[600] text-[var(--color-ink)] hover:text-black cursor-pointer"
              >
                Try Redirect Sign-In instead →
              </button>
            </div>
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 text-[var(--color-paper)] bg-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] py-3 px-5 text-[15px] font-[500] cursor-pointer transition-all duration-200 hover:translate-x-[-1px] hover:translate-y-[-1px]"
          style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "4px 4px 0 rgba(0,0,0,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "2px 2px 0 rgba(0,0,0,0.1)")}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#fff"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#fff"
              opacity="0.8"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#fff"
              opacity="0.6"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#fff"
              opacity="0.9"
            />
          </svg>
          Sign in with Google
        </button>

        <div className="mt-3 text-center">
          <button
            onClick={signInWithGoogleRedirect}
            className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-ink)] underline cursor-pointer bg-transparent border-0"
          >
            Trouble with popups? Use redirect sign-in
          </button>
        </div>

        <p className="text-[12px] text-[var(--color-muted)] mt-5 text-center leading-relaxed">
          Use your <strong>@illinois.edu</strong> or personal Google account.
          <br />
          Your data stays private and encrypted.
        </p>

        <div className="mt-6 pt-6 border-t border-[var(--color-rule)] flex flex-col items-center gap-2 text-center">
          <span className="text-[13px] text-[var(--color-muted)]">
            Want automated background sync & Google Calendar blocks?
          </span>
          <a
            href="/download"
            className="inline-flex items-center gap-1.5 text-[13px] font-[600] text-[var(--color-ink)] hover:underline"
          >
            Download Desktop App (macOS & Windows) →
          </a>
        </div>
      </div>

      <p className="text-[12px] text-[var(--color-muted)] mt-8">
        Built for UIUC students · Open source
      </p>
    </div>
  );
}
