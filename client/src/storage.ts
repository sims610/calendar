// Stores events on the device using IndexedDB, the browser's built-in database.
// Nothing leaves the user's browser, so no server is needed.

import { openDB, type DBSchema } from "idb";
import { fromDateKey } from "./dateUtils";
import type { CalendarEvent, EventInput } from "./types";

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
  await database.add("events", { ...input } as CalendarEvent);
}

/** Updates an event (the whole series if it repeats). */
export async function updateEvent(id: number, input: EventInput): Promise<void> {
  const database = await databasePromise;
  await database.put("events", { ...input, id });
}

/** Deletes an event (the whole series if it repeats). */
export async function deleteEvent(id: number): Promise<void> {
  const database = await databasePromise;
  await database.delete("events", id);
}
