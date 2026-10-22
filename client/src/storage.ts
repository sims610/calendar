// Stores events on the device using IndexedDB, the browser's built-in database.
// Each event carries what's needed to sync it with an account later: an id shared across devices
// (clientId), who owns it, when it last changed, and whether it still has to be uploaded.
// Deleting keeps the event as a marker so the delete can sync too.

import { openDB, type DBSchema } from "idb";
import { addDays, fromDateKey } from "./dateUtils";
import type { CalendarEvent, EventInput, RepeatScope } from "./types";

interface CalendarDatabase extends DBSchema {
  events: {
    key: number;
    value: CalendarEvent;
  };
}

/** The owner of events made while signed out. Accounts aren't connected yet, so that's all of them. */
const SIGNED_OUT_OWNER = "";

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
  }
}

/** Every event that happens on the given day, including repeats. */
export async function getEventsForDay(date: string): Promise<CalendarEvent[]> {
  const database = await databasePromise;
  const allEvents = await database.getAll("events");
  return allEvents.filter(
    (event) => !event.deleted && event.ownerUserId === SIGNED_OUT_OWNER && occursOn(event, date),
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
  await database.add("events", newEvent(detailsOf(input), SIGNED_OUT_OWNER));
}

/** Just the details the user edits, without any of the repeat bookkeeping. */
function detailsOf(input: EventInput): EventInput {
  const { title, date, startTime, endTime, repeat } = input;
  return { title, date, startTime, endTime, repeat };
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
    transaction.store.add(newEvent({ ...detailsOf(input), repeat: "none" }, event.ownerUserId));
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
