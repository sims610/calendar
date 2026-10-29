// Talks to the server. CI sets VITE_API_URL to the deployed one when it builds the site;
// everywhere else (`npm run dev`, `npm run build` + `npm run preview`) uses a local server.

import type { Account } from "./account";
import type { CalendarEvent } from "./types";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

/** An event as the server stores it: no device-only fields. */
export type SyncedEvent = Omit<CalendarEvent, "id" | "ownerUserId" | "dirty">;

export interface SyncResult {
  /** The user's events that changed on the server since the cursor sent. */
  events: SyncedEvent[];
  /** Send this as `since` next time. Null while the user has no events. */
  cursor: string | null;
}

/** A request the server answered with an error, like a wrong password. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // fetch only throws when the server can't be reached, e.g. offline.
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, result.message ?? "Something went wrong.");
  }
  return result as T;
}

export function register(name: string, email: string, password: string): Promise<Account> {
  return request("POST", "/api/auth", { name, email, password });
}

export function signIn(email: string, password: string): Promise<Account> {
  return request("PUT", "/api/auth", { email, password });
}

export async function signOut(token: string): Promise<void> {
  await request("DELETE", "/api/auth", undefined, token);
}

export function syncEvents(token: string, events: SyncedEvent[], since: string | null): Promise<SyncResult> {
  return request("POST", "/api/event/sync", { events, since }, token);
}

/** The key the browser needs to subscribe to the server's push messages. */
export async function getPushKey(): Promise<string> {
  const { publicKey } = await request<{ publicKey: string }>("GET", "/api/push/key");
  return publicKey;
}

/** Asks the server to send this device reminders, `minutesBefore` events start in `timeZone`. */
export async function savePushSubscription(
  token: string,
  subscription: PushSubscriptionJSON,
  minutesBefore: number,
  timeZone: string,
): Promise<void> {
  await request("PUT", "/api/push", { subscription, minutesBefore, timeZone }, token);
}

/** A registered user, as the admin dashboard lists them. */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

/** Every registered user. Only works with an admin's token. */
export async function getUsers(token: string): Promise<UserSummary[]> {
  const { users } = await request<{ users: UserSummary[] }>("GET", "/api/admin/users", undefined, token);
  return users;
}

export async function deletePushSubscription(token: string, endpoint: string): Promise<void> {
  await request("DELETE", "/api/push", { endpoint }, token);
}
