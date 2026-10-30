export type RepeatRule = "none" | "daily" | "weekly" | "monthly" | "custom";

/** The details the user fills in for an event. Dates are "YYYY-MM-DD", times are "HH:mm". */
export interface EventInput {
  title: string;
  /** The first day the event happens. Repeating events continue from here. */
  date: string;
  startTime: string;
  endTime: string;
  repeat: RepeatRule;
  /** For a "custom" repeat: the weekdays it happens on, 0–6 from Sunday like Date.getDay(), sorted. */
  repeatDays?: number[];
  /** For a "custom" repeat: it happens every this many weeks, counted from the week of `date`. */
  repeatInterval?: number;
}

/** An event as stored on the device. */
export interface CalendarEvent extends EventInput {
  /** The id on this device only. Other devices and the server use `clientId`. */
  id: number;
  /** The last day a repeating event happens. Missing means it repeats forever. */
  endDate?: string;
  /** Days a repeating event is skipped, because that day was deleted or changed on its own. */
  excludedDates?: string[];
  /** The id every device and the server know the event by. */
  clientId: string;
  /** The account the event belongs to, or "" for events made while signed out. */
  ownerUserId: string;
  /** When the event last changed, in ms. The newer copy wins when two devices change it. */
  updatedAt: number;
  /** Deleted events are kept as markers until the delete has synced. */
  deleted: boolean;
  /** Changed on this device and not yet saved to the server. */
  dirty: boolean;
}

/** Which days a change to a repeating event applies to. */
export type RepeatScope = "only-this" | "this-and-future";
