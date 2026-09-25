// Stores events on the device using IndexedDB, the browser's built-in database.
// Nothing leaves the user's browser, so no server is needed.

import { openDB, type DBSchema } from "idb";
import { addDays, fromDateKey } from "./dateUtils";
import type { CalendarEvent, EventInput, RepeatScope } from "./types";

interface CalendarDatabase extends DBSchema {
  events: {
    key: number;
    value: CalendarEvent;
  };
}

// Opened once and shared. Creates the "events" store the first time the app runs.
const databasePromise = openDB<CalendarDatabase>("calendar", 1, {
  upgrade(database) {
    database.createObjectStore("events", { keyPath: "id", autoIncrement: true });
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
  return allEvents.filter((event) => occursOn(event, date));
}

export async function createEvent(input: EventInput): Promise<void> {
  const database = await databasePromise;
  // IndexedDB fills in the id because the store uses autoIncrement.
  await database.add("events", detailsOf(input) as CalendarEvent);
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
    transaction.store.put({ ...event, excludedDates: [...excludedDates, occurrenceDate] });
    transaction.store.add({ ...detailsOf(input), repeat: "none" } as CalendarEvent);
  } else if (occurrenceDate === event.date) {
    // Changing from the very first day changes the whole series.
    transaction.store.put({ ...event, ...detailsOf(input) });
  } else {
    transaction.store.put({
      ...event,
      endDate: addDays(occurrenceDate, -1),
      excludedDates: excludedDates.filter((date) => date < occurrenceDate),
    });
    transaction.store.add({
      ...detailsOf(input),
      endDate: event.endDate,
      excludedDates: excludedDates.filter((date) => date >= occurrenceDate),
    } as CalendarEvent);
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
    await database.put("events", { ...event, excludedDates });
  } else if (occurrenceDate === event.date) {
    // Deleting from the very first day deletes the whole series.
    await database.delete("events", event.id);
  } else {
    await database.put("events", { ...event, endDate: addDays(occurrenceDate, -1) });
  }
}
