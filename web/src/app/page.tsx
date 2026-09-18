"use client";

import { useAuth } from "@/lib/auth-context";
import LoginPage from "@/components/login-page";
import Dashboard from "@/components/dashboard";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-paper)]">
        <div className="text-[var(--color-muted)] text-lg">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <Dashboard />;
}
