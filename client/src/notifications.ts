// Event reminders, chosen in Settings. Only offered in the installed app: phones only allow
// notifications from web apps added to the home screen.
//
// Reminders are timed on the device, from the events saved here (including ones synced from other
// devices), so they only fire while the app is running. Notifications go through the service
// worker, because Android doesn't allow pages to show them directly. Reminders that came due while
// the app was asleep still show when it wakes, as long as the event hasn't started yet.

import * as storage from "./storage";
import { addDays, formatTimeRange, fromDateKey, timeToMinutes, todayKey } from "./dateUtils";
import type { CalendarEvent } from "./types";

export interface ReminderOption {
  id: string;
  name: string;
  /** How long before the event starts to remind, or null for no reminders. */
  minutesBefore: number | null;
}

export const REMINDER_OPTIONS: ReminderOption[] = [
  { id: "none", name: "No notifications", minutesBefore: null },
  { id: "at-start", name: "When the event starts", minutesBefore: 0 },
  { id: "5", name: "5 minutes before", minutesBefore: 5 },
  { id: "15", name: "15 minutes before", minutesBefore: 15 },
  { id: "30", name: "30 minutes before", minutesBefore: 30 },
];

const NO_REMINDERS = REMINDER_OPTIONS[0];
const STORAGE_KEY = "reminder";
const SENT_STORAGE_KEY = "remindersSent";

/** A reminder that's late by less than this still shows when the event starts. */
const AT_START_GRACE_MS = 60 * 1000;

/** True when running as the app added to the home screen, not in a browser tab. */
export function isInstalledApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Older iPhones only report it this way.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** True when this browser can show notifications from a web app at all. */
export function notificationsSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator;
}

/** The saved choice, or no reminders if none is saved (or storage can't be read). */
export function getSavedReminder(): ReminderOption {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return REMINDER_OPTIONS.find((option) => option.id === id) ?? NO_REMINDERS;
  } catch {
    return NO_REMINDERS;
  }
}

/** The choice in use, kept here too in case it couldn't be saved. */
let currentReminder = getSavedReminder();

/**
 * Remembers the choice and times reminders for it. Turning reminders on asks for permission
 * first, so this must be called from a tap. Returns false if the user didn't allow
 * notifications, in which case nothing changes.
 */
export async function saveReminder(option: ReminderOption): Promise<boolean> {
  if (option.minutesBefore !== null && (await Notification.requestPermission()) !== "granted") {
    return false;
  }
  currentReminder = option;
  try {
    localStorage.setItem(STORAGE_KEY, option.id);
  } catch {
    // Reminders still work while the app stays open; the choice just won't be remembered.
  }
  scheduleReminders();
  return true;
}

let timers: number[] = [];
/** Goes up on every call to scheduleReminders, so an older call still loading events gives up. */
let scheduleRun = 0;

/** Every reminder already shown, as "clientId|date|startTime", so none shows twice. */
function getSentKeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SENT_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function markSent(key: string) {
  // Only today's and later reminders can come up again, so forget older ones.
  const today = todayKey();
  const keys = getSentKeys().filter((sent) => sent.split("|")[1] >= today);
  try {
    localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify([...keys, key]));
  } catch {
    // At worst the reminder shows again after the app restarts.
  }
}

/** When the event starts on `date`, in ms. */
function startTimeOn(event: CalendarEvent, date: string): number {
  return fromDateKey(date).getTime() + timeToMinutes(event.startTime) * 60 * 1000;
}

async function showReminder(event: CalendarEvent, date: string, key: string) {
  markSent(key);
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(event.title || "(No title)", {
    body: formatTimeRange(event.startTime, event.endTime),
    // Replaces an earlier notification for the same event instead of stacking up.
    tag: key,
  });
}

/**
 * Times a notification for every event today and tomorrow, replacing any timed before.
 * Call it whenever events or the setting change. It also runs on its own each midnight and
 * when the app comes back to the front, since phones pause timers while the app is hidden.
 */
export async function scheduleReminders() {
  const run = ++scheduleRun;
  const { minutesBefore } = currentReminder;
  const enabled =
    minutesBefore !== null &&
    isInstalledApp() &&
    notificationsSupported() &&
    Notification.permission === "granted";

  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const days = enabled ? [today, tomorrow] : [];
  const eventsByDay = await Promise.all(
    days.map((date) => storage.getEventsForDay(date).catch(() => [] as CalendarEvent[])),
  );
  if (run !== scheduleRun) {
    return;
  }

  timers.forEach((timer) => clearTimeout(timer));
  timers = [];
  if (!enabled || minutesBefore === null) {
    return;
  }

  const sentKeys = getSentKeys();
  const now = Date.now();

  days.forEach((date, index) => {
    for (const event of eventsByDay[index]) {
      const key = `${event.clientId}|${date}|${event.startTime}`;
      const startsAt = startTimeOn(event, date);
      const remindAt = startsAt - minutesBefore * 60 * 1000;
      // Late reminders still show until the event starts, or just after for "when it starts".
      const tooLateAt = minutesBefore === 0 ? startsAt + AT_START_GRACE_MS : startsAt;

      if (sentKeys.includes(key) || now >= tooLateAt) {
        continue;
      }
      timers.push(
        window.setTimeout(() => showReminder(event, date, key), Math.max(remindAt - now, 0)),
      );
    }
  });

  // Tomorrow's reminders were timed above; just after midnight, time the day after's.
  const nextMidnight = fromDateKey(tomorrow).getTime();
  timers.push(window.setTimeout(scheduleReminders, nextMidnight - now + 1000));
}

/** Times reminders now and keeps them up to date while the app runs. Call once on startup. */
export function startReminders() {
  scheduleReminders();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleReminders();
    }
  });
}
