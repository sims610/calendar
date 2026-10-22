# Move on-device events into the user's account on first sign-in

## Context
Events live only in the browser's IndexedDB (`client/src/storage.ts`, db "calendar", store
"events", auto-increment ids). The `backend` branch adds an Express + MySQL server (`server/`) with
users, sessions and events (to be deployed on AWS), but the client doesn't talk to it yet and has
no sign-in UI. Goal: when someone signs in on a device that has events, offer to add them to their
account, and from then on keep the device and server in sync.

Decisions made:
- **Offline-first**: IndexedDB stays the working copy; it syncs with the server in the background.
- **Push records**: the client applies edits locally (existing `storage.ts` logic) and uploads the
  resulting event records. The server upserts by a stable id; last write wins.
- **Ask first**: "Found N events on this device. Add them to your account?" — "Not now" leaves
  them on the device, hidden while signed in, and asks again on the next sign-in.

Key idea: migration *is* the first sync. Claiming anonymous events = giving them an owner and
marking them unsynced; the normal sync pushes them. No separate import endpoint.

## Data model
Every event gets sync fields (client `types.ts` and server `database.ts` mirror each other):
- `clientId` — UUID, the id shared across devices (local numeric `id` stays as the IndexedDB key).
- `ownerUserId` — `""` for events made while signed out, else the user's id.
- `updatedAt` — ms timestamp of the last local change (decides last-write-wins).
- `deleted` — tombstone, so deletes sync instead of vanishing.
- client only: `dirty` — changed locally and not yet confirmed by the server.

## Server (`server/`)
- `src/database/database.ts`
  - `events` table: add `clientId CHAR(36) NOT NULL`, `updatedAt BIGINT NOT NULL`,
    `deleted BOOLEAN NOT NULL DEFAULT FALSE`, `changedAt TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3)`, `UNIQUE (userId, clientId)`. `CREATE TABLE IF NOT EXISTS`
    won't alter an existing table — drop the dev `events` table once (nothing is in production yet).
  - `syncEvents(userId, events, since)`: in one transaction, `INSERT … ON DUPLICATE KEY UPDATE`
    each record, only overwriting when the incoming `updatedAt` is newer. Then return rows with
    `changedAt > since` plus the new cursor (server time, so client clocks don't matter for pulls).
    Retrying the same push is a no-op thanks to the unique key — safe if a migration is cut off.
  - `getEventsForDay`: also filter `deleted = FALSE`.
- `src/routes/eventRouter.ts`: `POST /api/event/sync` `{ events, since }` → `{ events, cursor }`,
  with docs entry. Validation reuses `readEventInput` and adds checks for `clientId`, `updatedAt`,
  `deleted`, `endDate` and `excludedDates`. Existing GET/POST/PUT/DELETE stay as-is.
- `src/service.ts`: raise `express.json({ limit })` (e.g. 1mb), and answer `OPTIONS` preflights
  with 204 — today they fall through to the 404 handler, which browsers reject for requests
  carrying `Authorization`.

## Client (`client/src/`)
- `types.ts`: add the sync fields to `CalendarEvent`.
- `storage.ts`
  - Open DB at version 2; upgrade backfills `clientId`, `ownerUserId: ""`, `updatedAt`,
    `deleted: false`, `dirty: true` on existing events.
  - Every write stamps `ownerUserId` (current user or `""`), `updatedAt`, `dirty: true`.
    The full delete in `deleteEvent` becomes a tombstone instead of `database.delete`.
  - `getEventsForDay` only returns non-deleted events of the current owner.
  - New helpers: `countAnonymousEvents()`, `claimAnonymousEvents(userId)` (one transaction),
    `getDirtyEvents(userId)`, `applyServerEvents(events)` (keeps the local copy if it's dirty and
    newer), `markSynced(clientIds)`, `clearUserEvents(userId)`.
- New `api.ts`: `fetch` wrapper using `import.meta.env.VITE_API_URL` and the saved token;
  `register`, `signIn`, `signOut`, `syncEvents`.
- New `account.ts`: saves `{ user, token }` and the sync cursor in localStorage (same pattern as
  `theme.ts`).
- New `sync.ts`: push dirty events in chunks (~200), apply what comes back, `markSynced` only after
  the server responds. Runs on app start, after each local write, and on the `online` event.
  Failures are silent and retried later — the app keeps working offline.
- New `components/HomePage.tsx`, wired to the Home tab (`BottomNav.tsx`: add `"home"` to `Page`
  and `page: "home"` on the Home tab; `App.tsx` renders it like `SettingsPage`). The app still
  opens on Calendar — signing in is optional.
  - Signed out: welcome card with sign in / create account (toggle between the two forms).
  - Signed in: "Signed in as <name>" placeholder, room for a future dashboard (today's agenda).
- `components/SettingsPage.tsx`: small "Account" section — signed-in name + sign out, or a
  "Sign in on Home" link when signed out. Sign out syncs, then clears that user's local events.
- New `components/MigratePrompt.tsx` (bottom sheet like `RepeatChoiceSheet`): after sign-in, if
  `countAnonymousEvents() > 0` → "Found N events on this device. Add them to your account?"
  - **Add** → `claimAnonymousEvents(user.id)` then sync.
  - **Not now** → nothing changes; they stay hidden while signed in and reappear when signed out.
    Asked again on the next sign-in.
- `App.tsx`: hold the signed-in user, show `MigratePrompt`, call sync after saves, reload events
  when a sync brings in changes.

## Order — backend and frontend stay disconnected until the backend deploys via CI
The client must not call the server until the backend is building and deploying through CI to
AWS. Nothing in phases 1–2 makes the client talk to the server.

**Phase 1 — backend only (shippable on its own)**
1. Server: schema changes + `/api/event/sync` + OPTIONS/body-limit fixes. Test with curl.
2. CI: add a server job (`npm ci && npm run build` in `server/`) alongside the existing client
   job in `.github/workflows/ci.yml`, then the AWS deploy step. Today CI only builds the client
   and deploys it to GitHub Pages. (AWS target details — EC2/ECS/Beanstalk, RDS — to decide then.)
3. Confirm the deployed API answers (`GET /api/docs`, register/login, sync) over HTTPS.

**Phase 2 — frontend changes that don't touch the network**
4. Sync fields + IndexedDB v2 upgrade + tombstones. The app behaves exactly as it does today.
5. Home page wired to the Home tab, showing a sign-in/register form that isn't connected yet
   (hidden or marked "coming soon" until phase 3), plus the account section in Settings.

**Phase 3 — connect (only after phase 1 is deployed and verified)**
6. `api.ts` + `account.ts` with `VITE_API_URL` pointing at the deployed API; turn on the forms.
7. `sync.ts` + `MigratePrompt` wiring.
8. README: update "How data is stored".

## Verification
- `npm run build` in root (client) and `server/`.
- Server: curl `/api/event/sync` twice with the same body → one row per `clientId` in MySQL;
  an older `updatedAt` doesn't overwrite a newer one.
- End to end (MySQL + `server npm run dev` + client `npm run dev`):
  1. Signed out, create a few events incl. a repeating one with an "only this" edit.
  2. Sign in → prompt shows the right count. "Not now" → events hidden; sign out → they're back;
     sign in again → asked again.
  3. "Add" → rows appear in MySQL with endDate/excludedDates intact; events still show.
  4. Turn the network off mid-sync (DevTools offline), then back on → no duplicate rows.
  5. Second browser profile, same account → sees the events; edit offline there, reconnect →
     change appears in the first profile after its next sync.
  6. Sign in as a different user on the first profile → no prompt for the first user's events.
