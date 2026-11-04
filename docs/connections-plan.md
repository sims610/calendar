# User connections: request by email, view each other's calendars

## Context
Each account can only see its own events. People want to connect with someone and see that person's
calendar: enter their email, see "Pending", and become connected once the other person accepts.
The app already has a disabled **People** tab (`client/src/components/BottomNav.tsx:16`) for this.

Decisions:
- **Connections are mutual and view-only.** Accepting lets both people see each other's events. Only
  the owner can change an event.
- **A connection shares all of a person's events.** Events belong directly to a user and there is no
  calendars table, so there's nothing smaller to share. Per-event privacy is out of scope.
- **An email with no account gets an error** ("No account with that email") and no request is made.
  Registration's 409 already reveals which emails are taken, so this exposes nothing new. Storing
  requests for unregistered emails would be unsafe: emails aren't verified, so anyone could register
  that address and accept.
- **Shared events are overlaid on the day view**, marked with the person's name, with a show/hide
  switch per person on the People page.
- **Shared events stay in memory and are not saved to IndexedDB.** This keeps them out of the sync
  and upload code and leaves nothing on the device after sign-out. The trade-off is that offline, or
  until the first fetch finishes, you only see your own events.
- **Requests appear in the app only**, as a badge on the People tab, refreshed at the moments the app
  already syncs. There's no email sending, and push notifications for requests are left for later.

## Server
1. **`server/src/database/database.ts`**: add a `connections` table to `tableStatements`. A new table
   needs no `ALTER` step.
   ```sql
   CREATE TABLE IF NOT EXISTS connections (
     id CHAR(36) PRIMARY KEY,
     requesterId CHAR(36) NOT NULL,
     addresseeId CHAR(36) NOT NULL,
     pairKey CHAR(73) NOT NULL UNIQUE,  -- the two user ids sorted and joined, so A→B and B→A collide
     status ENUM('pending', 'accepted') NOT NULL,
     createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     FOREIGN KEY (requesterId) REFERENCES users(id) ON DELETE CASCADE,
     FOREIGN KEY (addresseeId) REFERENCES users(id) ON DELETE CASCADE,
     INDEX (addresseeId, status)
   )
   ```
   Rows use user ids, not emails, so changing an email doesn't break a connection. Declining,
   cancelling and removing all delete the row, so the people can connect again later.

   New functions, written in the same style as the rest of the file:
   - `getUserByEmail(email)`, using the existing `normalizeEmail` (`database.ts:178`).
   - `createConnectionRequest`, returning `null` on `ER_DUP_ENTRY`, as `addUser` does.
   - `getConnections(userId)`, returning each row with the other person's `id`, `name` and `email`.
   - `acceptConnection(id, userId)`, which only updates when `addresseeId = userId` and the status is
     `pending`.
   - `deleteConnection(id, userId)`, which only deletes when the user is on either side.
   - `getSharedEvents(userId)`, returning non-deleted events of accepted connections, joined through
     `connections`, with `ownerUserId` added.

   **Leave `getEventsForDay` unchanged.** The reminder loop uses it (`reminders.ts:153`), and adding
   shared events there would send people reminders for someone else's events.

2. **`server/src/routes/connectionRouter.ts`** (new): follows `eventRouter.ts`, with
   `authenticateToken` on the router, a `docs` array, and hand-written validation. The current user
   always comes from `req.user!.id`.

   | Endpoint | Behaviour |
   |---|---|
   | `GET /api/connection` | Lists your connections with `status` and `direction` (`incoming`/`outgoing`) |
   | `GET /api/connection/events` | Events of accepted connections; never includes deleted rows |
   | `POST /api/connection` `{email}` | 201 with status pending. 400 for a blank email or your own, 404 for no account, 409 if already requested or connected |
   | `PUT /api/connection/:id/accept` | Addressee only. 404 for anyone else, matching how `withEvent` hides other users' rows |
   | `DELETE /api/connection/:id` | Either person: decline, cancel or remove |

   If the other person already sent you a pending request, `POST` accepts that request instead of
   returning 409, since both people clearly want to connect.

3. **`server/src/service.ts`**: register the router (`:36`) and add its docs to `/api/docs` (`:40`).
   CORS already allows `PUT` and `DELETE`.

## Client
1. **`api.ts`**: add `Connection` and `SharedEvent` types, plus `getConnections`,
   `requestConnection`, `acceptConnection`, `deleteConnection` and `getSharedEvents`, using the
   existing `request` helper.
2. **`storage.ts`**: export `occursOn` (`:55`) and narrow its parameter to the fields it reads, so
   shared events use the same repeat logic.
3. **`App.tsx`**:
   - Hold `connections` and `sharedEvents` in state, and derive the day's shared events with
     `occursOn`.
   - Refresh them in `syncInBackground` (start, back online, app visible), whenever a connection
     changes, and when the People page opens. If a refresh fails, keep the last result.
   - Clear them when the account changes or on sign-out, and ignore a response that arrives after
     the account changed.
   - Add a `page === "people"` branch next to the settings one (`:274`).
   - Keep shared events out of `FormState`, so they can never reach `EventForm` or local storage.
4. **`components/BottomNav.tsx`**: add `"people"` to `Page`, set the tab's `page`, and add a
   `pendingCount` prop that shows a badge for incoming requests.
5. **`components/PeoplePage.tsx`** (new): uses the `.settings` page shell and `ProfilePage`'s form
   conventions (`errorMessage()`, `.form-error`, a `submitting` state). Signed-out users get a prompt
   to sign in. Sections:
   - **Add someone:** email input and Send. On success the person appears under Sent as Pending.
   - **Requests:** name and email, with Accept and Decline.
   - **Sent:** name and email, a **Pending** badge, and Cancel.
   - **Connected:** name and email, a "Show on calendar" switch, and Remove (with `window.confirm`).

   The show/hide choices are saved per device in localStorage, keyed by the signed-in user. Everyone
   is shown by default.
6. **`components/DayView.tsx`, `layoutEvents.ts`**:
   - Take a `sharedEvents` prop and lay out both lists together, so overlaps get columns. Make
     `layoutEvents` generic over the fields it reads.
   - Shared blocks use a `shared-${clientId}` key, since `CalendarEvent.id` is local to the device.
     They get no drag handlers, and tapping one calls `onSharedEventClick`.
   - Shared blocks show the owner's name and have a dashed border, so they can't be mistaken for your
     own event of the same color. Add `colorForPerson(userId)` to `eventColors.ts`.
7. **`components/SharedEventSheet.tsx`** (new): a read-only sheet modeled on `MigratePrompt`, showing
   title, owner, date and time, `describeRepeat`, and Close.
8. **`styles.css`**: the badge, the Pending label, connection rows, button padding for those rows
   (`.button-primary` only sets colors), and `.event-block.shared`.

Leave the "Connected calendars / Coming soon" section in Settings as it is, since it may be better
suited to external calendars such as Google.

## Compatibility
Nothing existing changes shape. Older clients ignore the new endpoints and keep working until the PWA
update prompt updates them. Bump `version.json`.

## Order
1. Server: table, database functions, router. Check it with `curl`.
2. People page and API client: the full request flow, without calendar changes.
3. Overlay: fetching, `DayView`, read-only sheet, show/hide switches.

## Testing
The project has no test setup, so check by hand. Run the client's `npm run build`, and `npx tsc
--noEmit` in `server/`, because CI only type-checks the server during the Docker build. Then run the
app with two accounts, A and B.

Request flow:
- A sends to B: A sees Pending, and B sees a People badge and the request after refreshing.
- B accepts: both show Connected, and each sees the other's events on the day view.
- Decline, cancel and remove each clear both sides, and A can send a new request afterwards.
- Errors: unknown email, your own email, a duplicate request, and an email typed in a different case
  or with extra spaces.
- A and B request each other: the second request connects them.

Access:
- With `curl`, a third account C can't accept or delete A and B's connection (404).
- A pending connection shows no events through `GET /api/connection/events`.
- After removal, the events are gone from both calendars on the next refresh.

Display:
- Tapping a shared event opens the read-only sheet, and long-pressing it doesn't start a drag.
- Your own events still edit and drag normally.
- Overlapping events from both people sit in columns.
- Daily, weekly, monthly and custom repeats show correctly, and an event B deletes disappears.
- Hiding a person removes their events, and the choice survives a reload.
- Signing out or switching account removes shared events immediately.
- Going offline leaves your own events working.
- With a push reminder set, A gets none for B's events.

## Known limits
- Nothing is rate limited in this app, so a signed-in user could use the request form to check which
  emails have accounts, or send repeated requests. Registration already allows the first of these.
- New requests and shared-event changes only appear at the next refresh, not live.
