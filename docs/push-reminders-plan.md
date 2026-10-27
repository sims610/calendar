# Push reminders: notify even when the app is closed

## Context
Reminders (`client/src/notifications.ts`) are timed with `setTimeout` in the page, so they only
fire while the app is running. Phones pause or kill backgrounded web apps, so "5 minutes before"
often doesn't show until the app is reopened. Now that the server has every signed-in user's
events (`syncEvents` in `server/src/database/database.ts`), the server can send the reminder as a
**Web Push** message, which the service worker shows even if the app is closed (Android, and iOS
16.4+ for home-screen apps — which the existing `isInstalledApp()` gate already requires).

Decisions:
- **Only offer notifications when they'll arrive with the app closed.** It's better for people to
  know they won't be notified than to expect a reminder that never comes. Notifications are
  offered only when the app is installed, the browser supports push (`"PushManager" in window`),
  and the user is signed in. Otherwise Settings explains why instead of showing the options.
- **No local timers.** Every reminder is sent by the server as a push. The in-page `setTimeout`
  reminders are removed. Signed-out events never reach the server, so signed-out users get no
  reminders, and Settings tells them to sign in.
- **The reminder choice stays per device.** It's kept in localStorage and stored with that device's
  push subscription, together with the device's time zone (event dates and times have no zone; the
  server needs one to know when "7:30" is). Signing out unregisters the subscription but keeps the
  choice, so signing back in registers it again.
- Events made offline get their reminder once they sync, which happens when the connection comes back.
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
   rule the client used (`startsAt`, or `startsAt + 60s` for "when it starts").
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
- Remove the local timers: `timers`, `scheduleRun`, `getSentKeys`/`markSent`, `SENT_STORAGE_KEY`,
  `startTimeOn`, `showReminder`, `AT_START_GRACE_MS`, and `scheduleReminders`, plus the imports only
  they used. Remove the stale `remindersSent` localStorage key once on startup.
- `pushSupported()`: `notificationsSupported() && "PushManager" in window`.
- `registerPush(): Promise<boolean>`: if signed in (`getSavedAccount()`), `pushSupported()`,
  permission granted, and a reminder is chosen, reuse the existing subscription
  (`pushManager.getSubscription()`) or create one with `pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey })` (key from `api.getPushKey()`). Then call
  `api.savePushSubscription(…, Intl.DateTimeFormat().resolvedOptions().timeZone)`. Returns whether it worked.
- `unregisterPush()`: delete the subscription on the server (best effort), then `subscription.unsubscribe()`.
- `saveReminder(option)` returns `"ok" | "blocked" | "failed"`:
  - "No notifications": `unregisterPush()`, save the choice, `"ok"`.
  - Otherwise: request permission (`"blocked"` if denied), then `registerPush()` with the new
    choice. Save it only if that worked. On failure return `"failed"` and keep the previous
    choice, so Settings never shows a reminder the server doesn't know about.
- `startReminders()`: call `registerPush()` on startup and on `visibilitychange` (at most once an
  hour). This refreshes the time zone and recovers from an expired subscription. Failures are
  silent, since the server keeps the last good registration.
- Rewrite the header comment: reminders are sent by the server as push messages, so they arrive with
  the app closed, and they need the installed app, sign-in, and push support.

**`client/src/App.tsx`**:
- Remove the `scheduleReminders` import and its call (and comment) in `loadEvents`. The server
  reads the events itself.
- Call `registerPush()` after sign-in (next to `saveAccount`, ~line 132).
- `await unregisterPush()` in `signOut` before `api.signOut` / `clearAccount` (~line 159), while the
  token is still valid.

**`client/src/components/SettingsPage.tsx`**:
- Pass `account` to `NotificationSettings`.
- `notificationsUnavailableReason(signedIn)`, checked in this order:
  1. `!pushSupported()` → "This browser can't send notifications when Calendar is closed."
  2. `!isInstalledApp()` → the existing "Add Calendar to your home screen…" message.
  3. `!signedIn` → "Sign in to get notified before your events, even when Calendar is closed."
- The initial selection shows "No notifications" unless signed in and permission is granted.
- On `"failed"`, show "Couldn't turn on notifications. Check your connection and try again."
  `"blocked"` keeps the existing message.

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
3. In a browser tab (not installed), Settings shows the "Add to home screen" message.
4. In desktop Chrome, install the app from `localhost:4173` (Chrome allows this on localhost). While
   signed out, Settings shows the sign-in message and no options.
5. Sign in and pick "5 minutes before". Check that a `pushSubscriptions` row exists with the right zone.
6. Add an event 7 minutes out, then **close the app window**. The notification should arrive about 5 minutes
   before the event, and clicking it opens the app. Confirm that `pushRemindersSent` has one row and that a
   second tick doesn't send it again.
7. Edit the event's time and check that a new reminder is sent for the new time.
8. Stop the server and pick "15 minutes before". The "Couldn't turn on" message shows and the selection
   stays on 5. Start the server again.
9. Choose "No notifications" and check that the row is deleted. Pick a reminder again, sign out, and check
   that the row is deleted and Settings shows the sign-in message. Sign back in and check that the row
   comes back with the saved choice.
10. Deploy, then repeat step 6 on a phone with the home-screen app closed (Android, and iOS 16.4+).
