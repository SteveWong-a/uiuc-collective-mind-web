"use client";

import { useAuth } from "@/lib/auth-context";
import LandingPage from "@/components/landing-page";
import Dashboard from "@/components/dashboard";

export default function Home() {
  const { user, isGuest, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-paper)]">
        <div className="text-[var(--color-muted)] text-lg font-medium">Loading UIUC Collective Mind…</div>
      </div>
    );
  }

  if (!user && !isGuest) {
    return <LandingPage />;
  }

  return <Dashboard />;
}
