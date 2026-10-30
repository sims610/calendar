// Stores events on the device using IndexedDB, the browser's built-in database.
// It's the working copy: the app reads and writes here, and sync.ts copies changes to and from
// the signed-in account in the background. Each event carries what that needs: an id shared
// across devices (clientId), who owns it, when it last changed, and whether it still has to be
// uploaded. Deleting keeps the event as a marker so the delete can sync too.

import { openDB, type DBSchema } from "idb";
import { getSavedAccount } from "./account";
import type { SyncedEvent } from "./api";
import { addDays, daysBetween, fromDateKey, startOfWeek } from "./dateUtils";
import type { CalendarEvent, EventInput, RepeatScope } from "./types";

interface CalendarDatabase extends DBSchema {
  events: {
    key: number;
    value: CalendarEvent;
  };
}

/** The owner of events made while signed out. */
const SIGNED_OUT_OWNER = "";

/** Whose events the app shows and saves: the signed-in user's, or the signed-out ones. */
function currentOwner(): string {
  return getSavedAccount()?.user.id ?? SIGNED_OUT_OWNER;
}

// Opened once and shared.
// Version 1 created the "events" store. Version 2 added the sync fields to every event.
const databasePromise = openDB<CalendarDatabase>("calendar", 2, {
  async upgrade(database, oldVersion, _newVersion, transaction) {
    if (oldVersion < 1) {
      database.createObjectStore("events", { keyPath: "id", autoIncrement: true });
    }
    if (oldVersion < 2) {
      // Events saved before syncing existed belong to whoever uses this device, and have
      // never been uploaded.
      let cursor = await transaction.objectStore("events").openCursor();
      while (cursor) {
        cursor.update({
          ...cursor.value,
          clientId: crypto.randomUUID(),
          ownerUserId: SIGNED_OUT_OWNER,
          updatedAt: Date.now(),
          deleted: false,
          dirty: true,
        });
        cursor = await cursor.continue();
      }
    }
  },
});

/** Returns true if the event happens on the given day ("YYYY-MM-DD"). */
function occursOn(event: CalendarEvent, dateKey: string): boolean {
  // Events never happen before their first day. "YYYY-MM-DD" strings sort like dates.
  if (dateKey < event.date) {
    return false;
  }
  if (event.endDate && dateKey > event.endDate) {
    return false;
  }
  if (event.excludedDates?.includes(dateKey)) {
    return false;
  }

  const firstDay = fromDateKey(event.date);
  const day = fromDateKey(dateKey);

  switch (event.repeat) {
    case "none":
      return dateKey === event.date;
    case "daily":
      return true;
    case "weekly":
      return day.getDay() === firstDay.getDay();
    case "monthly":
      return day.getDate() === firstDay.getDate();
    case "custom": {
      // The chosen weekdays, in every Nth week (starting on Sunday) from the week of the first day.
      const weeks = daysBetween(startOfWeek(event.date), startOfWeek(dateKey)) / 7;
      return Boolean(event.repeatDays?.includes(day.getDay())) && weeks % (event.repeatInterval ?? 1) === 0;
    }
  }
}

/** Every event that happens on the given day, including repeats. */
export async function getEventsForDay(date: string): Promise<CalendarEvent[]> {
  const owner = currentOwner();
  const database = await databasePromise;
  const allEvents = await database.getAll("events");
  return allEvents.filter(
    (event) => !event.deleted && event.ownerUserId === owner && occursOn(event, date),
  );
}

type SyncFields = "clientId" | "ownerUserId" | "updatedAt" | "deleted" | "dirty";

/** A brand-new event for `ownerUserId`. IndexedDB fills in the id because the store uses autoIncrement. */
function newEvent(details: Omit<CalendarEvent, SyncFields | "id">, ownerUserId: string): CalendarEvent {
  return {
    ...details,
    clientId: crypto.randomUUID(),
    ownerUserId,
    updatedAt: Date.now(),
    deleted: false,
    dirty: true,
  } as CalendarEvent;
}

/** The event with `changes` applied, marked as changed now and waiting to be uploaded. */
function changed(event: CalendarEvent, changes: Partial<CalendarEvent>): CalendarEvent {
  return { ...event, ...changes, updatedAt: Date.now(), dirty: true };
}

export async function createEvent(input: EventInput): Promise<void> {
  const database = await databasePromise;
  await database.add("events", newEvent(detailsOf(input), currentOwner()));
}

/**
 * Just the details the user edits, without any of the repeat bookkeeping. The custom days and
 * interval are cleared for other rules, so changing away from a custom repeat removes them.
 */
function detailsOf(input: EventInput): EventInput {
  const { title, date, startTime, endTime, repeat } = input;
  const isCustom = repeat === "custom";
  return {
    title,
    date,
    startTime,
    endTime,
    repeat,
    repeatDays: isCustom ? input.repeatDays : undefined,
    repeatInterval: isCustom ? input.repeatInterval : undefined,
  };
}

/**
 * Saves changes to the event on `occurrenceDate` (the day the user opened it from).
 *
 * - "only-this": the series skips that day, and the changed day is saved as its own event.
 * - "this-and-future": the series stops the day before, and a new series with the
 *   changes starts that day. Earlier days keep their old details.
 *
 * An event that doesn't repeat only happens on one day, so "this-and-future" simply updates it.
 */
export async function updateEvent(
  event: CalendarEvent,
  occurrenceDate: string,
  input: EventInput,
  scope: RepeatScope,
): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("events", "readwrite");
  const excludedDates = event.excludedDates ?? [];

  if (scope === "only-this") {
    transaction.store.put(changed(event, { excludedDates: [...excludedDates, occurrenceDate] }));
    transaction.store.add(newEvent(detailsOf({ ...input, repeat: "none" }), event.ownerUserId));
  } else if (occurrenceDate === event.date) {
    // Changing from the very first day changes the whole series.
    transaction.store.put(changed(event, detailsOf(input)));
  } else {
    transaction.store.put(
      changed(event, {
        endDate: addDays(occurrenceDate, -1),
        excludedDates: excludedDates.filter((date) => date < occurrenceDate),
      }),
    );
    transaction.store.add(
      newEvent(
        {
          ...detailsOf(input),
          endDate: event.endDate,
          excludedDates: excludedDates.filter((date) => date >= occurrenceDate),
        },
        event.ownerUserId,
      ),
    );
  }

  await transaction.done;
}

/**
 * Deletes the event on `occurrenceDate`. For a repeating event, "only-this" skips that
 * day and "this-and-future" ends the series the day before. Earlier days are kept.
 */
export async function deleteEvent(
  event: CalendarEvent,
  occurrenceDate: string,
  scope: RepeatScope,
): Promise<void> {
  const database = await databasePromise;

  if (scope === "only-this") {
    const excludedDates = [...(event.excludedDates ?? []), occurrenceDate];
    await database.put("events", changed(event, { excludedDates }));
  } else if (occurrenceDate === event.date) {
    // Deleting from the very first day deletes the whole series. It's kept as a marker
    // so the delete can reach the server.
    await database.put("events", changed(event, { deleted: true }));
  } else {
    await database.put("events", changed(event, { endDate: addDays(occurrenceDate, -1) }));
  }
}

// ---------- Syncing with an account ----------

/** How many events made while signed out are on this device. */
export async function countAnonymousEvents(): Promise<number> {
  const database = await databasePromise;
  const allEvents = await database.getAll("events");
  return allEvents.filter((event) => event.ownerUserId === SIGNED_OUT_OWNER && !event.deleted).length;
}

/**
 * Gives every event made while signed out to `userId`, so the next sync uploads them.
 * Deleted ones were never uploaded, so nothing needs to hear about them; they're removed.
 */
export async function claimAnonymousEvents(userId: string): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("events", "readwrite");
  let cursor = await transaction.store.openCursor();
  while (cursor) {
    const event = cursor.value;
    if (event.ownerUserId === SIGNED_OUT_OWNER) {
      if (event.deleted) {
        cursor.delete();
      } else {
        cursor.update({ ...event, ownerUserId: userId, dirty: true });
      }
    }
    cursor = await cursor.continue();
  }
  await transaction.done;
}

/** The user's events that changed on this device and haven't reached the server yet. */
export async function getDirtyEvents(userId: string): Promise<CalendarEvent[]> {
  const database = await databasePromise;
  const allEvents = await database.getAll("events");
  return allEvents.filter((event) => event.ownerUserId === userId && event.dirty);
}

/**
 * Saves events that came from the server. A local copy that changed more recently and hasn't been
 * uploaded yet is kept, since it wins once it reaches the server. Returns true if anything changed.
 */
export async function applyServerEvents(userId: string, serverEvents: SyncedEvent[]): Promise<boolean> {
  if (serverEvents.length === 0) {
    return false;
  }
  const database = await databasePromise;
  const transaction = database.transaction("events", "readwrite");
  const localByClientId = new Map<string, CalendarEvent>();
  for (const event of await transaction.store.getAll()) {
    if (event.ownerUserId === userId) {
      localByClientId.set(event.clientId, event);
    }
  }

  let changedAny = false;
  for (const serverEvent of serverEvents) {
    const local = localByClientId.get(serverEvent.clientId);
    if (local && local.dirty && local.updatedAt >= serverEvent.updatedAt) {
      continue;
    }
    if (local && !local.dirty && local.updatedAt === serverEvent.updatedAt) {
      // Already have this version, e.g. the one this device just uploaded.
      continue;
    }
    changedAny = true;
    if (serverEvent.deleted) {
      // The server keeps the marker, so the device doesn't have to.
      if (local) {
        transaction.store.delete(local.id);
      }
      continue;
    }
    const event = { ...serverEvent, ownerUserId: userId, dirty: false } as CalendarEvent;
    if (local) {
      transaction.store.put({ ...event, id: local.id });
    } else {
      // Leaving the id out lets IndexedDB pick one.
      transaction.store.add(event);
    }
  }
  await transaction.done;
  return changedAny;
}

/**
 * Marks events as saved on the server. One changed again while it was uploading is left dirty,
 * so the newer change goes up next time. Deleted ones are removed, now that the server knows.
 */
export async function markSynced(uploaded: CalendarEvent[]): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("events", "readwrite");
  for (const sent of uploaded) {
    const current = await transaction.store.get(sent.id);
    if (!current || current.updatedAt !== sent.updatedAt) {
      continue;
    }
    if (current.deleted) {
      transaction.store.delete(current.id);
    } else if (current.dirty) {
      transaction.store.put({ ...current, dirty: false });
    }
  }
  await transaction.done;
}

/** Removes the user's events from this device, after they sign out. Their account keeps them. */
export async function clearUserEvents(userId: string): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("events", "readwrite");
  let cursor = await transaction.store.openCursor();
  while (cursor) {
    if (cursor.value.ownerUserId === userId) {
      cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await transaction.done;
}
