import { timeToMinutes } from "./dateUtils";
import type { CalendarEvent } from "./types";

/** Where an event sits in the day view. */
export interface PositionedEvent {
  event: CalendarEvent;
  startMinutes: number;
  endMinutes: number;
  /** Which column the event is in when it overlaps others (0 = leftmost). */
  column: number;
  /** How many columns its group of overlapping events needs. */
  columnCount: number;
}

/**
 * Places events side by side when their times overlap.
 *
 * Events are sorted by start time and gathered into groups of overlapping events.
 * Inside a group, each event goes into the first column that is free at its
 * start time. Every event in the group then shares the group's width equally.
 */
export function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
  const sorted = events
    .map((event) => ({
      event,
      startMinutes: timeToMinutes(event.startTime),
      endMinutes: timeToMinutes(event.endTime),
      column: 0,
      columnCount: 1,
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);

  const result: PositionedEvent[] = [];
  let group: PositionedEvent[] = [];
  let groupEnd = 0;
  // columnEnds[i] is the time when column i becomes free again.
  let columnEnds: number[] = [];

  const finishGroup = () => {
    for (const item of group) {
      item.columnCount = columnEnds.length;
    }
    result.push(...group);
    group = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    // This event starts after everything in the group ends, so start a new group.
    if (group.length > 0 && item.startMinutes >= groupEnd) {
      finishGroup();
    }

    let column = columnEnds.findIndex((end) => end <= item.startMinutes);
    if (column === -1) {
      column = columnEnds.length;
    }
    columnEnds[column] = item.endMinutes;
    item.column = column;

    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMinutes);
  }
  finishGroup();

  return result;
}
