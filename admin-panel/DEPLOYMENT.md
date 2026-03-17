# Netlify production deployment

This document describes how to deploy the **web client** (Next.js + API) and **admin panel** (Vite SPA) on Netlify. Both can be hosted publicly; the admin panel is protected by login (no public content without authentication).

---

## 1. Environment variables

### Web site (Next.js app + API)

Set these in Netlify: **Site settings → Environment variables**.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Neon/Postgres connection string (e.g. `postgresql://user:pass@host:5432/db?sslmode=require`). |
| `ADMIN_JWT_SECRET` | **Yes** (production) | Secret for signing admin JWT tokens. Use a long random string. If unset, falls back to `JWT_SECRET` or a default (do not rely on default in production). |
| `JWT_SECRET` | Optional | Alternative to `ADMIN_JWT_SECRET` for admin auth. |
| `NEXT_PUBLIC_API_URL` | Optional | Set only if the frontend is served from a different origin than this app. Leave unset when the web app and API are the same Netlify site (same-origin). |
| `ADMIN_ORIGIN` | Optional | When the **admin panel** is on a different Netlify site, set this to the admin site URL (e.g. `https://sparrows-admin.netlify.app`) so the API allows CORS from that origin. Leave unset if admin is same-origin. |
| `GOOGLE_CLIENT_ID` | Optional | Only if using Google sign-in. |

### Admin site (Vite SPA)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | **Yes** (when admin is on its own site) | Full URL of the **web site** (API origin), no trailing slash (e.g. `https://sparrows-web.netlify.app`). The admin app will send all API requests to this origin. Leave unset only if the admin app is served from the same origin as the API. |

---

## 2. Netlify settings per site

Use **two separate Netlify sites** from the same repo.

### Web site (Next.js + API)

- **Repository:** Your Git repo (e.g. GitHub).
- **Base directory:** `admin-panel` (or the path to the folder that contains `apps/web` and `package.json` for the monorepo).
- **Build command:** `pnpm install && pnpm run build --filter=web`  
  (Or leave empty to use `admin-panel/netlify.toml`.)
- **Publish directory:** `apps/web/.next`  
  (The Next.js plugin may override this; ensure **Essential Next.js** / `@netlify/plugin-nextjs` is enabled.)
- **Environment variables:** See “Web site” above. At minimum: `DATABASE_URL`, `ADMIN_JWT_SECRET`.
- **Node version:** 20 (set in Netlify UI or via `NODE_VERSION=20` in env).

The repo’s `admin-panel/netlify.toml` is set up for this site (build and Next.js plugin).

### Admin site (Vite SPA)

- **Repository:** Same Git repo.
- **Base directory:** `admin-panel`.
- **Build command:** `pnpm install && pnpm run build --filter=admin`
- **Publish directory:** `apps/admin/dist`
- **Environment variables:** See “Admin site” above. Set `VITE_API_URL` to the **web site URL** (e.g. `https://sparrows-web.netlify.app`).
- **Node version:** 20.

There is no separate `netlify.toml` for the admin app; configure these in the Netlify UI (or add a second `netlify.toml` in `apps/admin` and use that folder as base if you prefer).

---

## 3. Step-by-step deployment checklist

### One-time setup

1. **Neon (or Postgres):** Create a database and get `DATABASE_URL`. Run migrations/schema as needed (e.g. from `admin-panel/apps/web` with `DATABASE_URL` set).
2. **Create first admin user** (if not already): From `admin-panel/apps/web`, with `DATABASE_URL` and `ADMIN_JWT_SECRET` set, run the create-admin script (e.g. `pnpm run create-admin` or as in the web app’s README).

### Deploy web site

1. In Netlify: **Add new site → Import an existing project** (connect the repo).
2. Set **Base directory** to `admin-panel` (or your monorepo root that contains `apps/web`).
3. Confirm **Build command** and **Publish directory** (or use values from `admin-panel/netlify.toml`).
4. Add **Environment variables**: `DATABASE_URL`, `ADMIN_JWT_SECRET` (and optionally `JWT_SECRET`, `NEXT_PUBLIC_API_URL`, `GOOGLE_CLIENT_ID`).
5. If you will deploy the admin panel on a **separate** Netlify site, add **`ADMIN_ORIGIN`** = that admin site URL (e.g. `https://your-admin-site.netlify.app`) so the API allows CORS from the admin.
6. Deploy. Note the site URL (e.g. `https://your-web-site.netlify.app`).

### Deploy admin site

1. In Netlify: **Add new site** again, same repo (or duplicate the web site and change build/publish/env).
2. Set **Base directory** to `admin-panel`.
3. Set **Build command:** `pnpm install && pnpm run build --filter=admin`
4. Set **Publish directory:** `apps/admin/dist`
5. Add **Environment variable:** `VITE_API_URL` = your **web site URL** (e.g. `https://your-web-site.netlify.app`) — no trailing slash.
6. Deploy. Note the admin site URL.

### After deploy

- **Web:** Open the web site URL; register/login and use the app. API is same-origin, so no CORS issues.
- **Admin:** Open the admin site URL; you should see the login page. Log in with the admin user you created. No public content is shown without login; direct refresh on protected routes (e.g. `/tournaments`) works via the admin app’s `_redirects` (SPA fallback).

---

## 4. What to configure in Netlify (summary)

**Web site**

- Base directory: `admin-panel`
- Build command: `pnpm install && pnpm run build --filter=web`
- Publish directory: `apps/web/.next`
- Env: `DATABASE_URL` (required), `ADMIN_JWT_SECRET` (required in production), optionally `ADMIN_ORIGIN` (admin site URL for CORS), `NEXT_PUBLIC_API_URL`, `GOOGLE_CLIENT_ID`
- Ensure the Essential Next.js plugin is enabled (via `admin-panel/netlify.toml` or Netlify UI)

**Admin site**

- Base directory: `admin-panel`
- Build command: `pnpm install && pnpm run build --filter=admin`
- Publish directory: `apps/admin/dist`
- Env: `VITE_API_URL` = web site URL (e.g. `https://your-web.netlify.app`)

---

## 5. How to test production after deploy

### Web site

1. Open the production URL. You should see the web app (landing/login or home).
2. Register a new member (or log in). Check that login and registration work.
3. Open **Calendar** (or events): list and event details load.
4. Register for an event (if any); check **My Scheduled Events** and **My Sparrows History**.
5. **My Profile:** Change name/email and password; confirm changes persist and auth still works.
6. Direct refresh on a protected route (e.g. `/scheduled`): page should load (Next.js handles routes).

### Admin site

1. Open the admin production URL. You should see the **login** page (no dashboard without login).
2. Log in with your admin user. You should see the sidebar and default list (e.g. Tournaments or first allowed resource).
3. Open **Admin users**, **Calendar Events**, **Members**, etc. (according to your role). Data should load from the API.
4. **Direct refresh:** Open a protected route (e.g. `/tournaments/123/edit`) and refresh the browser. The app should load (SPA fallback via `_redirects`).
5. Log out and confirm you are redirected to login; no protected content visible without logging in.

### Cross-origin (admin → web API)

- From the admin site, every API request goes to `VITE_API_URL` (the web site). In the browser Network tab, confirm requests go to the web site and return 200 (or expected errors). If you see CORS errors, set **`ADMIN_ORIGIN`** on the **web** site to the admin site URL (e.g. `https://your-admin.netlify.app`). The web app’s `next.config.js` sends CORS headers for `/api/*` when `ADMIN_ORIGIN` is set.

---

## 6. Files changed for production deployment

| File | Purpose |
|------|---------|
| `admin-panel/netlify.toml` | Build command, publish dir, and Next.js plugin for the **web** site. |
| `admin-panel/apps/admin/public/_redirects` | SPA fallback: `/* → /index.html` so direct refresh on admin routes works. |
| `admin-panel/apps/admin/src/lib/api-base.ts` | **New.** `getApiBase()` and `apiUrl()` using `VITE_API_URL` so the admin app can call the API on a different origin. |
| `admin-panel/apps/admin/src/lib/authProvider.ts` | Uses `getApiBase()` for login and `/me` URLs. |
| `admin-panel/apps/admin/src/lib/axiosWithAuth.ts` | Sets axios `baseURL` to `getApiBase()` for dataProvider and API calls. |
| `admin-panel/apps/admin/src/App.tsx` | DataProvider base set to `getApiBase()`. |
| `admin-panel/apps/admin/src/pages/profile.tsx` | PATCH URL relative to base (no `/api` prefix when using baseURL). |
| `admin-panel/apps/admin/src/pages/members/show.tsx` | All `fetch` use `apiUrl(...)`. |
| `admin-panel/apps/admin/src/pages/members/list.tsx` | Reset-password `fetch` uses `apiUrl` and auth header. |
| `admin-panel/apps/admin/src/pages/events/list.tsx` | All `fetch` use `apiUrl(...)`. |
| `admin-panel/apps/admin/src/pages/events/show.tsx` | Fetch event uses `apiUrl(...)`. |
| `admin-panel/apps/admin/src/pages/events/registrations.tsx` | All `fetch` and `useCustom` url use `apiUrl(...)`. |
| `admin-panel/apps/admin/src/pages/tournaments/divisions.tsx` | All `fetch` use `apiUrl(...)`. |
| `admin-panel/apps/admin/src/pages/tournaments/registrations.tsx` | All `fetch` use `apiUrl(...)`. |
| `admin-panel/apps/admin/src/pages/tournaments/division-pools.tsx` | All `fetch` use `apiUrl(...)`. |
| `admin-panel/apps/admin/src/pages/tournaments/division-knockout.tsx` | All `fetch` use `apiUrl(...)`. |
| `admin-panel/apps/admin/.env.example` | **New.** Documents optional `VITE_API_URL` for production. |
| `admin-panel/apps/web/next.config.js` | CORS headers for `/api/*` when `ADMIN_ORIGIN` is set so the admin site (different origin) can call the API. |
| `admin-panel/apps/web/middleware.ts` | **New.** Handles OPTIONS preflight for `/api/*` with CORS headers when `ADMIN_ORIGIN` is set. |
| `admin-panel/DEPLOYMENT.md` | **New.** This file: env vars, Netlify settings, checklist, testing. |

No change to product logic (auth, events, tournaments) beyond making the admin app’s API base configurable, adding CORS for the admin origin, and adding deployment config and docs.
