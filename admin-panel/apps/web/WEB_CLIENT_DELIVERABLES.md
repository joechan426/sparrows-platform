# Sparrows Web Client — Deliverables

## 1. Every changed file and what it does

| File | Purpose |
|------|--------|
| **app/layout.tsx** | Root layout: wraps app in `AuthProvider`, adds top `Nav`, sets metadata title/description. |
| **app/page.tsx** | Home: shows greeting when logged in or prompt to log in/register; link to Calendar. |
| **app/login/page.tsx** | Login page: email + password form; calls `/api/auth/login`, stores member in auth context and localStorage, redirects to home. |
| **app/register/page.tsx** | Register page: preferred name, email, password (min 6); calls `/api/auth/register`, stores member, redirects to home. |
| **app/profile/page.tsx** | My Profile (protected): view/edit preferred name and email (PATCH `/api/members/:id`), change password (POST `/api/auth/change-password`). |
| **app/calendar/page.tsx** | Calendar: fetches events (GET `/api/calendar-events`), shows “What happens NEXT” (special/cup events) and general events list; opens event detail modal to register. |
| **app/scheduled/page.tsx** | My Scheduled Events (protected): GET `/api/members/:id/registrations`, shows upcoming registrations with title, date/time, location, status, team name. |
| **app/history/page.tsx** | My Sparrows History (protected): same registrations API, shows past events with title, date, status, sport type. |
| **components/nav.tsx** | Top nav: Sparrows, Calendar, and (when logged in) My Profile, My Scheduled Events, My Sparrows History, Log out; when logged out: Login, Register. |
| **components/event-detail.tsx** | Modal: event details (title, date/time, location, description, sport, registration open/closed); when open, registration form (preferredName, email, teamName for special); POST to `/api/calendar-events/:id/registrations`. |
| **lib/api.ts** | API client: types (Member, CalendarEvent, MemberRegistration); `getBase()` for same-origin or `NEXT_PUBLIC_API_URL`; auth (login, register, changePassword), member (get, update, registrations), calendar (list, get, registerForEvent). |
| **lib/auth-context.tsx** | Client auth: `AuthProvider` stores member in state + localStorage (`sparrows_web_member`), `useAuth()` exposes member, setMember, logout, refreshMember; hydrates from storage and optionally revalidates with GET member. |
| **.env.example** | Example env: `DATABASE_URL` (required for API routes), optional `NEXT_PUBLIC_API_URL` for API on another origin. |
| **README.md** | Web app readme: local dev (DATABASE_URL, pnpm, port 3000), Netlify deployment notes, feature list. |

No backend or admin-panel files were changed. No tournament UI was added. Shop, Videos, Ongoing Tournament are untouched (they are app-only; this web app has no equivalent).

---

## 2. Local URL to open

From repo root, run the web app (and its API):

```bash
cd admin-panel && pnpm --filter web dev
```

Then open:

**http://localhost:3000**

(If the monorepo runs the whole admin-panel, the web app may be on port 3000; confirm the terminal output.)

---

## 3. What to click and what you should see

### 1) After logging in

- **Click:** Nav **Login** → enter email + password → **Log in**.
- **You should see:** Redirect to home; nav shows “My Profile”, “My Scheduled Events”, “My Sparrows History”, “Log out”; home says “Hello, &lt;name&gt;.”

### 2) Viewing calendar events

- **Click:** Nav **Calendar**.
- **You should see:** “Calendar” heading; “What happens NEXT” section (if any special/cup events); “Events” section listing upcoming events with title, date, time, location, sport, registration open/closed; “Register” or “View details” per event.

### 3) Registering for a normal event

- **Click:** **Calendar** → on a non–special event with registration open, **Register** (or View details).
- **You should see:** Modal with event details and form: Preferred name *, Email.
- **Click:** Fill name and email → **Register**.
- **You should see:** “You are registered. Status: PENDING.” (and modal can be closed). If already registered: “Member is already registered for this event.”

### 4) Registering for a special event

- **Click:** **Calendar** → on a special/cup event with registration open, **Register**.
- **You should see:** Modal with event details and form: Preferred name *, Email, Team name *.
- **Click:** Fill name, email, team name → **Register**.
- **You should see:** Same success message; one registration per member per event, status PENDING.

### 5) Viewing My Scheduled Event

- **Click:** Nav **My Scheduled Events** (must be logged in).
- **You should see:** “My Scheduled Events” and list of upcoming registrations: event title, date/time, location, status (e.g. PENDING, APPROVED, WAITING_LIST, REJECTED), team name if any.

### 6) Viewing My Sparrows History

- **Click:** Nav **My Sparrows History** (must be logged in).
- **You should see:** “My Sparrows History” and list of past events: title, date, status, sport type.

---

## 4. What is still not implemented

- **Tournament UI** — intentionally out of scope; no tournament screens in the web client.
- **Shop, Videos, Ongoing Tournament** — not in scope for this web client; they remain app-only.
- **Sign in with Apple / Google** — web client uses email + password only; backend routes exist but are not wired in the web UI.
- **Email verification / magic link** — not implemented; backend and AGENTS.md mention future support only.
- **Netlify-specific config** — README and `.env.example` describe deployment and env; no `netlify.toml` or build plugin added (Netlify’s Next.js support usually works with default build).
