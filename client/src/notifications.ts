// Event reminders, chosen in Settings.
//
// Reminders are sent by the server as push messages, from the events synced to the account, so
// they arrive even when the app is closed. That needs three things, and Settings only offers
// reminders when all of them hold: the app is added to the home screen (phones only allow
// notifications from installed web apps), the browser supports push, and the user is signed in
// (signed-out events never reach the server). The service worker shows the messages.
//
// The choice is per device: it's kept here and sent to the server with this device's push
// subscription and time zone. Signing out unregisters the device but keeps the choice, so signing
// back in registers it again.

import * as api from "./api";
import { getSavedAccount } from "./account";

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
/** Where reminders timed on the device used to remember what they'd shown. */
const OLD_SENT_STORAGE_KEY = "remindersSent";

/** How often coming back to the app registers again, to keep the time zone current. */
const REREGISTER_INTERVAL_MS = 60 * 60 * 1000;

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

/** True when this browser can get notifications while the app is closed. */
export function pushSupported(): boolean {
  return notificationsSupported() && "PushManager" in window;
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

/** The server's push key as the bytes the browser expects. It's sent as base64url text. */
function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/**
 * Tells the server to send this device reminders for `option`, subscribing to push messages
 * first if needed. Does nothing unless signed in, push works here, notifications are allowed,
 * and a reminder is chosen. Returns whether the server now has the registration.
 */
export async function registerPush(option: ReminderOption = currentReminder): Promise<boolean> {
  const account = getSavedAccount();
  if (
    !account ||
    option.minutesBefore === null ||
    !pushSupported() ||
    Notification.permission !== "granted"
  ) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(await api.getPushKey()),
      }));
    await api.savePushSubscription(
      account.token,
      subscription.toJSON(),
      option.minutesBefore,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    return true;
  } catch {
    return false;
  }
}

/** Stops reminders to this device. Call before signing out, while the token still works. */
export async function unregisterPush(): Promise<void> {
  if (!pushSupported()) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return;
    }
    const account = getSavedAccount();
    if (account) {
      // Best effort: once unsubscribed, the push service tells the server the device is gone anyway.
      await api.deletePushSubscription(account.token, subscription.endpoint).catch(() => {});
    }
    await subscription.unsubscribe();
  } catch {
    // Nothing more to undo here.
  }
}

/**
 * Remembers the choice and registers it with the server. Turning reminders on asks for permission
 * first, so this must be called from a tap. Returns "blocked" if the user didn't allow
 * notifications, or "failed" if the server couldn't be told; either way the choice doesn't change.
 */
export async function saveReminder(option: ReminderOption): Promise<"ok" | "blocked" | "failed"> {
  if (option.minutesBefore === null) {
    await unregisterPush();
  } else {
    if ((await Notification.requestPermission()) !== "granted") {
      return "blocked";
    }
    if (!(await registerPush(option))) {
      return "failed";
    }
  }
  currentReminder = option;
  try {
    localStorage.setItem(STORAGE_KEY, option.id);
  } catch {
    // The server has the choice; this device just won't remember it next time.
  }
  return "ok";
}

let lastRegisteredAt = 0;

/** Registers again, at most once an hour, so the server has this device's current time zone. */
function refreshRegistration() {
  if (Date.now() - lastRegisteredAt < REREGISTER_INTERVAL_MS) {
    return;
  }
  lastRegisteredAt = Date.now();
  // Failures are fine: the server keeps the last registration that worked.
  registerPush();
}

/**
 * Registers on startup and when the app comes back to the front, which keeps the time zone current
 * and recovers from an expired subscription. Call once on startup.
 */
export function startReminders() {
  try {
    localStorage.removeItem(OLD_SENT_STORAGE_KEY);
  } catch {
    // Nothing saved to clear.
  }
  refreshRegistration();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshRegistration();
    }
  });
}
