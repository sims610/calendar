export type RepeatRule = "none" | "daily" | "weekly" | "monthly";

/** An event as returned by the API. Dates are "YYYY-MM-DD", times are "HH:mm". */
export interface CalendarEvent {
  id: number;
  title: string;
  /** The first day the event happens. Repeating events continue from here. */
  date: string;
  startTime: string;
  endTime: string;
  repeat: RepeatRule;
}

export type EventInput = Omit<CalendarEvent, "id">;
