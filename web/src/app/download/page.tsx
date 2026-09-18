"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const REPO_URL = "https://github.com/SteveWong-a/uiuc-collective-mind-web";
const MAC_DOWNLOAD_URL = `${REPO_URL}/releases/latest/download/UIUC.Collective.Mind-0.1.0-arm64.dmg`;
const WIN_DOWNLOAD_URL = `${REPO_URL}/releases/latest/download/UIUC.Collective.Mind.Setup.0.1.0.exe`;
const RELEASES_URL = `${REPO_URL}/releases`;

export default function DownloadPage() {
  const [platform, setPlatform] = useState<"mac" | "win" | "other">("other");
  const [activeTab, setActiveTab] = useState<"mac" | "win">("mac");

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent;
      if (/Macintosh|Mac OS X/i.test(ua)) {
        setPlatform("mac");
        setActiveTab("mac");
      } else if (/Windows/i.test(ua)) {
        setPlatform("win");
        setActiveTab("win");
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col">
      {/* Navigation Bar */}
      <nav
        className="flex items-center justify-between px-6 py-4 border-b-[1.5px] border-[var(--color-ink)] bg-[rgba(255,255,255,0.95)] sticky top-0 z-20"
        style={{ backdropFilter: "blur(4px)" }}
      >
        <Link href="/" className="flex items-center gap-2.5 no-underline text-inherit">
          <svg viewBox="0 0 32 32" className="w-6 h-6">
            <rect width="32" height="32" fill="var(--color-ink)" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="var(--color-paper)" strokeWidth="3" />
          </svg>
          <span className="font-[800] text-[18px] tracking-tight">UIUC Collective Mind</span>
        </Link>
        <div className="flex items-center gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            GitHub
          </a>
          <Link
            href="/"
            className="text-[14px] font-[500] text-[var(--color-paper)] bg-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] py-[5px] px-[12px] transition-all hover:translate-x-[-1px] hover:translate-y-[-1px]"
            style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}
          >
            Open Web App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12 w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--color-wash)] border border-[var(--color-rule)] text-[12px] font-[600] uppercase tracking-wider mb-4">
            <span>Beta v0.1.0</span>
            <span>·</span>
            <span>Desktop Release</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-[800] tracking-tight mb-4">
            Never miss a UIUC deadline.
          </h1>
          <p className="text-[17px] text-[var(--color-muted)] max-w-2xl mx-auto leading-relaxed">
            Automated background polling, Google Calendar study blocks, and instant menu bar / system tray status for Canvas, PrairieLearn, SmartPhysics, and CS 128.
          </p>

          {/* Primary Download CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* macOS Button */}
            <a
              href={MAC_DOWNLOAD_URL}
              className={`w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3.5 border-[2px] border-[var(--color-ink)] text-[15px] font-[600] transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] ${
                platform === "mac"
                  ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                  : "bg-[var(--color-wash)] text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
              }`}
              style={{ boxShadow: "4px 4px 0 rgba(0,0,0,0.15)" }}
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.85-.9.04-2.03.62-2.67 1.37-.56.65-1.06 1.71-.92 2.73 1.02.08 2.05-.51 2.67-1.25z" />
              </svg>
              <span>Download for macOS (.dmg)</span>
              {platform === "mac" && (
                <span className="text-[11px] bg-[rgba(255,255,255,0.2)] px-2 py-0.5 rounded font-normal">
                  Your OS
                </span>
              )}
            </a>

            {/* Windows Button */}
            <a
              href={WIN_DOWNLOAD_URL}
              className={`w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3.5 border-[2px] border-[var(--color-ink)] text-[15px] font-[600] transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] ${
                platform === "win"
                  ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                  : "bg-[var(--color-wash)] text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
              }`}
              style={{ boxShadow: "4px 4px 0 rgba(0,0,0,0.15)" }}
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
              </svg>
              <span>Download for Windows (.exe)</span>
              {platform === "win" && (
                <span className="text-[11px] bg-[rgba(0,0,0,0.1)] px-2 py-0.5 rounded font-normal">
                  Your OS
                </span>
              )}
            </a>
          </div>

          <p className="text-[13px] text-[var(--color-muted)] mt-3">
            macOS Apple Silicon (M1/M2/M3/M4) & Windows 10/11 (64-bit) ·{" "}
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--color-ink)]">
              View all versions on GitHub
            </a>
          </p>
        </div>

        {/* Chrome Extension Card for Web App Users */}
        <div
          className="border-[2px] border-[var(--color-ink)] p-6 sm:p-8 bg-[var(--color-paper)] mb-12"
          style={{ boxShadow: "6px 6px 0 rgba(0,0,0,0.1)" }}
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-[var(--color-rule)]">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-[var(--color-wash)] border border-[var(--color-rule)] text-[11px] font-[600] uppercase tracking-wider mb-2">
                Chrome Extension
              </div>
              <h2 className="text-2xl font-[800] tracking-tight m-0">
                Using the Web App? Install the Canvas Sync Extension
              </h2>
              <p className="text-[14px] text-[var(--color-muted)] mt-1.5 max-w-xl leading-relaxed">
                Browsers restrict web applications from reading cross-origin session cookies. Our lightweight Chrome Extension securely bridges your browser session with Canvas, PrairieLearn, and SmartPhysics so you can sync assignments in 1 click.
              </p>
            </div>
            <a
              href="/downloads/uiuc-collective-mind-extension.zip"
              download
              className="flex items-center gap-2.5 px-5 py-3 bg-[var(--color-ink)] text-[var(--color-paper)] text-[14px] font-[600] no-underline transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] shrink-0"
              style={{ boxShadow: "3px 3px 0 rgba(0,0,0,0.15)" }}
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M13 8V2H7v6H2l8 8 8-8h-5zM0 18h20v2H0v-2z" />
              </svg>
              <span>Download Extension (.zip)</span>
            </a>
          </div>

          <div className="mt-6">
            <h3 className="text-[15px] font-[700] mb-4">Step-by-Step Installation Guide (takes &lt; 1 minute):</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-[13px]">
              <div className="p-3.5 bg-[var(--color-wash)] border border-[var(--color-rule)]">
                <div className="font-[800] text-[15px] mb-1.5 text-[var(--color-ink)]">1. Download &amp; Unzip</div>
                <p className="text-[var(--color-muted)] m-0 leading-relaxed">
                  Click the button above to download <code>uiuc-collective-mind-extension.zip</code> and extract it into a folder.
                </p>
              </div>

              <div className="p-3.5 bg-[var(--color-wash)] border border-[var(--color-rule)]">
                <div className="font-[800] text-[15px] mb-1.5 text-[var(--color-ink)]">2. Open Extensions</div>
                <p className="text-[var(--color-muted)] m-0 leading-relaxed">
                  In Chrome, go to <code className="font-mono bg-[var(--color-paper)] px-1">chrome://extensions</code> in your address bar.
                </p>
              </div>

              <div className="p-3.5 bg-[var(--color-wash)] border border-[var(--color-rule)]">
                <div className="font-[800] text-[15px] mb-1.5 text-[var(--color-ink)]">3. Developer Mode</div>
                <p className="text-[var(--color-muted)] m-0 leading-relaxed">
                  Turn on the <strong>Developer mode</strong> toggle in the top-right corner of the Extensions page.
                </p>
              </div>

              <div className="p-3.5 bg-[var(--color-wash)] border border-[var(--color-rule)]">
                <div className="font-[800] text-[15px] mb-1.5 text-[var(--color-ink)]">4. Load Unpacked</div>
                <p className="text-[var(--color-muted)] m-0 leading-relaxed">
                  Click <strong>Load unpacked</strong> (top-left) and select the unzipped <code>extension</code> folder.
                </p>
              </div>

              <div className="p-3.5 bg-[var(--color-wash)] border border-[var(--color-rule)]">
                <div className="font-[800] text-[15px] mb-1.5 text-[var(--color-ink)]">5. Log in &amp; Sync</div>
                <p className="text-[var(--color-muted)] m-0 leading-relaxed">
                  Ensure you are logged into Canvas in Chrome, then return to the Dashboard and click <strong>Sync</strong>!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Security / Open Source Notice (Low Budget / Beta Explanation) */}
        <div
          className="border-[2px] border-[var(--color-ink)] p-6 sm:p-8 bg-[var(--color-wash)] mb-12"
          style={{ boxShadow: "6px 6px 0 rgba(0,0,0,0.1)" }}
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-[var(--color-amber)] text-white flex items-center justify-center shrink-0 font-[700] text-[18px]">
              !
            </div>
            <div>
              <h2 className="text-[19px] font-[800] tracking-tight mb-2">
                Why do Windows & macOS show a security prompt?
              </h2>
              <p className="text-[14px] text-[var(--color-muted)] leading-relaxed mb-4">
                UIUC Collective Mind is an <strong>independent, free, open-source student project</strong> built by and for UIUC engineers.
                Apple charges <strong>$99/year</strong> for an Apple Developer certificate, and Microsoft requires <strong>$300–$400/year</strong> for an EV Code Signing certificate.
                Because we operate on a <strong>student budget ($0)</strong> and are actively beta testing, we haven't purchased corporate code-signing certificates yet.
              </p>
              <p className="text-[14px] text-[var(--color-ink)] font-[500] leading-relaxed mb-6">
                <strong>Our code is 100% open source and safe.</strong> There are zero ads, tracking scripts, or telemetry. You can audit every line of source code on{" "}
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline font-[700]">
                  GitHub
                </a>
                .
              </p>

              {/* Tab Selector for OS Installation Instructions */}
              <div className="flex border-b border-[var(--color-rule)] mb-4">
                <button
                  onClick={() => setActiveTab("mac")}
                  className={`px-4 py-2 text-[14px] font-[600] cursor-pointer border-b-2 transition-colors ${
                    activeTab === "mac"
                      ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                      : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  macOS Instructions (Gatekeeper)
                </button>
                <button
                  onClick={() => setActiveTab("win")}
                  className={`px-4 py-2 text-[14px] font-[600] cursor-pointer border-b-2 transition-colors ${
                    activeTab === "win"
                      ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                      : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  Windows Instructions (SmartScreen)
                </button>
              </div>

              {/* Instructions Content */}
              {activeTab === "mac" ? (
                <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] p-4 text-[13px] leading-relaxed space-y-2">
                  <div className="flex gap-2">
                    <span className="font-[700] text-[var(--color-ink)]">1.</span>
                    <span>Open the downloaded <code>.dmg</code> file and drag <strong>UIUC Collective Mind</strong> into your <strong>Applications</strong> folder.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-[700] text-[var(--color-ink)]">2.</span>
                    <span>
                      In <strong>Finder &gt; Applications</strong>, <strong>Right-click (or Control-click)</strong> the app icon and select <strong>Open</strong> from the menu.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-[700] text-[var(--color-ink)]">3.</span>
                    <span>
                      Click <strong>Open</strong> in the confirmation box. (Or visit <em>System Settings &gt; Privacy &amp; Security</em> and click <strong>&quot;Open Anyway&quot;</strong>).
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--color-muted)] mt-2 pt-2 border-t border-[var(--color-rule)]">
                    * You only need to do this step the very first time you launch the app.
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] p-4 text-[13px] leading-relaxed space-y-2">
                  <div className="flex gap-2">
                    <span className="font-[700] text-[var(--color-ink)]">1.</span>
                    <span>Double-click the downloaded <code>UIUC Collective Mind Setup 0.1.0.exe</code>.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-[700] text-[var(--color-ink)]">2.</span>
                    <span>
                      When Windows Defender SmartScreen displays <em>&quot;Windows protected your PC&quot;</em>, click the blue <strong>&quot;More info&quot;</strong> link.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-[700] text-[var(--color-ink)]">3.</span>
                    <span>
                      Click the <strong>&quot;Run anyway&quot;</strong> button that appears.
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--color-muted)] mt-2 pt-2 border-t border-[var(--color-rule)]">
                    * The NSIS installer will install the app and create a Desktop and Start Menu shortcut.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Feature Comparison Table: Desktop App vs Web App */}
        <div className="mb-12">
          <h2 className="text-2xl font-[800] tracking-tight mb-6">Why use the Desktop App?</h2>
          <div className="border-[2px] border-[var(--color-ink)] overflow-hidden">
            <table className="w-full text-left border-collapse text-[14px]">
              <thead>
                <tr className="bg-[var(--color-wash)] border-b-[2px] border-[var(--color-ink)]">
                  <th className="p-3.5 font-[700]">Capability</th>
                  <th className="p-3.5 font-[700] text-center w-36">Desktop App</th>
                  <th className="p-3.5 font-[700] text-center w-36">Web Browser</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-rule)]">
                <tr>
                  <td className="p-3.5">
                    <strong>Background Polling</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Pulls assignments every 30 minutes without keeping a browser tab open</div>
                  </td>
                  <td className="p-3.5 text-center font-[700] text-[var(--color-green)]">✓ Automatic</td>
                  <td className="p-3.5 text-center text-[var(--color-muted)]">Only while tab open</td>
                </tr>
                <tr>
                  <td className="p-3.5">
                    <strong>Google Calendar Evening Study Blocks</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Automatically schedules evening study blocks (8 PM – 11 PM) before deadlines</div>
                  </td>
                  <td className="p-3.5 text-center font-[700] text-[var(--color-green)]">✓ Built-in</td>
                  <td className="p-3.5 text-center text-[var(--color-muted)]">—</td>
                </tr>
                <tr>
                  <td className="p-3.5">
                    <strong>Menu Bar &amp; System Tray</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Instant menu bar / notification tray icon with manual &quot;Pull Now&quot; trigger</div>
                  </td>
                  <td className="p-3.5 text-center font-[700] text-[var(--color-green)]">✓ Yes</td>
                  <td className="p-3.5 text-center text-[var(--color-muted)]">—</td>
                </tr>
                <tr>
                  <td className="p-3.5">
                    <strong>Native SSO Session Management</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Maintains secure PrairieLearn &amp; SmartPhysics login sessions locally</div>
                  </td>
                  <td className="p-3.5 text-center font-[700] text-[var(--color-green)]">✓ Native Cookie Store</td>
                  <td className="p-3.5 text-center text-[var(--color-muted)]">Requires Extension</td>
                </tr>
                <tr>
                  <td className="p-3.5">
                    <strong>Data Privacy &amp; Encryption</strong>
                    <div className="text-[12px] text-[var(--color-muted)]">Tokens and credentials stored with owner-only (0600) permissions on your disk</div>
                  </td>
                  <td className="p-3.5 text-center font-[700] text-[var(--color-green)]">✓ 100% Local</td>
                  <td className="p-3.5 text-center text-[var(--color-muted)]">Database + Local</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="border-t border-[var(--color-rule)] pt-10">
          <h2 className="text-xl font-[800] tracking-tight mb-6">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-[14px]">
            <div>
              <h3 className="font-[700] mb-1">Does this support Apple Silicon (M1/M2/M3)?</h3>
              <p className="text-[var(--color-muted)] leading-relaxed">
                Yes! The macOS build is natively compiled for ARM64 (Apple Silicon) for maximum speed and battery efficiency.
              </p>
            </div>
            <div>
              <h3 className="font-[700] mb-1">Does it support Windows 10 and 11?</h3>
              <p className="text-[var(--color-muted)] leading-relaxed">
                Yes! The Windows setup installer is packaged as a standard 64-bit NSIS application compatible with Windows 10 and 11.
              </p>
            </div>
            <div>
              <h3 className="font-[700] mb-1">How do I connect my Google Calendar?</h3>
              <p className="text-[var(--color-muted)] leading-relaxed">
                Open the app, go to Settings &gt; Google, and click &quot;Connect Google&quot;. It uses secure OAuth PKCE — no client secret required.
              </p>
            </div>
            <div>
              <h3 className="font-[700] mb-1">How can I contribute or report bugs?</h3>
              <p className="text-[var(--color-muted)] leading-relaxed">
                Check out the repository on GitHub to report issues, suggest features, or submit pull requests. All contributions welcome!
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-rule)] py-8 text-center text-[13px] text-[var(--color-muted)]">
        <p>UIUC Collective Mind · Built with ❤️ for the University of Illinois community · Open source</p>
      </footer>
    </div>
  );
}
