"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import LoginDialog from "@/components/login-dialog";
import {
  IconGrid,
  IconClock,
  IconCalendar,
  IconShield,
  IconUser,
  IconArrowRight,
  IconDownload,
  IconCheck,
} from "@/components/icons";

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
      {/* Top Header / Navigation Bar */}
      <nav
        className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--color-rule)] bg-[rgba(255,255,255,0.96)] sticky top-0 z-40"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="w-6 h-6">
            <rect width="32" height="32" fill="var(--color-ink)" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="var(--color-paper)" strokeWidth="3" />
          </svg>
          <span className="font-[700] text-[17px] tracking-tight">UIUC Collective Mind</span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)] bg-[var(--color-wash)] border border-[var(--color-rule)] px-2 py-0.5 ml-1 hidden sm:inline-block">
            v0.1.0
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-[14px]">
          <a
            href="#features"
            className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden md:inline-block"
          >
            Features
          </a>
          <a
            href="#comparison"
            className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden md:inline-block"
          >
            Capabilities
          </a>
          <Link
            href="/download"
            className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden sm:inline-block"
          >
            Downloads
          </Link>
          <a
            href="https://github.com/SteveWong-a/uiuc-collective-mind-web"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors hidden sm:inline-block"
          >
            GitHub
          </a>

          {/* Guest Demo Action */}
          <button
            onClick={loginAsGuest}
            className="text-[13px] font-[500] text-[var(--color-ink)] bg-[var(--color-wash)] border border-[var(--color-rule)] hover:border-[var(--color-ink)] py-1.5 px-3 cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <IconUser className="w-3.5 h-3.5 text-[var(--color-muted)]" />
            <span>Try Demo</span>
          </button>

          {/* Sign In CTA */}
          <button
            onClick={() => setLoginOpen(true)}
            className="text-[13px] font-[600] text-[var(--color-paper)] bg-[var(--color-ink)] border border-[var(--color-ink)] py-1.5 px-3.5 cursor-pointer transition-all hover:bg-neutral-800"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--color-wash)] border border-[var(--color-rule)] text-[12px] font-mono text-[var(--color-muted)] tracking-wider mb-6">
          <span>Spring 2026</span>
          <span>·</span>
          <span>Unified Course Timeline</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-[800] tracking-tight leading-[1.12] mb-5">
          One page for every homework this semester.
        </h1>

        <p className="text-[17px] sm:text-[18px] text-[var(--color-muted)] max-w-2xl mx-auto leading-relaxed mb-8">
          Canvas, PrairieLearn, SmartPhysics, cs128.org, and PrairieTest CBTF exams — unified into one live study dashboard, with automatic Google Calendar evening study blocks.
        </p>

        {/* Hero CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
          <button
            onClick={loginAsGuest}
            className="w-full sm:w-auto px-5 py-2.5 bg-[var(--color-ink)] text-[var(--color-paper)] border border-[var(--color-ink)] text-[14px] font-[600] cursor-pointer transition-all hover:bg-neutral-800 flex items-center justify-center gap-2"
          >
            <IconUser className="w-4 h-4" />
            <span>Explore Demo as Guest</span>
          </button>

          <button
            onClick={() => setLoginOpen(true)}
            className="w-full sm:w-auto px-5 py-2.5 bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-rule)] text-[14px] font-[500] cursor-pointer transition-all hover:border-[var(--color-ink)] hover:bg-[var(--color-wash)] flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Sign in with Google</span>
          </button>

          <Link
            href="/download"
            className="w-full sm:w-auto px-4 py-2.5 text-[var(--color-muted)] hover:text-[var(--color-ink)] text-[14px] font-[500] text-center transition-colors flex items-center justify-center gap-1.5"
          >
            <IconDownload className="w-4 h-4" />
            <span>Download Desktop App</span>
          </Link>
        </div>

        <p className="text-[12px] text-[var(--color-muted)]">
          Free and open source · Zero passwords stored · Built for UIUC students
        </p>
      </header>

      {/* Live Interactive Dashboard Preview */}
      <section className="max-w-4xl mx-auto px-6 pb-16 w-full">
        <div
          className="border border-[var(--color-ink)] bg-[var(--color-paper)]"
          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}
        >
          {/* Mock Browser/Dashboard Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-[var(--color-rule)] bg-[var(--color-wash)]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-green)] inline-block"></span>
              <span className="text-[12px] font-mono font-[600] uppercase tracking-wider text-[var(--color-muted)]">
                Interactive Preview
              </span>
            </div>

            {/* Course Filter Tabs */}
            <div className="flex items-center gap-1 flex-wrap">
              {["all", "CS 173", "CS 128", "PHYS 211", "PrairieTest"].map((f) => (
                <button
                  key={f}
                  onClick={() => setActivePreviewFilter(f)}
                  className={`text-[12px] px-2.5 py-1 font-medium border transition-colors cursor-pointer ${
                    activePreviewFilter === f
                      ? "bg-[var(--color-ink)] text-[var(--color-paper)] border-[var(--color-ink)]"
                      : "bg-[var(--color-paper)] text-[var(--color-muted)] border-[var(--color-rule)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  {f === "all" ? "All Courses" : f}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[var(--color-rule)]">
            {/* Timeline Column */}
            <div className="lg:col-span-2 p-5 flex flex-col gap-2.5">
              <div className="text-[11px] font-mono text-[var(--color-muted)] uppercase tracking-wider pb-1">
                Coming Up
              </div>

              {filteredAssignments.map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 px-3 border border-[var(--color-rule)] bg-[var(--color-paper)] hover:border-[var(--color-ink)] transition-colors flex items-start justify-between gap-3 text-[14px]"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`text-[15px] font-[700] leading-none mt-0.5 ${
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-[700] text-[13px]">{item.course}</span>
                        <span className="text-[13px] text-[var(--color-ink)]">{item.title}</span>
                      </div>
                      <div className="text-[12px] text-[var(--color-muted)] mt-0.5 flex items-center gap-2">
                        <span>{item.due}</span>
                        {item.details && (
                          <span className="text-[11px] font-mono text-[var(--color-ink)] bg-[var(--color-wash)] px-1.5 py-0.5 border border-[var(--color-rule)]">
                            {item.details}
                          </span>
                        )}
                        {item.grade && (
                          <span className="text-[11px] font-mono font-bold text-[var(--color-green)] bg-[#f0fdf4] px-1.5 py-0.5 border border-[var(--color-green)]">
                            {item.grade}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--color-muted)] bg-[var(--color-wash)] px-1.5 py-0.5 shrink-0 border border-[var(--color-rule)]">
                    {item.source}
                  </span>
                </div>
              ))}

              <div className="pt-2 text-center">
                <button
                  onClick={loginAsGuest}
                  className="text-[13px] text-[var(--color-ink)] font-[600] hover:underline cursor-pointer bg-transparent border-0 inline-flex items-center gap-1"
                >
                  <span>Launch full interactive dashboard as guest</span>
                  <IconArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Sidebar Column */}
            <div className="p-5 flex flex-col gap-4 text-[13px] bg-[var(--color-wash)]/40">
              {/* CBTF Exam Box */}
              <div className="border border-[var(--color-rule)] p-3.5 bg-[var(--color-paper)]">
                <div className="font-[700] text-[12px] uppercase tracking-wider mb-2 flex items-center justify-between text-[var(--color-muted)]">
                  <span>CBTF Reservations</span>
                  <span className="text-[var(--color-green)] font-mono text-[11px]">1 Scheduled</span>
                </div>
                <div className="text-[13px] font-[600] text-[var(--color-ink)]">
                  CS 128 Quiz 2 (50 min)
                </div>
                <div className="text-[12px] text-[var(--color-muted)] mt-0.5">
                  Thursday 3:00 PM · Grainger 057
                </div>
              </div>

              {/* Study Blocks Box */}
              <div className="border border-[var(--color-rule)] p-3.5 bg-[var(--color-paper)]">
                <div className="font-[700] text-[12px] uppercase tracking-wider mb-1.5 text-[var(--color-muted)]">
                  Calendar Blocks
                </div>
                <p className="text-[12px] text-[var(--color-muted)] m-0 leading-relaxed">
                  Schedules <strong>8:00 – 11:00 PM</strong> evening homework blocks on Google Calendar for items due within 24 hours.
                </p>
              </div>

              {/* Connected Sources List */}
              <div className="border border-[var(--color-rule)] p-3.5 bg-[var(--color-paper)]">
                <div className="font-[700] text-[12px] uppercase tracking-wider mb-2 text-[var(--color-muted)]">
                  Active Sources
                </div>
                <div className="space-y-1.5 text-[12px]">
                  {["Canvas", "PrairieLearn", "SmartPhysics", "CS 128", "PrairieTest"].map((src) => (
                    <div key={src} className="flex items-center justify-between">
                      <span>{src}</span>
                      <span className="flex items-center gap-1 text-[var(--color-green)] text-[11px] font-mono font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-green)]"></span>
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section id="features" className="border-t border-[var(--color-rule)] py-16 bg-[var(--color-wash)]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-10 text-center max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-[800] tracking-tight mb-2">
              Engineered for UIUC Coursework
            </h2>
            <p className="text-[15px] text-[var(--color-muted)] leading-relaxed m-0">
              Purpose-built to solve fragmented assignment portals across Urbana-Champaign.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Feature 1 */}
            <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] p-6">
              <div className="w-9 h-9 border border-[var(--color-rule)] bg-[var(--color-wash)] flex items-center justify-center text-[var(--color-ink)] mb-4">
                <IconGrid className="w-4 h-4" />
              </div>
              <h3 className="text-[16px] font-[700] tracking-tight mb-2">Unified Multi-Source Sync</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed m-0">
                Aggregates Canvas, PrairieLearn, SmartPhysics, and cs128.org into a chronological timeline without maintaining separate logins or tabs.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] p-6">
              <div className="w-9 h-9 border border-[var(--color-rule)] bg-[var(--color-wash)] flex items-center justify-center text-[var(--color-ink)] mb-4">
                <IconClock className="w-4 h-4" />
              </div>
              <h3 className="text-[16px] font-[700] tracking-tight mb-2">CBTF PrairieTest Exam Tracking</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed m-0">
                Displays CBTF exam reservations marked with <strong>[Test]</strong>, exam duration, and designated room numbers (Grainger 057, DCL L416).
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] p-6">
              <div className="w-9 h-9 border border-[var(--color-rule)] bg-[var(--color-wash)] flex items-center justify-center text-[var(--color-ink)] mb-4">
                <IconCalendar className="w-4 h-4" />
              </div>
              <h3 className="text-[16px] font-[700] tracking-tight mb-2">Google Calendar Study Blocks</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed m-0">
                Automatically reserves an 8–11 PM evening study session on your primary Google Calendar for items due within 24 hours.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] p-6">
              <div className="w-9 h-9 border border-[var(--color-rule)] bg-[var(--color-wash)] flex items-center justify-center text-[var(--color-ink)] mb-4">
                <IconShield className="w-4 h-4" />
              </div>
              <h3 className="text-[16px] font-[700] tracking-tight mb-2">Private &amp; BYOS Architecture</h3>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed m-0">
                Never requests or logs NetID passwords. Uses Bring Your Own Session (BYOS) where authentication remains strictly local or in standard OAuth flows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Web vs Desktop Capability Comparison */}
      <section id="comparison" className="py-16 border-t border-[var(--color-rule)]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-10 text-center max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-[800] tracking-tight mb-2">
              Capabilities Comparison
            </h2>
            <p className="text-[15px] text-[var(--color-muted)] leading-relaxed m-0">
              Web application and native desktop app feature comparison.
            </p>
          </div>

          <div className="overflow-x-auto border border-[var(--color-ink)] bg-[var(--color-paper)]">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="bg-[var(--color-wash)] border-b border-[var(--color-rule)] text-[var(--color-ink)]">
                  <th className="p-3.5 font-[700] w-1/3">Capability</th>
                  <th className="p-3.5 font-[700] w-1/3 border-l border-[var(--color-rule)]">
                    Web Application
                  </th>
                  <th className="p-3.5 font-[700] w-1/3 border-l border-[var(--color-rule)]">
                    Desktop Application
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]">
                <tr>
                  <td className="p-3.5 font-medium">Access &amp; Portability</td>
                  <td className="p-3.5">Any web browser on mobile, tablet, or desktop</td>
                  <td className="p-3.5 text-[var(--color-muted)]">Local installation on macOS / Windows</td>
                </tr>

                <tr>
                  <td className="p-3.5 font-medium">Guest Demo Mode</td>
                  <td className="p-3.5 text-[var(--color-green)] font-[600]">
                    <span className="flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5" />
                      1-Click Instant Preview
                    </span>
                  </td>
                  <td className="p-3.5 text-[var(--color-muted)]">Requires package download</td>
                </tr>

                <tr>
                  <td className="p-3.5 font-medium">Background Polling</td>
                  <td className="p-3.5">On-demand sync via Chrome Extension</td>
                  <td className="p-3.5 text-[var(--color-green)] font-[600]">
                    <span className="flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5" />
                      Automatic 30-min background daemon
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="p-3.5 font-medium">Menu Bar / System Tray</td>
                  <td className="p-3.5 text-[var(--color-muted)]">—</td>
                  <td className="p-3.5 text-[var(--color-green)] font-[600]">
                    <span className="flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5" />
                      Native Menu Bar / System Tray
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="p-3.5 font-medium">Calendar Evening Blocks</td>
                  <td className="p-3.5">Manual / extension synced</td>
                  <td className="p-3.5 text-[var(--color-green)] font-[600]">
                    <span className="flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5" />
                      Native loopback Google sync
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="p-3.5 font-medium">CBTF PrairieTest Tracking</td>
                  <td className="p-3.5 text-[var(--color-green)] font-[600]">
                    <span className="flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5" />
                      Supported
                    </span>
                  </td>
                  <td className="p-3.5 text-[var(--color-green)] font-[600]">
                    <span className="flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5" />
                      Supported
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="p-3.5 font-medium">Session Storage</td>
                  <td className="p-3.5">Cloud SQL with Row-Level Security</td>
                  <td className="p-3.5">Local disk with 0600 file permissions</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={loginAsGuest}
              className="px-5 py-2.5 bg-[var(--color-ink)] text-[var(--color-paper)] font-[600] text-[13px] cursor-pointer hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
            >
              <span>Test Drive Web Dashboard as Guest</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
            <Link
              href="/download"
              className="px-5 py-2.5 bg-[var(--color-wash)] text-[var(--color-ink)] border border-[var(--color-rule)] font-[500] text-[13px] hover:border-[var(--color-ink)] transition-colors flex items-center gap-1.5"
            >
              <IconDownload className="w-3.5 h-3.5" />
              <span>Download Desktop App</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-rule)] py-10 text-center text-[13px] text-[var(--color-muted)] mt-auto bg-[var(--color-paper)]">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <div>UIUC Collective Mind · Open Source Software</div>
            <div className="text-[12px] mt-0.5">
              Original local version created by{" "}
              <a
                href="https://github.com/axion66/uiuc_collective_mind"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-ink)] underline"
              >
                axion66
              </a>
              {" "}· Web &amp; Desktop maintained by{" "}
              <a
                href="https://github.com/SteveWong-a/uiuc-collective-mind-web"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-ink)] underline"
              >
                Steve Wong
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[13px]">
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
              GitHub
            </a>
          </div>
        </div>
      </footer>

      {/* Sign In Dialog */}
      {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
