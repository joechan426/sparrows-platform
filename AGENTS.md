# Sparrows Platform — AGENTS.md

## Project Overview

Sparrows Platform is a multi-surface system for volleyball/tournament operations.

Current repository structure:

```text
sparrows-platform/
├── admin-panel/
├── sparrows-app/
├── database/
│   └── schema.sql
├── netlify/
│   └── functions/
└── AGENTS.md

The system has 3 main surfaces:
	1.	admin-panel/
	•	Internal admin web app for Managers/Admins.
	•	Used to manage tournaments, users, registrations, teams, matches, scheduling, results, training sessions, and approvals.
	2.	sparrows-app/
	•	iOS app for end users.
	•	Users register/login, join teams, register for tournaments, accept waivers, register for trainings, view schedules/results, and receive notifications.
	3.	netlify/functions/
	•	Backend/API layer.
	•	Responsible for data access, business rules, auth validation, role enforcement, and integration with Neon/Postgres.
	4.	database/schema.sql
	•	Source of truth for database schema unless a newer agreed migration system is introduced.
	•	Any schema changes must be reflected here first, then implemented in the API, then consumed by admin-panel and sparrows-app.

⸻

Product Goals

This project is intended to support:
	•	User registration and login
	•	Role-based access:
	•	user: app-only access to end-user features
	•	manager: manage tournaments, users, approvals, content in admin panel
	•	admin: manage managers plus all manager permissions
	•	Tournament management:
	•	one-day cup tournaments
	•	long-running league tournaments
	•	Team creation and tournament registration
	•	Registration approval flow
	•	Waiver/insurance acknowledgement tracking per tournament
	•	Training session registration and approval
	•	Match scheduling and eventually drag/drop scheduling by court and time
	•	Match results and historical records
	•	Future support for multiple leagues/organizations

⸻

Architecture Direction

Backend
	•	Netlify Functions are the backend entry points.
	•	Neon/Postgres is the database.
	•	Business rules must live in backend functions, not only in the UI.
	•	The backend is the source of truth for permissions, validation, approval rules, and state transitions.

Database
	•	Neon/Postgres is authoritative.
	•	database/schema.sql must stay synchronized with implemented backend behavior.
	•	Schema changes should be incremental and explicit.

Frontends
	•	admin-panel/ and sparrows-app/ must consume the same backend concepts and data model.
	•	If field names differ between UI and backend, backend naming wins unless explicitly refactored project-wide.

⸻

Core Domain Concepts

Use these domain entities consistently:
	•	Organization / League
	•	User
	•	Role / Membership
	•	Team
	•	Tournament
	•	TournamentRegistration
	•	Division
	•	Pool
	•	Court
	•	Match
	•	MatchSet / SetScore
	•	TrainingSession
	•	TrainingRegistration
	•	Waiver
	•	WaiverAcceptance
	•	Notification

Avoid creating overlapping duplicate concepts.

⸻

Folder Responsibilities

admin-panel/

Admin web UI only.

Responsibilities:
	•	admin screens
	•	manager/admin workflows
	•	CRUD views for tournament operations
	•	moderation/approval screens

Do not place core business rules only here.

sparrows-app/

iOS app only.

Responsibilities:
	•	user login/registration
	•	join/create team flows
	•	tournament registration
	•	waiver acceptance
	•	training registration
	•	schedule/results/history display
	•	user notifications UI

Do not place backend-only validation here.

netlify/functions/

Backend/API only.

Responsibilities:
	•	data access
	•	role checks
	•	validation
	•	approval logic
	•	schedule/business rules
	•	Neon database interaction

database/schema.sql

Database schema only.

Responsibilities:
	•	canonical SQL schema
	•	table/relationship/index updates
	•	schema-first changes before API/UI wiring

⸻

Engineering Rules

1. Work from backend outward

For new features, follow this order:
	1.	update database/schema.sql
	2.	create/update Netlify functions
	3.	connect admin-panel UI
	4.	connect sparrows-app UI

2. Keep logic centralized

Critical rules must live in the backend:
	•	role/permission checks
	•	approval flow
	•	registration status transitions
	•	tournament edit restrictions
	•	waiver enforcement
	•	scheduling conflict checks

3. Make safe, minimal edits

Prefer small, reviewable changes.
When changing multiple files, explain:
	•	why each file changes
	•	dependency order
	•	what should be tested afterwards

4. Preserve consistency

When adding a field or feature, update all relevant places:
	•	schema
	•	backend function input/output
	•	admin-panel types/forms/views
	•	sparrows-app models/screens where needed

5. Avoid premature refactors

Do not rename folders, rewrite frameworks, or move large code sections unless explicitly requested.

6. Respect current stack
	•	admin-panel = existing admin web project
	•	sparrows-app = existing iOS app project
	•	backend = Netlify Functions
	•	database = Neon/Postgres

Do not replace these choices unless explicitly asked.

⸻

Roles

user

Can:
	•	register/login
	•	view app content
	•	create/join team if enabled
	•	register a team for a tournament if allowed
	•	accept waiver
	•	register for training sessions
	•	view own schedules/results/history

manager

Can:
	•	do everything a user can
	•	access admin panel
	•	create/edit tournaments
	•	manage tournament registrations
	•	approve/reject registrations
	•	manage training sessions
	•	approve/reject training registrations
	•	manage tournament content and settings
	•	enter/update match and scheduling data

admin

Can:
	•	do everything a manager can
	•	create/edit/remove managers
	•	manage higher-level system administration

⸻

Tournament Types

Always support both types:

Cup Tournament
	•	usually one-day event
	•	many matches in one day
	•	multiple courts and pools
	•	later supports knockout stages

League Tournament
	•	multi-week competition
	•	fewer matches per day/week
	•	recurring schedule logic may be needed

Reuse shared tournament logic where possible.

⸻

Immediate Priorities

Unless instructed otherwise, prioritize work in this order:

Phase 1: Stable foundation
	•	confirm folder responsibilities
	•	confirm Neon connectivity
	•	confirm backend function patterns
	•	standardize API response shapes
	•	standardize environment variables

Phase 2: Tournament registration foundation
	•	users / roles
	•	teams
	•	tournaments
	•	tournament registrations
	•	manager approval flow

Phase 3: Tournament operations
	•	divisions
	•	pools
	•	courts
	•	matches
	•	scheduling
	•	results

Phase 4: Training flow
	•	training sessions
	•	training registrations
	•	approval flow

Phase 5: Advanced features
	•	waiver tracking
	•	notifications
	•	historical stats
	•	multi-organization support
	•	reusable league configuration

⸻

API Design Expectations

Unless already established differently, backend functions should aim for:
	•	predictable JSON responses
	•	explicit error messages
	•	role checks before writes
	•	stable IDs
	•	no hidden coupling to one UI only

For list endpoints:
	•	support filtering where practical
	•	support pagination where practical

For detail endpoints:
	•	return payloads usable by both admin-panel and sparrows-app where practical

⸻

Current Near-Term Goal

The most important working flow right now is:
	1.	manage tournaments from admin-panel
	2.	create teams
	3.	create tournament registrations
	4.	display registrations inside a tournament admin view
	5.	add manager approval/rejection for registrations

Do not jump to advanced drag/drop scheduling before this flow is stable.

⸻

2026 Product Direction Update — Member & Event System

The current near-term product direction has expanded beyond tournaments.

The immediate focus is now building a lightweight member system and calendar-based event registration system that powers the iOS app and future web version.

This layer must be completed before deep tournament integration into the mobile app.

New Near-Term Product Priorities

1. Member system foundation
   • simple member profile
   • preferredName
   • email
   • future support for email verification / magic link login
   • members must be uniquely identifiable by email

2. Calendar event system
   • events are imported or synchronized from Google Calendar
   • Google Calendar is the source of raw event data
   • events must be stored in Neon/Postgres for application logic
   • the app and admin-panel must NOT depend directly on the Google Calendar embed

Correct architecture:

Google Calendar
    ↓ import/sync
Neon database (calendar_events)
    ↓
admin-panel / sparrows-app / web client

3. Event classification rules

Events must be automatically categorized using the title:

Sport classification:
• if title contains "Pickleball" (case-insensitive) → PICKLEBALL
• if title contains "Tennis" (case-insensitive) → TENNIS
• otherwise → VOLLEYBALL

Event type classification:
• if title contains "Cup" (case-insensitive) → SPECIAL_EVENT
• otherwise → NORMAL_EVENT

4. Event registration system

Members can register for calendar events.

NORMAL event:
• required fields:
  • preferredName
  • email

SPECIAL event:
• required fields:
  • preferredName
  • email
  • teamName

Rules:
• one member may register only once per event
• registration statuses:
  • PENDING
  • APPROVED
  • WAITING_LIST
  • REJECTED

Managers control:
• opening registration
• closing registration
• approving or rejecting participants

5. Admin-panel responsibilities for events

Admin panel must allow managers to:

• view calendar events
• open / close event registration
• view event registrations
• see member details
• update registration status

6. sparrows-app responsibilities

sparrows-app must support:

• membership onboarding (My Profile)
• calendar event browsing
• event registration
• viewing registration status
• viewing past events

Important:
The following pages are already complete and must not be modified:

• Shop
• Videos
• Ongoing Tournament

New features must be added without breaking these pages.

7. Netlify web version

A future Netlify-hosted web client will mirror the functionality of the iOS app.

The web version must share the same backend APIs and database models as the mobile app.

All business logic must remain in the backend layer so that both clients behave identically.

8. Relationship with Tournament System

The tournament engine built earlier remains part of the long-term platform.

However, tournament functionality will be integrated into the app later.

Current order of development:

1. Member system
2. Calendar event system
3. Event registration system
4. Admin approval flow
5. iOS app integration
6. Netlify web client
7. Tournament system integration

⸻

Definition of Done

A feature is only considered done when:
	•	schema is updated if needed
	•	backend logic exists
	•	admin-panel can use it if required
	•	sparrows-app can use it if required
	•	basic error handling exists
	•	affected docs/comments are updated
	•	manual test steps are listed

⸻

Cursor Working Style

When given a task, Cursor should:
	1.	restate the goal in system terms
	2.	identify which folders/files are involved
	3.	propose the smallest sensible implementation plan
	4.	implement in the correct order
	5.	list exactly what to test afterwards

If a request is large, break it into phases instead of doing a risky all-at-once rewrite.

⸻

Before Major Changes

Before large refactors, confirm:
	•	whether schema changes are allowed now
	•	whether existing Neon data must be preserved
	•	whether the feature is backend-wide, admin-only, or app-only
	•	whether the feature should be reusable for future leagues

⸻

Multi-League Future

This system is expected to support other leagues later.

Avoid hard-coding Sparrows-specific assumptions unless explicitly requested.
Where possible, structure data and permissions so multi-organization support can be added later without a major rewrite.

⸻

Calendar event payments (AUD, Stripe Connect + PayPal seller)

- **Currency**: default `AUD` on `calendar_events.currency`; prices are **minor units** (`priceCents`).
- **Who receives money**: Each **paid** `CalendarEvent` has `paymentAccountAdminId` — the **AdminUser** whose **Stripe Connect** account and/or **PayPal merchant id** receives checkout. If unset when an event is saved as paid, it defaults to the **current manager**. You never store a manager’s Stripe **login password** or **merchant secret key**; only public ids (`acct_…`, PayPal merchant id) are stored in Postgres.
- **Platform credentials (unavoidable)**: The API host still needs **your** Stripe **platform** `STRIPE_SECRET_KEY` (Connect) and PayPal **partner/app** `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` so the server can create sessions/orders **on behalf of** linked sellers. Those are **app** credentials, not end‑merchant secrets. Toggle global methods via `payment_platform_settings` + `GET/PATCH /api/payment-settings`.
- **Manager onboarding**: `POST /api/payment-connect/stripe/onboarding` → Stripe hosted Connect onboarding; `GET /api/payment-connect/stripe/status`; `POST /api/payment-connect/stripe/disconnect` (clears local link only). PayPal: `POST /api/payment-connect/paypal/onboarding` (Partner Referral link) and/or `PATCH /api/admin-auth/me/payment-connections` with `{ paypalMerchantId }` (manual). `GET /api/admin-auth/me` includes `paymentConnections` summary.
- **Checkout**: `POST /api/calendar-events/:id/checkout` uses the event recipient’s **connected Stripe account** (`stripe.checkout.sessions.create(..., { stripeAccount })`) or PayPal order with `payee.merchant_id`. Public `GET /api/calendar-events/:id` adds `stripeCheckoutAvailable` / `paypalCheckoutAvailable`.
- **Webhooks / return URLs**: Stripe `POST /api/webhooks/stripe` — `checkout.session.completed` and **`account.updated`** (sync `stripeConnectChargesEnabled`). Return pages: `/calendar/checkout-return`, `/calendar/paypal-return`, plus `/admin/connect/stripe/return|refresh` and `/admin/connect/paypal/return`. Set `NEXT_PUBLIC_WEB_APP_URL` (or `NEXT_PUBLIC_CHECKOUT_PUBLIC_BASE_URL`).
- **Direct registration API**: For **paid** events, anonymous `POST /api/calendar-events/:id/registrations` returns **402** `PAYMENT_REQUIRED`. Managers may create rows with `paymentWaived` or `recordedPaidCents`.
- **Manager payment edits / refunds**: same as before (`PATCH /api/event-registrations/:id`); no automated refunds in-app.
- **Env reference**: `admin-panel/apps/web/.env.example` (includes `STRIPE_CONNECT_DEFAULT_COUNTRY`, default `AU`).
