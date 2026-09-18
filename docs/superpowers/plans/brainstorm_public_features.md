# Transitioning to a Public SaaS for UIUC Students

Currently, UIUC Collective Mind is designed as a **local desktop application** (running on `localhost`, using a local headless browser for SSO, and storing data in local JSON files). Transitioning this to a public web application accessible to any UIUC student requires fundamental architectural shifts to handle multi-tenancy, security, and cloud infrastructure.

Here is a brainstorm of the necessary features and architectural changes required to make this public.

## 1. Multi-Tenant Architecture & Database

**Current State:** Data is stored in `data/state.json` and `settings.json`.
**Required Changes:**
- **Database Integration:** Move from local JSON files to a robust relational database (e.g., PostgreSQL).
- **Data Modeling:** We need tables for `Users`, `Courses`, `UserCourses` (enrollments), `Assignments`, and `UserAssignments` (grades/status per user).
- **Row-Level Security:** Ensure users can only see their own courses, settings, and grades.

> [!TIP]
> **Recommendation:** Use **Supabase** or **Firebase (Data Connect with PostgreSQL)** for the database, as they offer built-in Row-Level Security (RLS) to keep user data strictly isolated.

## 2. Authentication (App Login vs. Source Login)

**Current State:** The app has no login. It relies on the user's local Shibboleth session via Playwright for Canvas/PrairieLearn.
**Required Changes:**
- **App Login:** Students need a way to log into our platform. 
  - *Solution:* Implement UIUC SSO via Microsoft Entra ID (Azure AD) or Google OAuth (using `@illinois.edu` accounts).
- **Source Authentication (The Hard Part):** The app currently spins up a local browser window so the user can log into Shibboleth, and then uses those cookies to scrape. In a cloud environment, you can't easily pop open a browser on the user's machine from the backend.

> [!IMPORTANT]
> **Authentication & Data Fetching Options (Without Chrome Extensions):**
> 
> 1. **Personal Access Tokens (PATs) [Recommended for MVP]:** Both Canvas and PrairieLearn allow students to generate personal API tokens from their account settings. 
>    - *How it works:* The student generates a token in Canvas/PrairieLearn and pastes it into our app during onboarding. We store it securely and use it to hit the official REST APIs.
>    - *Pros:* Extremely stable, no headless browsers needed, low compute cost, completely ignores SSO issues.
>    - *Cons:* Slightly higher friction during user onboarding (requires a 3-step tutorial to find and copy the token).
>
> 2. **Official Developer App (OAuth2):** 
>    - *How it works:* UIUC IT registers our app as an official Canvas Developer Key. Users just click "Log in with Canvas" (standard OAuth).
>    - *Pros:* The absolute best, seamless user experience.
>    - *Cons:* Requires approval from university IT/admins, which can be bureaucratic and slow.
>
> 3. **Cloud Headless Browsers (Playwright on Server):** 
>    - *How it works:* We spin up a hidden browser on our server, proxy the UIUC login page to the user, and steal the cookies once they authenticate.
>    - *Pros:* "No-install" experience, no manual token copying.
>    - *Cons:* High compute costs, massive memory usage at scale, high risk of IP bans/rate-limiting from UIUC SSO, and CAPTCHAs can break the flow entirely.

## 3. Secret Management & Security

**Current State:** Canvas tokens and Google Client Secrets are stored in plaintext in `settings.json`.
**Required Changes:**
- **Encryption at Rest:** Sensitive tokens (Canvas feed URLs, Google OAuth refresh tokens) must be encrypted in the database using strong cryptography (e.g., AES-256).
- **Environment Variables:** Move shared secrets (like the Google OAuth client secret for the app itself) to `.env` files managed by the hosting provider.

## 4. Google Tasks / Calendar Integration

**Current State:** Uses a shared Google Desktop App OAuth client.
**Required Changes:**
- **Web App OAuth:** We must transition the Google Cloud project from a "Desktop App" to a "Web Application".
- **Token Storage:** The app must handle the OAuth flow and store the `access_token` and `refresh_token` securely for each user in the database.
- **Background Sync Workers:** Instead of a local `setInterval` poller, we need a robust background job queue (e.g., Redis + BullMQ, or Inngest) to poll Canvas/PrairieLearn feeds and sync to Google Tasks asynchronously for thousands of users.

## 5. Course Discovery & Global Schema

**Current State:** Users manually input course IDs (e.g., Canvas `74325`, PrairieLearn `143409`).
**Required Changes:**
- **Course Catalog:** Maintain a global directory of known UIUC courses for the current semester.
- **Auto-discovery:** When a user logs in, we can parse their Canvas calendar feed (`.ics`) to automatically detect their enrolled courses and add them to their dashboard, preventing them from needing to hunt down internal course IDs.

## 6. Frontend Overhaul

**Current State:** A single `index.html` file with vanilla JS and manual DOM manipulation.
**Required Changes:**
- Migrate to a modern framework like **Next.js (React)** or **SvelteKit**. This will make building complex dashboards, settings pages, and onboarding flows much more manageable.
- Implement a modern design system (e.g., Tailwind CSS + shadcn/ui) to give the app a premium, trustworthy look.

## 7. Implementation Decision: Personal Access Tokens (PATs)

We have decided to proceed with **Personal Access Tokens (PATs)** for external source authentication. This approach avoids the high costs and maintenance nightmare of server-side headless browsers, and bypasses the UX friction of requiring users to install a Chrome extension.

To make onboarding as smooth as possible, the application will provide a clear, step-by-step guide for users to generate and input their tokens.

### User Onboarding Guide: Activating Personal Access Tokens

#### Connecting Canvas
1. Log in to your UIUC Canvas account.
2. In the left-hand global navigation menu, click on **Account**, then select **Settings**.
3. Scroll down to the **Approved Integrations** section and click the **+ New Access Token** button.
4. In the **Purpose** field, type "Collective Mind App". Leave the **Expires** field blank (or set a date if you prefer).
5. Click **Generate Token**.
6. **Copy the token** displayed on the screen (it usually starts with `10100~`). *Note: This token will never be shown again, so copy it immediately.*
7. Paste this token into the Canvas integration settings in the Collective Mind app.

#### Connecting PrairieLearn
1. Log in to PrairieLearn.
2. In the top-right corner, click on your name/username to open the dropdown menu.
3. Select **Settings**.
4. Scroll down to the **Personal access tokens** section.
5. Click **Generate new token**.
6. Give it a descriptive name (e.g., "Collective Mind").
7. **Copy the newly generated token.**
8. Paste this token into the PrairieLearn integration settings in the Collective Mind app.

With these tokens securely stored in our backend, the app can fetch assignments, grades, and statuses directly from the official APIs on behalf of the user, without ever needing to worry about SSO redirects, 2FA, or CAPTCHAs.
