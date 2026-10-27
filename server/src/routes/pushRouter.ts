import express from 'express';
import type { Request, Response } from 'express';
import { authenticateToken } from './authRouter.ts';
import type { EndpointDoc } from './authRouter.ts';
import { deletePushSubscription, savePushSubscription } from '../database/database.ts';
import type { PushSubscriptionInput } from '../database/database.ts';
import { pushConfig } from '../reminders.ts';

const pushRouter = Object.assign(express.Router(), {
  docs: [
    {
      method: 'GET',
      path: '/api/push/key',
      requiresAuth: false,
      description: 'The public key devices need to subscribe to push messages',
      example: `curl localhost:3000/api/push/key`,
      response: { publicKey: 'BEl6…' },
    },
    {
      method: 'PUT',
      path: '/api/push',
      requiresAuth: true,
      description:
        "Send this device reminders as push messages. minutesBefore is 0, 5, 15 or 30, and timeZone is the device's (IANA name)",
      example: `curl -X PUT localhost:3000/api/push -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"subscription":{"endpoint":"https://fcm.googleapis.com/fcm/send/…", "keys":{"p256dh":"…", "auth":"…"}}, "minutesBefore":5, "timeZone":"America/Denver"}'`,
      response: { message: 'push subscription saved' },
    },
    {
      method: 'DELETE',
      path: '/api/push',
      requiresAuth: true,
      description: 'Stop sending reminders to a device',
      example: `curl -X DELETE localhost:3000/api/push -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"endpoint":"https://fcm.googleapis.com/fcm/send/…"}'`,
      response: { message: 'push subscription deleted' },
    },
  ] as EndpointDoc[],
});

const minutesBeforeOptions = [0, 5, 15, 30];

function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/** The subscription from a request body, or null if it's missing its endpoint or keys. */
function readSubscription(value: unknown): PushSubscriptionInput | null {
  const { endpoint, keys } = (value ?? {}) as Record<string, unknown>;
  const { p256dh, auth } = (keys ?? {}) as Record<string, unknown>;
  if (
    !isShortString(endpoint, 767) ||
    !endpoint.startsWith('https://') ||
    !isShortString(p256dh, 255) ||
    !isShortString(auth, 255)
  ) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

// public key. Registered before authenticateToken, since devices fetch it before subscribing.
pushRouter.get('/key', (req: Request, res: Response) => {
  if (!pushConfig) {
    res.status(503).json({ message: 'push messages are not set up on this server' });
    return;
  }
  res.json({ publicKey: pushConfig.vapidPublicKey });
});

pushRouter.use(authenticateToken);

// subscribe, or update this device's reminder choice and time zone
pushRouter.put('/', async (req: Request, res: Response) => {
  const { subscription, minutesBefore, timeZone } = req.body ?? {};
  const input = readSubscription(subscription);
  if (!input || !minutesBeforeOptions.includes(minutesBefore) || !isTimeZone(timeZone)) {
    res.status(400).json({
      message: `subscription (endpoint and keys), minutesBefore (${minutesBeforeOptions.join(', ')}), and timeZone are required`,
    });
    return;
  }
  await savePushSubscription(req.user!.id, input, minutesBefore, timeZone);
  res.json({ message: 'push subscription saved' });
});

// unsubscribe
pushRouter.delete('/', async (req: Request, res: Response) => {
  const { endpoint } = req.body ?? {};
  if (!isShortString(endpoint, 767)) {
    res.status(400).json({ message: 'endpoint is required' });
    return;
  }
  await deletePushSubscription(req.user!.id, endpoint);
  res.json({ message: 'push subscription deleted' });
});

export { pushRouter };
