# Push reminders: notify even when the app is closed

## Context
Reminders (`client/src/notifications.ts`) are timed with `setTimeout` in the page, so they only
fire while the app is running. Phones pause or kill backgrounded web apps, so "5 minutes before"
often doesn't show until the app is reopened. Now that the server has every signed-in user's
events (`syncEvents` in `server/src/database/database.ts`), the server can send the reminder as a
**Web Push** message, which the service worker shows even if the app is closed (Android, and iOS
16.4+ for home-screen apps — which the existing `isInstalledApp()` gate already requires).

Decisions:
- **Signed in → server push; signed out → existing local timers.** Signed-out events never reach
  the server, so local timers stay as the fallback. A device that registered for push turns its
  local timers off so reminders don't show twice.
- **The reminder choice stays per device.** It's stored with that device's push subscription,
  together with the device's time zone (event dates and times have no zone; the server needs one to
  know when "7:30" is).
- Work goes on the `notifications` branch, which isn't merged to `main` yet. Also include the
  already-edited header comment in `notifications.ts`.

## Server

**Dependency:** `npm i web-push` (+ `@types/web-push` dev) in `server/`.

**Config** — `server/src/config.js` gets a `push` section next to `db`:
`{ vapidPublicKey, vapidPrivateKey, subject: 'mailto:…' }`. Keys come from
`npx web-push generate-vapid-keys` (generate once; changing them invalidates every subscription).
Add the section to the local file by hand; it's gitignored.

**`src/database/database.ts`** — two tables added to `tableStatements`:
- `pushSubscriptions (id INT AUTO_INCREMENT PK, userId CHAR(36) FK users ON DELETE CASCADE,
  endpoint VARCHAR(767) UNIQUE, p256dh VARCHAR(255), auth VARCHAR(255), minutesBefore INT,
  timeZone VARCHAR(64))`. Keyed by endpoint, so one row per device, and re-registering just updates it.
- `pushRemindersSent (subscriptionId INT FK ON DELETE CASCADE, reminderKey VARCHAR(100),
  sentOn DATE, PRIMARY KEY (subscriptionId, reminderKey))`. `reminderKey` is the client's format,
  `clientId|date|startTime`, so moving an event gets a new reminder. Inserting before sending
  (`INSERT IGNORE`, then send only if a row was inserted) means no duplicate pushes, even if ECS
  runs more than one task.
- Functions: `savePushSubscription(userId, sub, minutesBefore, timeZone)` (upsert on endpoint),
  `deletePushSubscription(userId, endpoint)`, `getPushSubscriptions()`,
  `claimReminder(subscriptionId, key, date): Promise<boolean>`, `forgetOldReminders(beforeDate)`.
- Reuse `getEventsForDay(userId, date)`, which already expands repeats and skips
  deleted and excluded days.

**`src/routes/pushRouter.ts`** (new, same shape as `eventRouter.ts`: `docs` array plus
`authenticateToken`), mounted at `/api/push` in `src/service.ts` and added to `/api/docs`:
- `GET /api/push/key` → `{ publicKey }`. No auth. The client fetches it instead of needing a build variable.
- `PUT /api/push` `{ subscription, minutesBefore, timeZone }`: validates that minutesBefore is
  one of 0/5/15/30, the zone is valid (`Intl.supportedValuesOf('timeZone')` or try/catch
  `new Intl.DateTimeFormat(…, { timeZone })`), and the subscription has an endpoint and keys.
- `DELETE /api/push` `{ endpoint }`.

**`src/reminders.ts`** (new): the scheduler, started from `src/index.ts` after
`initializeDatabase()` with `setInterval(sendDueReminders, 60_000)`. Every minute, for each
subscription:
1. `today`/`tomorrow` in its zone: `new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)`.
2. For each event in `getEventsForDay` for both days: `startsAt = zonedTime(date, startTime, zone)`,
   `remindAt = startsAt - minutesBefore min`. Due when `remindAt <= now < tooLateAt`, with the same
   rule as the client (`startsAt`, or `startsAt + 60s` for "when it starts").
3. `claimReminder` → `webpush.sendNotification(sub, JSON.stringify({ title, body, tag }))`.
   Use the client's `formatTimeRange` text for the body (port the small helper).
   404 or 410 from the push service → delete the subscription (the device unsubscribed).
- `zonedTime(dateKey, "HH:mm", zone)`: no library. Guess the UTC time, measure the zone's offset
  at that instant with `Intl.DateTimeFormat(…).formatToParts`, correct, and repeat once for DST.
- Once a day, `forgetOldReminders(yesterday)`.
- Wrap each subscription in try/catch so one bad row doesn't stop the rest. Log failures.

## Client

**`client/public/notification-click.js`**: add a `push` listener that shows
`showNotification(data.title, { body, tag })`. Update the file's header comment, since it now holds both
handlers. The workbox `importScripts` in `vite.config.ts` stays as it is.

**`client/src/api.ts`**: `getPushKey()`, `savePushSubscription(token, subscription, minutesBefore, timeZone)`,
`deletePushSubscription(token, endpoint)`, using the existing `request()` helper.

**`client/src/notifications.ts`**:
- `registerPush()`: if signed in (`getSavedAccount()`), supported (`"PushManager" in window`),
  permission granted, and a reminder is chosen, call `registration.pushManager.subscribe({
  userVisibleOnly: true, applicationServerKey })` (reuse the existing subscription if there is one),
  then `api.savePushSubscription(…, Intl.DateTimeFormat().resolvedOptions().timeZone)`. On
  success, set a `pushRegistered` flag (localStorage plus a module variable, the same pattern as `currentReminder`).
  On failure (offline, server down), clear the flag so the local timers keep working.
- `unregisterPush()`: delete it on the server, `subscription.unsubscribe()`, and clear the flag.
- `saveReminder()`: after saving, call `registerPush()`, or `unregisterPush()` when "No notifications" is chosen.
- `startReminders()`: also call `registerPush()`. This refreshes the time zone and recovers from an expired
  subscription. Call it on `visibilitychange` too, at most once an hour.
- `scheduleReminders()`: add `!pushRegistered` to `enabled`.
- Rewrite the header comment to describe both paths.
- Drop the unused `date` parameter from `showReminder`.

**`client/src/App.tsx`**: call `registerPush()` after sign-in (next to `saveAccount`, ~line 132)
and `await unregisterPush()` in `signOut` before `api.signOut` / `clearAccount` (~line 153), while
the token is still valid. After either one, call `scheduleReminders()` so local timers switch on or off.

**`client/src/components/SettingsPage.tsx`**: no logic changes. Optionally add a note under the
options when signed out: "Sign in to get reminders even when Calendar is closed."

## CI and deploy
- `.github/workflows/ci.yml` "Write config file" step: add `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` env from secrets into a `push` section of the generated config.
- Add those three GitHub secrets (the user does this in repo settings).
- `server/Dockerfile` comment: config.js now also holds the push keys.
- README: document the new config section and how to generate the keys.

## Verification
1. `cd server && npx tsc --noEmit`; `cd client && npx tsc --noEmit`.
2. Local: add VAPID keys to `server/src/config.js`, run `npm run dev` in `server/`, then
   `npm run build && npx vite preview` in `client/`. Check that `/api/docs` lists the push routes and `GET /api/push/key` works.
3. In desktop Chrome, install the app from `localhost:4173` (Chrome allows this on localhost), sign
   in, and pick "5 minutes before". Check that a `pushSubscriptions` row exists with the right zone.
4. Add an event 7 minutes out, then **close the app window**. The notification should arrive about 5 minutes
   before the event, and clicking it opens the app. Confirm that `pushRemindersSent` has one row and that a
   second tick doesn't send it again.
5. Edit the event's time and check that a new reminder is sent for the new time. Choose "No notifications" and check
   that the row is deleted. Sign out and check that the row is deleted and local timers are back (repeat the earlier stubbed test while signed out).
6. Deploy, then repeat step 4 on a phone with the home-screen app closed (Android, and iOS 16.4+).
