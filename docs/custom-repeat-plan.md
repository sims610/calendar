# Custom repeat: chosen weekdays, every N weeks

## Context
Events can repeat `none`, `daily`, `weekly` or `monthly` (`RepeatRule` in `client/src/types.ts`,
`occursOn` in `client/src/storage.ts`, and the SQL in `getEventsForDay` in
`server/src/database/database.ts`). People also want patterns like "Mon, Wed and Fri" or "Tue and
Thu every other week".

Decisions:
- **Add a 5th rule, `"custom"`, and leave the four existing rules alone.** Every existing event and
  query stays the same. A custom event also stores:
  - `repeatDays: number[]`: weekdays 0–6 (Sun–Sat, the same numbering as `Date.getDay()`), sorted,
    at least one.
  - `repeatInterval: number`: repeat every N weeks, from 1 to 52.
- **When it happens:** a day counts if all of these are true:
  - It passes the checks `occursOn` already does (on or after `date`, on or before `endDate`, not in
    `excludedDates`).
  - Its weekday is in `repeatDays`.
  - The number of weeks between the start of `date`'s week and the start of that day's week is a
    multiple of `repeatInterval`.

  Weeks start on Sunday. If `date` itself isn't one of the chosen days, the event first shows on the
  next chosen day.
- **"This and future" edits still work.** They start a new series on `occurrenceDate`, which is
  always in an "on" week. The new series lines up with the old one, so no extra handling is needed.

## Client
1. **`types.ts`**: add `"custom"` to `RepeatRule`. Add optional `repeatDays?` and `repeatInterval?`
   to `EventInput`.
2. **`storage.ts`**:
   - Add a `case "custom"` to `occursOn` for the rule above.
   - `detailsOf` passes the two new fields through.
   - The `only-this` branch of `updateEvent` already sets `repeat: "none"`. It also needs to clear
     the new fields.
   - The IndexedDB version doesn't need to change because the fields are optional.
3. **`EventForm.tsx`**:
   - Add `{ value: "custom", label: "Custom…" }` to `REPEAT_OPTIONS`.
   - When Custom is chosen, show an "Every [ n ] week(s)" number input and a row of 7 day buttons
     (S M T W T F S, using `aria-pressed`).
   - When the user switches to Custom, select `date`'s weekday by default, with interval 1.
   - Validation: at least one day, and an interval from 1 to 52.
   - In `allowOnlyThis`, also compare days and interval, so a change to the pattern can't be saved
     for a single day.
4. **`App.tsx`**: copy `repeatDays` and `repeatInterval` into the form values when editing an event.
5. **`DayView.tsx`**: the tooltip currently uses the raw rule (`Repeats ${event.repeat}`). Replace it
   with a small `describeRepeat()` that returns text like "Every 2 weeks on Mon, Wed". It could go
   in `dateUtils.ts`.
6. **`api.ts`**: add the fields to `SyncedEvent`.
7. **`styles.css`**: styles for the day buttons.

## Server
1. **`database.ts`**:
   - Add the type and `repeatRules` entry.
   - Add `repeatDays JSON NULL` and `repeatInterval TINYINT NULL` columns, and add `'custom'` to the
     `repeatRule` ENUM.
   - **Migration:** there's no migration step yet. Tables only use `CREATE TABLE IF NOT EXISTS`, so
     databases that already exist won't get the new columns. Add a small `ALTER TABLE` step to
     `initializeDatabase` that only runs when the columns are missing (it checks
     `information_schema.COLUMNS`). It also `MODIFY`s the ENUM.
   - Update `eventColumns`, `toEvent`, `insertEvent`, the `UPDATE` in `updateEvent`, and the sync
     upsert (each new column gets the same `IF(incoming.updatedAt > …)` treatment).
   - Add this branch to the `getEventsForDay` SQL (it also covers push reminders through
     `reminders.ts`):
     ```sql
     OR (repeatRule = 'custom'
         AND JSON_CONTAINS(repeatDays, CAST(DAYOFWEEK(?) - 1 AS JSON))
         AND MOD(DATEDIFF(DATE_SUB(?, INTERVAL DAYOFWEEK(?) - 1 DAY),
                          DATE_SUB(date, INTERVAL DAYOFWEEK(date) - 1 DAY)) DIV 7,
                 repeatInterval) = 0)
     ```
2. **`eventRouter.ts`**: `readEventInput` requires valid `repeatDays` and `repeatInterval` when
   `repeat === 'custom'`, and drops them for other rules. Also update the doc examples and the error
   message.

## Compatibility
An older client that hasn't updated yet and syncs a `"custom"` event will fall through its
`occursOn` switch and not show the event. It won't break anything, and the PWA update prompt fixes
it. Bump `version.json`.

## Testing
The project has no test setup, so check by hand:
- Mon/Wed/Fri every week.
- Tue/Thu every 2 weeks, starting on a Wednesday (the first occurrence should be Thursday).
- "Only this day" and "this and future" edits, delete, and drag-moving a custom event.
- Syncing between two devices.
- `GET /api/event?date=` returns the same days as the client does.
