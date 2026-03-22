# Sparrows iOS app — API base URL

The app talks to the same Next.js **sparrowsweb** API as the browser (`/api/auth/*`, `/api/calendar-events`, `/api/google-calendar-ics`, etc.).

## Debug vs Release (repo defaults)

| Build configuration | `SparrowsAPIBaseURL` | Set in Xcode |
|---------------------|----------------------|--------------|
| **Debug** | `http://127.0.0.1:3000` | Target **Sparrows Sport Clup** → **Build Settings** → search **SparrowsAPIBaseURL** (`INFOPLIST_KEY_SparrowsAPIBaseURL`) |
| **Release** | `https://sparrowsweb.netlify.app` | Same (Release row) |

These are stored in `Sparrow App.xcodeproj/project.pbxproj` as `INFOPLIST_KEY_SparrowsAPIBaseURL` on the app target’s Debug / Release configurations. **Archive / App Store builds use Release** → production Netlify URL.

## Simulator (Debug)

Run `pnpm dev` in `admin-panel/apps/web` (port **3000**), then run the app with the **Debug** configuration.

## Physical iPhone / iPad (Debug against your Mac)

`127.0.0.1` points at the **phone itself**, not your Mac. For **Debug** builds you can:

1. Note your Mac’s LAN IP (e.g. `192.168.1.20`).
2. In Xcode: target **Sparrows Sport Clup** → **Info** → **Custom iOS Target Properties** → **SparrowsAPIBaseURL** = `http://192.168.1.20:3000` (no trailing slash).  
   (This overrides the Debug default for your machine.)
3. Ensure the web dev server accepts LAN connections if needed, e.g. `next dev -H 0.0.0.0 --port 3000`.
4. Plain **HTTP** to a local IP may require **App Transport Security** exceptions (e.g. `NSAllowsLocalNetworking`) or use HTTPS.

## Changing the production URL

Edit the **Release** value of `INFOPLIST_KEY_SparrowsAPIBaseURL` in `project.pbxproj`, or change it under **Build Settings** for the **Release** configuration in Xcode.

---

The Calendar merges **admin events** from `GET /api/calendar-events` with **Google** events from `GET /api/google-calendar-ics`. Both use the same **SparrowsAPIBaseURL**.
