"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import LoginDialog from "@/components/login-dialog";

export default function LandingPage() {
  const { loginAsGuest } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [activePreviewFilter, setActivePreviewFilter] = useState("all");

  const sampleAssignments = [
    {
      id: "1",
      course: "CS 173",
      title: "Homework 4: Inductive Proofs & Graph Coloring",
      due: "Today · 11:59 PM",
      status: "open",
      source: "PrairieLearn",
      link: "https://us.prairielearn.com",
    },
    {
      id: "2",
      course: "PHYS 211",
      title: "Prelecture 6: Rotational Dynamics & Torque",
      due: "Today · 8:00 AM",
      status: "graded",
      grade: "100%",
      source: "SmartPhysics",
      link: "https://smartphysics.com",
    },
    {
      id: "3",
      course: "CS 128",
      title: "Machine Problem 2: Circular Doubly-Linked Lists",
      due: "Tomorrow · 11:59 PM",
      status: "open",
      source: "cs128.org",
      link: "https://cs128.org",
    },
    {
      id: "4",
      course: "PrairieTest",
      title: "[Test] Quiz 2: Trees, Graphs, and Asymptotics",
      due: "Thursday · 3:00 PM",
      status: "open",
      details: "50 min · Grainger Library 057 CBTF",
      source: "PrairieTest",
      link: "https://prairietest.com",
    },
    {
      id: "5",
      course: "MATH 241",
      title: "Written Homework 3: Vector Calculus",
      due: "Friday · 5:00 PM",
      status: "submitted",
      grade: "Pending",
      source: "Canvas",
      link: "https://canvas.illinois.edu",
    },
  ];

  const filteredAssignments =
    activePreviewFilter === "all"
      ? sampleAssignments
      : sampleAssignments.filter((a) => a.course === activePreviewFilter);

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col selection:bg-[var(--color-ink)] selection:text-[var(--color-paper)]">
      {/* Navigation Bar */}
      <nav
        className="flex items-center justify-between px-6 py-4 border-b-[1.5px] border-[var(--color-ink)] bg-[rgba(255,255,255,0.96)] sticky top-0 z-40"
        style={{ backdropFilter: "blur(6px)" }}
      >
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="w-6 h-6">
            <rect width="32" height="32" fill="var(--color-ink)" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="var(--color-paper)" strokeWidth="3" />
          </svg>
          <span className="font-[800] text-[18px] tracking-tight">UIUC Collective Mind</span>
          <span className="text-[11px] font-[600] uppercase tracking-wider bg-[var(--color-wash)] border border-[var(--color-rule)] px-2 py-0.5 ml-1 hidden sm:inline-block">
            Web &amp; Desktop
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <a
            href="#features"
            className="text-[14px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden md:inline-block"
          >
            Features
          </a>
          <a
            href="#comparison"
            className="text-[14px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden md:inline-block"
          >
            Web vs Desktop
          </a>
          <Link
            href="/download"
            className="text-[14px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden sm:inline-block"
          >
            Downloads
          </Link>
          <a
            href="https://github.com/SteveWong-a/uiuc-collective-mind-web"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden sm:inline-block"
          >
            GitHub
          </a>

          {/* Guest Mode CTA in Navbar */}
          <button
            onClick={loginAsGuest}
            className="text-[13px] font-[600] text-[var(--color-ink)] bg-[var(--color-wash)] border-[1.5px] border-[var(--color-rule)] hover:border-[var(--color-ink)] py-[5px] px-[12px] cursor-pointer transition-all"
            title="Preview the dashboard with sample coursework"
          >
            Try Demo as Guest
          </button>

          {/* Sign In CTA */}
          <button
            onClick={() => setLoginOpen(true)}
            className="text-[13px] font-[600] text-[var(--color-paper)] bg-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] py-[5px] px-[14px] cursor-pointer transition-all hover:translate-x-[-1px] hover:translate-y-[-1px]"
            style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.15)" }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--color-wash)] border border-[var(--color-rule)] text-[12px] font-[600] uppercase tracking-wider mb-6">
          <span>Spring 2026</span>
          <span>·</span>
          <span>Unified UIUC Deadline Dashboard</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-[800] tracking-tight leading-[1.08] mb-6 max-w-4xl mx-auto">
          One page for every homework this semester.
        </h1>

        <p className="text-[18px] sm:text-[20px] text-[var(--color-muted)] max-w-2xl mx-auto leading-relaxed mb-8">
          Canvas, PrairieLearn, SmartPhysics, cs128.org, and PrairieTest CBTF exams — unified into one clean deadline view, with automatic Google Calendar evening study blocks.
        </p>

        {/* Primary Hero Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-6">
          <button
            onClick={loginAsGuest}
            className="w-full sm:w-auto px-6 py-3.5 bg-[var(--color-ink)] text-[var(--color-paper)] border-[2px] border-[var(--color-ink)] text-[15px] font-[600] cursor-pointer transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] flex items-center justify-center gap-2"
            style={{ boxShadow: "4px 4px 0 rgba(0,0,0,0.2)" }}
          >
            <span>👤 Try Demo as Guest (No Login Required)</span>
          </button>

          <button
            onClick={() => setLoginOpen(true)}
            className="w-full sm:w-auto px-6 py-3.5 bg-[var(--color-wash)] text-[var(--color-ink)] border-[2px] border-[var(--color-ink)] text-[15px] font-[600] cursor-pointer transition-all hover:bg-[var(--color-paper)] hover:translate-x-[-1px] hover:translate-y-[-1px] flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Sign in with Google / Illinois</span>
          </button>

          <Link
            href="/download"
            className="w-full sm:w-auto px-5 py-3.5 bg-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)] text-[14px] font-[600] text-center transition-colors underline"
          >
            Download Desktop App (.dmg / .exe) →
          </Link>
        </div>

        <p className="text-[12px] text-[var(--color-muted)]">
          100% Free &amp; Open Source · Zero passwords stored · Built for University of Illinois students
        </p>
      </header>

      {/* Interactive Live Preview Component */}
      <section className="max-w-5xl mx-auto px-6 pb-16 w-full">
        <div
          className="border-[2px] border-[var(--color-ink)] bg-[var(--color-paper)] p-5 sm:p-7"
          style={{ boxShadow: "8px 8px 0 rgba(0,0,0,0.15)" }}
        >
          {/* Mock Dashboard Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-[1.5px] border-[var(--color-ink)] mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-green)] inline-block"></span>
                <span className="text-[11px] font-[700] uppercase tracking-wider text-[var(--color-green)]">
                  Live Dashboard Preview
                </span>
              </div>
              <h2 className="text-2xl font-[800] tracking-tight m-0 mt-0.5">Upcoming Coursework</h2>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {["all", "CS 173", "CS 128", "PHYS 211", "PrairieTest"].map((f) => (
                <button
                  key={f}
                  onClick={() => setActivePreviewFilter(f)}
                  className={`text-[12px] px-2.5 py-1 font-[600] border border-[var(--color-rule)] cursor-pointer transition-all ${
                    activePreviewFilter === f
                      ? "bg-[var(--color-ink)] text-[var(--color-paper)] border-[var(--color-ink)]"
                      : "bg-[var(--color-wash)] text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
                  }`}
                >
                  {f === "all" ? "All Courses" : f}
                </button>
              ))}
            </div>
          </div>

          {/* Mock Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Assignment Timeline */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              {filteredAssignments.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 border border-[var(--color-rule)] bg-[var(--color-paper)] hover:border-[var(--color-ink)] transition-all flex items-start justify-between gap-3"
                  style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.05)" }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`text-[16px] font-[800] mt-0.5 ${
                        item.status === "graded"
                          ? "text-[var(--color-green)]"
                          : item.status === "submitted"
                          ? "text-[var(--color-muted)]"
                          : "text-[var(--color-ink)]"
                      }`}
                    >
                      {item.status === "graded" || item.status === "submitted" ? "✓" : "○"}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-[800] text-[14px] uppercase">{item.course}</span>
                        <span className="text-[14px]">{item.title}</span>
                      </div>
                      <div className="text-[12px] text-[var(--color-muted)] mt-1 flex items-center gap-2">
                        <span>{item.due}</span>
                        {item.details && (
                          <span className="font-semibold text-[var(--color-ink)] bg-[var(--color-wash)] px-1.5 py-0.5 border border-[var(--color-rule)]">
                            {item.details}
                          </span>
                        )}
                        {item.grade && (
                          <span className="font-bold text-[var(--color-green)] bg-[#f0fdf4] px-1.5 py-0.5 border border-[var(--color-green)]">
                            {item.grade}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-[600] uppercase text-[var(--color-muted)] bg-[var(--color-wash)] px-2 py-0.5 shrink-0">
                    {item.source}
                  </span>
                </div>
              ))}

              <div className="pt-3 text-center">
                <button
                  onClick={loginAsGuest}
                  className="text-[13px] text-[var(--color-ink)] font-[600] underline hover:text-[var(--color-accent)] cursor-pointer bg-transparent border-0"
                >
                  Click here to interact with all courses in Guest Demo Mode →
                </button>
              </div>
            </div>

            {/* Sidebar Mock: Sources & Google Sync */}
            <div className="flex flex-col gap-4 text-[13px]">
              {/* CBTF Box */}
              <div className="border border-[var(--color-rule)] p-4 bg-[var(--color-wash)]">
                <div className="font-[800] text-[12px] uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>CBTF Exam Reservations</span>
                  <span className="text-[var(--color-green)]">1 Confirmed</span>
                </div>
                <div className="text-[12px] text-[var(--color-ink)] font-[600]">
                  CS 128 Quiz 2 · 50 min
                </div>
                <div className="text-[12px] text-[var(--color-muted)]">
                  Thursday 3:00 PM · Grainger 057
                </div>
              </div>

              {/* Google Tasks / Calendar Box */}
              <div className="border border-[var(--color-rule)] p-4 bg-[var(--color-paper)]">
                <div className="font-[800] text-[12px] uppercase tracking-wider mb-2">
                  Google Calendar Evening Blocks
                </div>
                <div className="text-[12px] text-[var(--color-muted)] leading-relaxed">
                  Automatically schedules <strong>8:00 PM – 11:00 PM</strong> study blocks on your calendar for items due within 24 hours.
                </div>
              </div>

              {/* Active Sources Status */}
              <div className="border border-[var(--color-rule)] p-4 bg-[var(--color-paper)]">
                <div className="font-[800] text-[12px] uppercase tracking-wider mb-3">
                  Connected Portals
                </div>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span>Canvas (LMS)</span>
                    <span className="text-[var(--color-green)] font-bold">● Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>PrairieLearn</span>
                    <span className="text-[var(--color-green)] font-bold">● Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>SmartPhysics</span>
                    <span className="text-[var(--color-green)] font-bold">● Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>CS 128 Gradebook</span>
                    <span className="text-[var(--color-green)] font-bold">● Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>PrairieTest (CBTF)</span>
                    <span className="text-[var(--color-green)] font-bold">● Active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Deep Dive */}
      <section id="features" className="border-t border-[var(--color-rule)] py-16 bg-[var(--color-wash)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-[800] tracking-tight mb-3">
              Built for how UIUC classes actually work.
            </h2>
            <p className="text-[16px] text-[var(--color-muted)] leading-relaxed">
              Engineered specifically for engineering, CS, physics, and LAS courses at Urbana-Champaign.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[var(--color-paper)] border-[1.5px] border-[var(--color-ink)] p-6" style={{ boxShadow: "4px 4px 0 rgba(0,0,0,0.1)" }}>
              <div className="text-[24px] mb-2">🎯</div>
              <h3 className="text-[18px] font-[800] tracking-tight mb-2">Every Course Portal in One View</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">
                No more opening 5 different tabs just to remember what is due tonight. Aggregates Canvas, PrairieLearn, SmartPhysics, and cs128.org automatically into a single chronological timeline.
              </p>
            </div>

            <div className="bg-[var(--color-paper)] border-[1.5px] border-[var(--color-ink)] p-6" style={{ boxShadow: "4px 4px 0 rgba(0,0,0,0.1)" }}>
              <div className="text-[24px] mb-2">⏱️</div>
              <h3 className="text-[18px] font-[800] tracking-tight mb-2">CBTF PrairieTest Exam Tracking</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">
                Never miss an exam window or forget your testing room. Displays confirmed reservations marked <strong>[Test]</strong> with exam duration and room (Grainger 057, DCL L416), plus notices when open reservation windows appear.
              </p>
            </div>

            <div className="bg-[var(--color-paper)] border-[1.5px] border-[var(--color-ink)] p-6" style={{ boxShadow: "4px 4px 0 rgba(0,0,0,0.1)" }}>
              <div className="text-[24px] mb-2">📅</div>
              <h3 className="text-[18px] font-[800] tracking-tight mb-2">Automatic Google Calendar Study Blocks</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">
                Books an 8–11 PM evening study block on your personal Google Calendar for whatever is due within 24 hours, and mirrors outstanding assignments into your Google Tasks layer.
              </p>
            </div>

            <div className="bg-[var(--color-paper)] border-[1.5px] border-[var(--color-ink)] p-6" style={{ boxShadow: "4px 4px 0 rgba(0,0,0,0.1)" }}>
              <div className="text-[24px] mb-2">🔒</div>
              <h3 className="text-[18px] font-[800] tracking-tight mb-2">Zero-Knowledge / 100% Private (BYOS)</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">
                We never ask for or store your Illinois NetID passwords. Uses Bring Your Own Session (BYOS) where authentication stays strictly in your browser or local machine.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Web vs Desktop Capability Comparison */}
      <section id="comparison" className="py-16 border-t border-[var(--color-rule)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--color-wash)] border border-[var(--color-rule)] text-[12px] font-[600] uppercase tracking-wider mb-3">
              Architectural Breakdown
            </div>
            <h2 className="text-3xl font-[800] tracking-tight mb-3">
              Web Application vs. Desktop App
            </h2>
            <p className="text-[16px] text-[var(--color-muted)] leading-relaxed">
              Choose the version that best fits your daily study setup, or use both interchangeably.
            </p>
          </div>

          <div className="overflow-x-auto border-[2px] border-[var(--color-ink)] bg-[var(--color-paper)]" style={{ boxShadow: "6px 6px 0 rgba(0,0,0,0.12)" }}>
            <table className="w-full text-left text-[14px] border-collapse">
              <thead>
                <tr className="bg-[var(--color-ink)] text-[var(--color-paper)]">
                  <th className="p-4 font-[700] w-1/3">Capability / Feature</th>
                  <th className="p-4 font-[700] w-1/3 border-l border-white/20">
                    Web Application
                    <div className="text-[12px] font-normal text-white/70">uiuc-collective-mind-web.vercel.app</div>
                  </th>
                  <th className="p-4 font-[700] w-1/3 border-l border-white/20">
                    Desktop Application
                    <div className="text-[12px] font-normal text-white/70">macOS DMG &amp; Windows EXE</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]">
                <tr>
                  <td className="p-4">
                    <strong>Accessibility &amp; Platform</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Where can you open and use it?</div>
                  </td>
                  <td className="p-4">Any browser, phone, iPad, or laptop immediately</td>
                  <td className="p-4 font-[600]">Dedicated macOS &amp; Windows desktop app</td>
                </tr>

                <tr>
                  <td className="p-4">
                    <strong>Testing &amp; Guest Mode</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Try without setup or credentials</div>
                  </td>
                  <td className="p-4 text-[var(--color-green)] font-[700]">✓ Instant Guest Demo Mode (1 click)</td>
                  <td className="p-4 text-[var(--color-muted)]">Requires downloading installer</td>
                </tr>

                <tr>
                  <td className="p-4">
                    <strong>Background Polling</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Automatic updates without clicking</div>
                  </td>
                  <td className="p-4">1-click sync via Chrome Extension or API token</td>
                  <td className="p-4 text-[var(--color-green)] font-[700]">✓ 24/7 background polling every 20-30 min</td>
                </tr>

                <tr>
                  <td className="p-4">
                    <strong>Menu Bar / Notification Tray</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Quick glance status icon</div>
                  </td>
                  <td className="p-4 text-[var(--color-muted)]">—</td>
                  <td className="p-4 text-[var(--color-green)] font-[700]">✓ Native Menu Bar / System Tray with &quot;Pull Now&quot;</td>
                </tr>

                <tr>
                  <td className="p-4">
                    <strong>Google Calendar 8–11 PM Blocks</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Automatic evening study reservations</div>
                  </td>
                  <td className="p-4">Coming via cloud worker integration</td>
                  <td className="p-4 text-[var(--color-green)] font-[700]">✓ Native loopback OAuth &amp; auto-diff scheduler</td>
                </tr>

                <tr>
                  <td className="p-4">
                    <strong>CBTF PrairieTest Tracking</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Room &amp; length breakdown</div>
                  </td>
                  <td className="p-4 font-[700] text-[var(--color-green)]">✓ Yes (all reservation alerts)</td>
                  <td className="p-4 font-[700] text-[var(--color-green)]">✓ Yes (all reservation alerts)</td>
                </tr>

                <tr>
                  <td className="p-4">
                    <strong>Security &amp; Data Storage</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Where your session data lives</div>
                  </td>
                  <td className="p-4">Firebase PostgreSQL with Row-Level Security</td>
                  <td className="p-4 font-[700] text-[var(--color-green)]">100% on your disk with 0600 file permissions</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={loginAsGuest}
              className="px-6 py-3 bg-[var(--color-ink)] text-[var(--color-paper)] font-[600] text-[14px] cursor-pointer hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
              style={{ boxShadow: "3px 3px 0 rgba(0,0,0,0.15)" }}
            >
              Test Drive Web Dashboard as Guest →
            </button>
            <Link
              href="/download"
              className="px-6 py-3 bg-[var(--color-wash)] text-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] font-[600] text-[14px] hover:bg-[var(--color-paper)] transition-all"
            >
              Download Desktop App for Mac/Win →
            </Link>
          </div>
        </div>
      </section>

      {/* Guest Mode Invitation Banner */}
      <section className="bg-[var(--color-paper)] border-t border-[var(--color-rule)] py-14">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="p-8 sm:p-10 border-[2px] border-[var(--color-ink)] bg-[var(--color-wash)]" style={{ boxShadow: "6px 6px 0 rgba(0,0,0,0.1)" }}>
            <h2 className="text-2xl sm:text-3xl font-[800] tracking-tight mb-3">
              Want to see it in action before connecting anything?
            </h2>
            <p className="text-[15px] text-[var(--color-muted)] max-w-xl mx-auto leading-relaxed mb-6">
              Launch Guest Demo Mode to explore the full dashboard populated with real UIUC assignments, CBTF reservations, and interactive course filters.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={loginAsGuest}
                className="w-full sm:w-auto px-7 py-3.5 bg-[var(--color-ink)] text-[var(--color-paper)] text-[15px] font-[600] cursor-pointer hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
                style={{ boxShadow: "3px 3px 0 rgba(0,0,0,0.15)" }}
              >
                Launch Guest Demo Mode 🚀
              </button>
              <button
                onClick={() => setLoginOpen(true)}
                className="w-full sm:w-auto px-6 py-3.5 bg-[var(--color-paper)] text-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] text-[15px] font-[600] cursor-pointer hover:bg-[var(--color-wash)] transition-all"
              >
                Sign In with Illinois Account
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-rule)] py-10 bg-[var(--color-paper)] text-center text-[13px] text-[var(--color-muted)] mt-auto">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span>UIUC Collective Mind · Built for the University of Illinois community</span>
            <div className="mt-1">
              Based on the original local version by{" "}
              <a
                href="https://github.com/axion66/uiuc_collective_mind"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-ink)] underline font-medium"
              >
                axion66
              </a>
              {" "}· Web &amp; Desktop by{" "}
              <a
                href="https://github.com/SteveWong-a/uiuc-collective-mind-web"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-ink)] underline font-medium"
              >
                Steve Wong
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/download" className="hover:text-[var(--color-ink)] underline">
              Desktop &amp; Extension
            </Link>
            <span>·</span>
            <a
              href="https://github.com/SteveWong-a/uiuc-collective-mind-web"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-ink)] underline"
            >
              GitHub Repo
            </a>
          </div>
        </div>
      </footer>

      {/* Sign In Dialog */}
      {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
