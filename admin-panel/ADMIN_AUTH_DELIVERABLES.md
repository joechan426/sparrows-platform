# Admin panel auth & role-based access — deliverables

## Summary

Secure admin-panel authentication and role-based page access are implemented: admin users and managers, page permissions (Tournaments, Teams, Calendar Events, Members), login/logout, and admin-user management (ADMIN only). Backend enforces permissions; frontend hides sidebar items and blocks direct URL access.

---

## 1. List of changed/added files

### Database & backend (already done in prior session)

| File | What it does |
|------|----------------|
| `database/schema.sql` | Defines `admin_users` (id, email, password_hash, role, is_active, created_at, updated_at) and `admin_permissions` (admin_user_id, module). |
| `admin-panel/apps/web/prisma/schema.prisma` | Prisma models `AdminUser` and `AdminPermission` with enums `AdminRole` and `AdminModule`, mapped to the SQL schema. |
| `admin-panel/apps/web/prisma/migrations/20260315000000_add_admin_users/migration.sql` | Migration that creates the admin tables and enums. |
| `admin-panel/apps/web/lib/admin-auth.ts` | JWT sign/verify and `requireAdminAuth(req, module)` to validate token, load admin, check `isActive`, and enforce module permission (ADMIN always allowed; MANAGER only if module in permissions). |
| `admin-panel/apps/web/app/api/admin-auth/login/route.ts` | POST login: email + password, returns `{ token, admin }`. |
| `admin-panel/apps/web/app/api/admin-auth/me/route.ts` | GET current admin (Bearer token required). |
| `admin-panel/apps/web/app/api/admin-users/route.ts` | GET list (ADMIN only), POST create (ADMIN only); list response includes `X-Total-Count` for Refine. |
| `admin-panel/apps/web/app/api/admin-users/[id]/route.ts` | GET one (ADMIN only), PATCH update isActive/permissions (ADMIN only). |
| Other API routes under `admin-panel/apps/web/app/api/` | Each protected with `requireAdminAuth(req, "MODULE")` (tournaments, teams, calendar-events, members as appropriate). |

### Admin panel (this session)

| File | What it does |
|------|----------------|
| `admin-panel/apps/admin/src/lib/admin-auth.ts` | **New.** Token and admin profile in localStorage; `getToken`, `getStoredAdmin`, `setAuth`, `clearAuth`, `hasPermission`, `canAccessResource`, `RESOURCE_TO_MODULE`. |
| `admin-panel/apps/admin/src/lib/fetchWithAuth.ts` | **New.** Fetch wrapper that adds `Authorization: Bearer <token>` for `/api` requests except `/api/admin-auth/login`. |
| `admin-panel/apps/admin/src/lib/authProvider.ts` | **New.** Refine `AuthProvider`: login (POST login, store token + admin), logout (clear, redirect to /login), check (GET /me, validate token), onError (401 logout, 403 redirect to /), getPermissions, getIdentity; and `canAccessResource` for access control. |
| `admin-panel/apps/admin/src/index.tsx` | Replaces `window.fetch` with `fetchWithAuth` so all dataProvider and fetch calls to `/api` send the token. |
| `admin-panel/apps/admin/src/App.tsx` | Uses `adminAuthProvider`, `accessControlProvider` (based on `canAccessResource`), adds `admin-users` resource and routes; login page only (no register/forgot/social); index and post-login redirect use `AdminDefaultRedirect`; layout outlet wrapped in `RequireResourceAccess`. |
| `admin-panel/apps/admin/src/components/AdminDefaultRedirect.tsx` | **New.** Redirects to the first allowed resource (tournaments → teams → events → members → admin-users). |
| `admin-panel/apps/admin/src/components/RequireResourceAccess.tsx` | **New.** Route guard: maps path to resource, checks `canAccessResource`; if no access, redirects to `/`. |
| `admin-panel/apps/admin/src/pages/admin-users/list.tsx` | **New.** List admin users (email, role, isActive, permissions, created); Edit button. |
| `admin-panel/apps/admin/src/pages/admin-users/create.tsx` | **New.** Create admin/manager: email, password, role (ADMIN/MANAGER), and for MANAGER checkboxes for Tournaments, Teams, Calendar Events, Members. |
| `admin-panel/apps/admin/src/pages/admin-users/edit.tsx` | **New.** Edit admin user: email (read-only), Active checkbox, and for MANAGER checkboxes for page permissions. |

---

## 2. URLs to open and what to do

Assume:

- Admin panel (Vite): **http://localhost:5173** (or whatever port your admin app uses).
- Backend (Next.js): **http://localhost:3000** (admin panel proxies `/api` to this).

You must have run the migration and created at least one ADMIN user (see “Not implemented yet” below).

---

### Step 1 — Log in as admin

1. Open **http://localhost:5173** (or **http://localhost:5173/login** if you’re sent there).
2. You should see the **Refine login page** (email + password).
3. Enter the **admin** account email and password.
4. Click **Login**.

**You should see:**

- Redirect to the first allowed section (e.g. **Tournaments** list at `/tournaments`, or **Admin users** at `/admin-users` if that’s the first you have access to).
- Sidebar with all sections you’re allowed: Tournaments, Teams, Calendar Events, Members, and **Admin users** (only for ADMIN role).
- Header with user identity (email) and logout.

---

### Step 2 — Create a manager

1. In the sidebar, click **Admin users** (only visible when logged in as ADMIN).
2. Click **Create** (or go to **http://localhost:5173/admin-users/create**).
3. Fill in:
   - **Email**: e.g. `manager@example.com`
   - **Password**: e.g. `password123` (min 6 characters)
   - **Role**: **Manager**
   - **Page permissions**: e.g. check only **Tournaments** and **Teams** (leave Calendar Events and Members unchecked).
4. Click **Save** (or **Create**).

**You should see:**

- Redirect to the admin users list.
- The new user appears with role **MANAGER**, Active **true**, and Modules **TOURNAMENTS, TEAMS**.

---

### Step 3 — Assign limited page access

- You already did this in step 2 by choosing only Tournaments and Teams for the manager.
- To change later: go to **Admin users** → click **Edit** on that manager → change **Active** and/or **Page permissions** → **Save**.

**You should see:**

- List updated; that manager’s permissions reflect only the modules you selected.

---

### Step 4 — Log in as that manager

1. Click **Logout** in the header (or open **http://localhost:5173/login** and log out if needed).
2. On the login page, enter the **manager** email and password (e.g. `manager@example.com` / `password123`).
3. Click **Login**.

**You should see:**

- Redirect to the first allowed section (e.g. **Tournaments** at `/tournaments`).
- Sidebar shows **only** Tournaments and Teams (no Calendar Events, no Members, no Admin users).
- You can open Tournaments and Teams and use them normally.

---

### Step 5 — Try to access a forbidden page directly

1. Still logged in as the **manager** (with only Tournaments and Teams).
2. In the address bar, go to **http://localhost:5173/members** (or **http://localhost:5173/events** or **http://localhost:5173/admin-users**).

**You should see:**

- Either immediate redirect to **/** (home), or the page loads and the first API call returns 403 and then you are redirected to **/**.
- You do **not** see the Members (or Events or Admin users) content; the sidebar still does not show those items.

---

## 3. What is not implemented yet

- **Running the migration**  
  When the DB is available, run from `admin-panel/apps/web`:
  - `pnpm exec prisma migrate deploy`
  (Or `prisma migrate dev` if you prefer.)

- **Creating the first ADMIN user**  
  There is no seed or UI to create the very first admin. Options:
  - Add a seed script that creates one ADMIN user (e.g. from env vars).
  - Or run a one-off script that uses Prisma + bcrypt to insert one row into `admin_users` (and no rows in `admin_permissions`; ADMIN has full access in code).

- **JWT secret in production**  
  Set `ADMIN_JWT_SECRET` (or `JWT_SECRET`) in production; the code falls back to a default if unset.

- **Password change / forgot password**  
  No “change password” or “forgot password” flows for admin users.

- **sparrows-app**  
  No changes to the iOS app; auth and permissions are admin-panel and backend only as requested.

---

## 4. Quick reference

- **Login**: **http://localhost:5173/login**
- **After login**: Redirect to first allowed resource (e.g. **http://localhost:5173/tournaments** or **http://localhost:5173/admin-users**).
- **Admin users (ADMIN only)**: **http://localhost:5173/admin-users** (list), **http://localhost:5173/admin-users/create** (create), **http://localhost:5173/admin-users/:id/edit** (edit).
- **Backend** enforces permissions on every protected API route; the panel hides menu items and blocks direct URLs via `accessControlProvider` and `RequireResourceAccess`.
