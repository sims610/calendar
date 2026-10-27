// Sends event reminders as Web Push messages, so they arrive even when the app is closed.
// Every minute, each device's events for today and tomorrow (in the device's time zone) are
// checked, and any reminder that's due is sent once.

import webpush from 'web-push';
import appConfig from './config.js';
import {
  claimReminder,
  deletePushSubscription,
  forgetOldReminders,
  getEventsForDay,
  getPushSubscriptions,
} from './database/database.ts';
import type { CalendarEvent, PushSubscriptionRow } from './database/database.ts';

interface PushConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  /** Who push services contact about problems, as "mailto:…" or a URL. */
  subject: string;
}

/** The VAPID keys from config.js, or undefined when the push section hasn't been added. */
export const pushConfig = (appConfig as { push?: PushConfig }).push;

/** A reminder that's late by less than this still goes out when the event starts. */
const atStartGraceMs = 60 * 1000;

/** "YYYY-MM-DD" for the instant `ms`, in the time zone. */
function dateKeyIn(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(ms);
}

/** Returns "YYYY-MM-DD" moved by `amount` days. */
function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** How far ahead of UTC the time zone's clocks are at the instant `ms`. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(ms);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wallClock - Math.floor(ms / 1000) * 1000;
}

/** The instant, in ms, when clocks in the time zone show "HH:mm" on "YYYY-MM-DD". */
export function zonedTime(dateKey: string, time: string, timeZone: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes);
  // Guess using the offset at the wall-clock time read as UTC, then check again in case
  // the guess landed on the other side of a daylight saving change.
  const guess = wallClock - zoneOffsetMs(wallClock, timeZone);
  return wallClock - zoneOffsetMs(guess, timeZone);
}

/** "13:30" → { clock: "1:30", period: "PM" } */
function splitTime(time: string): { clock: string; period: string } {
  const [hours, minutes] = time.split(':').map(Number);
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return {
    clock: `${displayHour}:${String(minutes).padStart(2, '0')}`,
    period: hours < 12 ? 'AM' : 'PM',
  };
}

/** ("13:30", "14:30") → "1:30 – 2:30 PM";  ("11:00", "13:00") → "11:00 AM – 1:00 PM". Same as the client's. */
function formatTimeRange(startTime: string, endTime: string): string {
  const start = splitTime(startTime);
  const end = splitTime(endTime);
  if (start.period === end.period) {
    return `${start.clock} – ${end.clock} ${end.period}`;
  }
  return `${start.clock} ${start.period} – ${end.clock} ${end.period}`;
}

/** Sends the device every reminder that's due now and hasn't been sent yet. */
async function sendDueRemindersTo(
  subscription: PushSubscriptionRow,
  now: number,
  eventsForDay: (userId: string, date: string) => Promise<CalendarEvent[]>,
): Promise<void> {
  const { minutesBefore, timeZone } = subscription;
  const today = dateKeyIn(now, timeZone);
  for (const date of [today, addDays(today, 1)]) {
    for (const event of await eventsForDay(subscription.userId, date)) {
      const startsAt = zonedTime(date, event.startTime, timeZone);
      const remindAt = startsAt - minutesBefore * 60 * 1000;
      // Late reminders still go out until the event starts, or just after for "when it starts".
      const tooLateAt = minutesBefore === 0 ? startsAt + atStartGraceMs : startsAt;
      if (now < remindAt || now >= tooLateAt) {
        continue;
      }

      const key = `${event.clientId}|${date}|${event.startTime}`;
      // Claimed before sending, so no reminder goes out twice, even with several servers running.
      if (!(await claimReminder(subscription.id, key, date))) {
        continue;
      }
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            title: event.title || '(No title)',
            body: formatTimeRange(event.startTime, event.endTime),
            // Replaces an earlier notification for the same event instead of stacking up.
            tag: key,
          }),
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // The device unsubscribed, or the browser dropped the subscription.
          await deletePushSubscription(null, subscription.endpoint);
          return;
        }
        throw error;
      }
    }
  }
}

let lastCleanupDate = '';
let sending = false;

/** Sends every device the reminders that are due now. Runs every minute. */
async function sendDueReminders(): Promise<void> {
  // A slow run (many devices, a slow push service) shouldn't overlap the next one.
  if (sending) {
    return;
  }
  sending = true;
  try {
    const now = Date.now();
    // Devices of the same user need the same events, so each day is only read once per run.
    const eventsCache = new Map<string, Promise<CalendarEvent[]>>();
    const eventsForDay = (userId: string, date: string) => {
      const cacheKey = `${userId}|${date}`;
      let events = eventsCache.get(cacheKey);
      if (!events) {
        events = getEventsForDay(userId, date);
        eventsCache.set(cacheKey, events);
      }
      return events;
    };

    for (const subscription of await getPushSubscriptions()) {
      try {
        await sendDueRemindersTo(subscription, now, eventsForDay);
      } catch (error) {
        console.error(`Couldn't send reminders to push subscription ${subscription.id}:`, error);
      }
    }

    // Reminders are only for today and tomorrow in each device's zone, which is never earlier
    // than yesterday in UTC, so older ones can't come up again.
    const todayUtc = new Date(now).toISOString().slice(0, 10);
    if (todayUtc !== lastCleanupDate) {
      lastCleanupDate = todayUtc;
      await forgetOldReminders(addDays(todayUtc, -1));
    }
  } catch (error) {
    console.error(`Couldn't send reminders:`, error);
  } finally {
    sending = false;
  }
}

/** Starts sending reminders every minute. Call once, after the database is initialized. */
export function startReminders(): void {
  if (!pushConfig) {
    console.warn('No push section in config.js, so reminders will not be sent.');
    return;
  }
  webpush.setVapidDetails(pushConfig.subject, pushConfig.vapidPublicKey, pushConfig.vapidPrivateKey);
  setInterval(sendDueReminders, 60_000);
}
