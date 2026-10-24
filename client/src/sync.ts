// Keeps the signed-in user's events on this device and on the server the same.
// The device uploads what changed here and gets back what changed elsewhere since its last sync.
// Failures (offline, server down) are ignored: the changes stay marked and go up next time.

import { getSavedAccount, getSyncCursor, saveSyncCursor } from "./account";
import * as api from "./api";
import * as storage from "./storage";
import type { CalendarEvent } from "./types";

/** Most events sent in one request. The server takes up to 500. */
const CHUNK_SIZE = 200;

function toSyncedEvent(event: CalendarEvent): api.SyncedEvent {
  const { id, ownerUserId, dirty, ...synced } = event;
  return synced;
}

/** One round of uploading and downloading. Returns true if the server sent changes. */
async function syncOnce(): Promise<boolean> {
  const account = getSavedAccount();
  if (!account) {
    return false;
  }
  const userId = account.user.id;
  const dirty = await storage.getDirtyEvents(userId);

  // Even with nothing to upload, one request fetches what changed on other devices.
  const chunks: CalendarEvent[][] = [];
  for (let start = 0; start < dirty.length || chunks.length === 0; start += CHUNK_SIZE) {
    chunks.push(dirty.slice(start, start + CHUNK_SIZE));
  }

  let receivedChanges = false;
  for (const chunk of chunks) {
    const result = await api.syncEvents(account.token, chunk.map(toSyncedEvent), getSyncCursor(userId));
    if (await storage.applyServerEvents(userId, result.events)) {
      receivedChanges = true;
    }
    // Only now is it certain the server has them.
    await storage.markSynced(chunk);
    if (result.cursor) {
      saveSyncCursor(userId, result.cursor);
    }
  }
  return receivedChanges;
}

let running: Promise<boolean> | null = null;
let runAgain = false;

/**
 * Syncs now. A call while a sync is running waits for it, and one more round runs after it to
 * pick up anything that changed in the meantime. Resolves to true if the server sent changes.
 */
export function sync(): Promise<boolean> {
  if (running) {
    runAgain = true;
    return running;
  }
  running = (async () => {
    let receivedChanges = false;
    try {
      do {
        runAgain = false;
        if (await syncOnce()) {
          receivedChanges = true;
        }
      } while (runAgain);
    } catch {
      // Tried again on the next change, when the device comes back online, or on reopening.
    } finally {
      running = null;
    }
    return receivedChanges;
  })();
  return running;
}
