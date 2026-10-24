// Who is signed in on this device, and how far their events have synced.
// Saved in localStorage so the app knows straight away on start, even offline.

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Account {
  user: User;
  /** Sent with every request to the server to prove who's asking. */
  token: string;
}

const ACCOUNT_KEY = "account";
/** One cursor per user, so switching accounts doesn't skip the other user's changes. */
const cursorKey = (userId: string) => `syncCursor:${userId}`;

/** The signed-in account, or null when signed out (or storage can't be read). */
export function getSavedAccount(): Account | null {
  try {
    const saved = localStorage.getItem(ACCOUNT_KEY);
    return saved ? (JSON.parse(saved) as Account) : null;
  } catch {
    return null;
  }
}

export function saveAccount(account: Account) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // Signed in for now; the app just won't remember it next time.
  }
}

export function clearAccount() {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Nothing saved to clear.
  }
}

/** Where the user's last sync left off, or null to fetch everything. */
export function getSyncCursor(userId: string): string | null {
  try {
    return localStorage.getItem(cursorKey(userId));
  } catch {
    return null;
  }
}

export function saveSyncCursor(userId: string, cursor: string) {
  try {
    localStorage.setItem(cursorKey(userId), cursor);
  } catch {
    // The next sync fetches everything again, which is safe, just slower.
  }
}

export function clearSyncCursor(userId: string) {
  try {
    localStorage.removeItem(cursorKey(userId));
  } catch {
    // Nothing saved to clear.
  }
}
