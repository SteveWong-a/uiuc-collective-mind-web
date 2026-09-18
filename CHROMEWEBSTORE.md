# UIUC Collective Mind Sync — Chrome Web Store & Distribution Guide

Last Updated: September 18, 2026

---

## 1. Do I HAVE to add the extension to the Google Chrome Web Store?

### **Short Answer:**
**No, you do not have to publish it to the Chrome Web Store to use it.**

### **Detailed Comparison:**

| Feature | Option A: Load Unpacked (Developer Mode) | Option B: Chrome Web Store |
| :--- | :--- | :--- |
| **Cost** | **$0 (Free)** | **$5 one-time Google Developer fee** |
| **Approval** | **Instant** — works immediately | **1–3 business days** review by Google |
| **Installation** | Unzip folder & click "Load unpacked" in `chrome://extensions` | Click "Add to Chrome" button from Web Store |
| **Audience** | Yourself, contributors, and beta testers | Any student or user across UIUC |
| **Updates** | Git pull / re-download new zip | Automatic background updates via Web Store |
| **Developer Mode Warning** | None on modern Chrome (remains active) | Never prompts |

> [!TIP]
> **Recommendation:**
> - Start with **Option A (Load Unpacked)** for yourself, pair programmers, and initial beta testers.
> - When you are ready for campus-wide rollout so that non-technical students don't need to enable Developer Mode, you can submit the extension to the Chrome Web Store using the prepared metadata below.

---

## 2. Chrome Extension Store Metadata (Pre-filled for Submission)

### Store Listing
* **Item Name:** UIUC Collective Mind Sync
* **Short Summary (under 132 chars):** Securely sync your UIUC Canvas, PrairieLearn, and SmartPhysics assignments with UIUC Collective Mind.
* **Category:** Productivity / Education
* **Language:** English (United States)
* **Website:** `https://uiuc-collective-mind-web.vercel.app`
* **Support Email:** `stevetsname@gmail.com`

### Detailed Store Description
```markdown
UIUC Collective Mind Sync is an open-source companion extension for UIUC Collective Mind (https://uiuc-collective-mind-web.vercel.app).

Browsers enforce strict Same-Origin Policies that prevent web applications from reading your assignment feeds and course progress directly. This extension acts as a secure local bridge between your active university sessions and your UIUC Collective Mind dashboard.

Key Features:
- 1-Click Canvas Sync: Pull active course enrollments, upcoming assignments, and grades from canvas.illinois.edu.
- PrairieLearn & SmartPhysics Integration: Bridges assessment due dates directly into your unified calendar view.
- 100% Private & Open Source: No analytics, no ads, and no external tracking servers. Your session cookies never leave your local browser.

How it works:
1. Log into your university portal (Canvas, PrairieLearn, etc.) using your Illinois NetID.
2. Open UIUC Collective Mind in your browser.
3. Click "Sync" on the dashboard to automatically import your upcoming assignments and deadlines.

Source code: https://github.com/SteveWong-a/uiuc-collective-mind-web
```

---

## 3. Permissions Justifications (Required by Google Reviewers)

Google requires plain-English explanations for every permission declared in `manifest.json`.

| Permission / Host | Why It Is Required |
| :--- | :--- |
| `storage` | Used locally to store temporary sync timestamps and cache user course identifiers. |
| `https://canvas.illinois.edu/*` | Required to read the active student's courses and assignment submissions via the authenticated Canvas API (`/api/v1/users/self/courses` and `/api/v1/courses/:id/assignments`). |
| `https://us.prairielearn.com/*` | Required to fetch the user's PrairieLearn assessment table when requested by the dashboard. |
| `https://cs128.org/*` | Required to fetch CS 128 homework due dates for enrolled students. |
| `https://smart.physics.illinois.edu/*` | Required to fetch PHYS 211/212 SmartPhysics homework assignments. |
| `https://uiuc-collective-mind-web.vercel.app/*` | Required to communicate with the official UIUC Collective Mind web client via message passing. |
| `http://localhost:3000/*` | Required for local development and testing. |

---

## 4. Single-Purpose & Privacy Policy Disclosures

* **Single Purpose Statement:** The single purpose of this extension is to fetch academic assignments from university course portals (Canvas, PrairieLearn, SmartPhysics) and transfer them to the student's UIUC Collective Mind dashboard.
* **Data Usage:**
  - **Does this extension sell user data?** NO.
  - **Does this extension transfer data to third parties?** NO.
  - **Is user data stored on third-party servers?** NO. Data is transferred strictly between the student's browser and their authenticated database.
* **Privacy Policy URL:** `https://uiuc-collective-mind-web.vercel.app/download`

---

## 5. How to Publish to the Chrome Web Store (When Ready)

1. **Register as a Chrome Web Store Developer:**
   - Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
   - Sign in with your Google account and pay the one-time $5 registration fee.
2. **Create the Submission ZIP:**
   - Run: `cd extension && zip -r ../extension-store.zip . -x "*.DS_Store"`
3. **Upload the Package:**
   - In the Developer Dashboard, click **New Item** and upload `extension-store.zip`.
4. **Fill in the Store Listing:**
   - Copy-paste the **Store Description** and **Permissions Justifications** from sections 2 and 3 above.
   - Upload a 1280x800 screenshot or 440x280 promotional tile.
5. **Submit for Review:**
   - Click **Submit for Review**. Review typically takes 24 to 72 hours.
