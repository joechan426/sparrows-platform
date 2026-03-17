# Sparrows Web Client

Member and calendar event registration for non-iPhone users. Shares the same backend APIs and data models as the iOS app.

## Local development

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon/Postgres connection string.
2. From repo root: `pnpm install` then `pnpm --filter web dev` (or from `admin-panel`: `pnpm dev` and run the web app on port 3000).
3. Open **http://localhost:3000**

## Netlify deployment

- Build command: `pnpm build` (from monorepo root with `--filter web` if needed) or `cd admin-panel && pnpm --filter web build`.
- Publish directory: `admin-panel/apps/web/.next` for Next.js; use the Netlify Next.js runtime so the correct output is used.
- Environment variables: set `DATABASE_URL` (and optionally `NEXT_PUBLIC_API_URL` if the API is on a different origin).
- Do not hardcode production URLs in code; use `NEXT_PUBLIC_API_URL` when the API is not same-origin.

## Features

- **Auth**: Email + password login and registration.
- **My Profile**: View and update preferred name and email; change password.
- **Calendar**: List events (Volleyball / Pickleball / Tennis), “What happens NEXT” for special events, view details and register.
- **Event registration**: NORMAL (name, email); SPECIAL (name, email, team name). Same rules as app (no duplicate, registration must be open, status PENDING).
- **My Scheduled Events**: Upcoming registrations with title, date/time, location, status, team name.
- **My Sparrows History**: Past events with title, date, status, sport type.
