export type RepeatRule = "none" | "daily" | "weekly" | "monthly";

/** The details the user fills in for an event. Dates are "YYYY-MM-DD", times are "HH:mm". */
export interface EventInput {
  title: string;
  /** The first day the event happens. Repeating events continue from here. */
  date: string;
  startTime: string;
  endTime: string;
  repeat: RepeatRule;
}

/** An event as stored on the device. */
export interface CalendarEvent extends EventInput {
  id: number;
  /** The last day a repeating event happens. Missing means it repeats forever. */
  endDate?: string;
  /** Days a repeating event is skipped, because that day was deleted or changed on its own. */
  excludedDates?: string[];
}

/** Which days a change to a repeating event applies to. */
export type RepeatScope = "only-this" | "this-and-future";
