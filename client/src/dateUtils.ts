// Days are passed around as "YYYY-MM-DD" strings ("date keys") and times as "HH:mm".
// Using plain strings avoids time zone surprises.

import type { EventInput } from "./types";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES =["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(dateKey: string, days: number): string {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** "2026-08-11" → "Aug 11" */
export function formatMonthDay(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

/** "2026-08-11" → "Tue" */
export function formatWeekday(dateKey: string): string {
  return WEEKDAY_NAMES[fromDateKey(dateKey).getDay()];
}

/** The Sunday that starts the week `dateKey` is in. */
export function startOfWeek(dateKey: string): string {
  return addDays(dateKey, -fromDateKey(dateKey).getDay());
}

/** "2026-11-18" → "2026-11-01" */
export function startOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

/**
 * The same day `months` months later (or earlier, if negative). A day the target month doesn't
 * have becomes its last day, so Jan 31 + 1 month is Feb 28 (or 29).
 */
export function addMonths(dateKey: string, months: number): string {
  const date = fromDateKey(dateKey);
  const day = date.getDate();
  // Start from the 1st so setMonth can't spill into the month after.
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, daysInMonth));
  return toDateKey(date);
}

/** Days in a month grid: 6 full weeks starting on the Sunday on or before the 1st. */
export const MONTH_GRID_DAYS = 42;

/** The 42 days shown in the month grid for the month `dateKey` is in. */
export function monthGridDays(dateKey: string): string[] {
  const first = startOfWeek(startOfMonth(dateKey));
  return Array.from({ length: MONTH_GRID_DAYS }, (_, index) => addDays(first, index));
}

/** "2026-11-18" → "November 2026" */
export function formatMonthYear(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return `${FULL_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Whole days from `fromKey` to `toKey`. Rounding absorbs the hour a daylight saving change adds or removes. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((fromDateKey(toKey).getTime() - fromDateKey(fromKey).getTime()) / 86_400_000);
}

/** How often an event repeats, e.g. "Every week" or "Every 2 weeks on Mon, Wed". */
export function describeRepeat(event: EventInput): string {
  switch (event.repeat) {
    case "none":
      return "Does not repeat";
    case "daily":
      return "Every day";
    case "weekly":
      return "Every week";
    case "monthly":
      return "Every month";
    case "custom": {
      const interval = event.repeatInterval ?? 1;
      const days = (event.repeatDays ?? []).map((day) => WEEKDAY_NAMES[day]).join(", ");
      return `${interval === 1 ? "Every week" : `Every ${interval} weeks`} on ${days}`;
    }
  }
}

/** "13:30" → 810 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 810 → "13:30" */
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 13 → "1 PM" */
export function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

function splitTime(time: string): { clock: string; period: string } {
  const [hours, minutes] = time.split(":").map(Number);
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return {
    clock: `${displayHour}:${String(minutes).padStart(2, "0")}`,
    period: hours < 12 ? "AM" : "PM",
  };
}

/** 597 → "9:57" (no AM/PM, used by the current time line) */
export function formatClock(totalMinutes: number): string {
  return splitTime(minutesToTime(totalMinutes)).clock;
}

/** ("13:30", "14:30") → "1:30 – 2:30 PM";  ("11:00", "13:00") → "11:00 AM – 1:00 PM" */
export function formatTimeRange(startTime: string, endTime: string): string {
  const start = splitTime(startTime);
  const end = splitTime(endTime);

  if (start.period === end.period) {
    return `${start.clock} – ${end.clock} ${end.period}`;
  }
  return `${start.clock} ${start.period} – ${end.clock} ${end.period}`;
}
