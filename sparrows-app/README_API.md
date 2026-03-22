# Sparrows iOS app — API base URL

The app talks to the same Next.js **sparrowsweb** API as the browser (`/api/auth/*`, `/api/calendar-events`, `/api/google-calendar-ics`, etc.).

## Simulator

Default: `http://127.0.0.1:3000` (run `pnpm dev` in `admin-panel` / web app).

## Physical iPhone / iPad

`127.0.0.1` points at the **phone itself**, not your Mac. You must:

1. Note your Mac’s LAN IP (e.g. `192.168.1.20`).
2. In Xcode: target **Sparrows Sport Clup** → **Info** → add a custom key **SparrowsAPIBaseURL** = `http://192.168.1.20:3000` (no trailing slash).
3. Ensure the web dev server listens on `0.0.0.0` (not only localhost) if needed, e.g. `next dev -H 0.0.0.0`.
4. If plain **HTTP** is blocked, enable **App Transport Security** for local network (e.g. `NSAllowsLocalNetworking` in Info.plist) or use HTTPS.

The Calendar merges **admin events** from `GET /api/calendar-events` with **Google** events from `GET /api/google-calendar-ics`. Both use the same **SparrowsAPIBaseURL**.
