import express from 'express';
import type { Request, Response } from 'express';
import { authenticateToken } from './authRouter.ts';
import type { EndpointDoc } from './authRouter.ts';
import {
  getEventsForDay,
  createEvent,
  updateEvent,
  deleteEvent,
  syncEvents,
  repeatRules,
  repeatScopes,
} from '../database/database.ts';
import type { EventInput, RepeatRule, RepeatScope, SyncedEvent } from '../database/database.ts';

const eventRouter = Object.assign(express.Router(), {
  docs: [
    {
      method: 'GET',
      path: '/api/event?date=:date',
      requiresAuth: true,
      description: 'Events that happen on a day (YYYY-MM-DD), including repeats',
      example: `curl 'localhost:3000/api/event?date=2026-10-22' -H 'Authorization: Bearer abc123'`,
      response: [
        {
          id: 1,
          title: 'Gym',
          date: '2026-10-20',
          startTime: '07:00',
          endTime: '08:00',
          repeat: 'daily',
          clientId: '…',
          updatedAt: 1792656000000,
          deleted: false,
        },
      ],
    },
    {
      method: 'POST',
      path: '/api/event',
      requiresAuth: true,
      description: 'Create an event',
      example: `curl -X POST localhost:3000/api/event -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"title":"Gym", "date":"2026-10-20", "startTime":"07:00", "endTime":"08:00", "repeat":"daily"}'`,
      response: {
        id: 1,
        title: 'Gym',
        date: '2026-10-20',
        startTime: '07:00',
        endTime: '08:00',
        repeat: 'daily',
        clientId: '…',
        updatedAt: 1792656000000,
        deleted: false,
      },
    },
    {
      method: 'PUT',
      path: '/api/event/:id',
      requiresAuth: true,
      description: 'Change an event from the day it was opened on. scope is only-this or this-and-future',
      example: `curl -X PUT localhost:3000/api/event/1 -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"occurrenceDate":"2026-10-22", "scope":"only-this", "title":"Gym", "date":"2026-10-22", "startTime":"09:00", "endTime":"10:00", "repeat":"daily"}'`,
      response: { message: 'event updated' },
    },
    {
      method: 'DELETE',
      path: '/api/event/:id?date=:date&scope=:scope',
      requiresAuth: true,
      description: 'Delete an event from the day it was opened on. scope is only-this or this-and-future',
      example: `curl -X DELETE 'localhost:3000/api/event/1?date=2026-10-22&scope=this-and-future' -H 'Authorization: Bearer abc123'`,
      response: { message: 'event deleted' },
    },
    {
      method: 'POST',
      path: '/api/event/sync',
      requiresAuth: true,
      description:
        'Save events changed on a device (matched by clientId, newer updatedAt wins) and get back every event changed since the cursor from the last sync. Leave since out to get everything',
      example: `curl -X POST localhost:3000/api/event/sync -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"since":null, "events":[{"clientId":"0b6f1c9e-4a8e-4f8a-9d2e-1f2a3b4c5d6e", "title":"Gym", "date":"2026-10-20", "startTime":"07:00", "endTime":"08:00", "repeat":"daily", "excludedDates":[], "updatedAt":1792656000000, "deleted":false}]}'`,
      response: {
        events: [
          {
            clientId: '0b6f1c9e-4a8e-4f8a-9d2e-1f2a3b4c5d6e',
            title: 'Gym',
            date: '2026-10-20',
            startTime: '07:00',
            endTime: '08:00',
            repeat: 'daily',
            updatedAt: 1792656000000,
            deleted: false,
          },
        ],
        cursor: '2026-10-22 14:03:11.482',
      },
    },
  ] as EndpointDoc[],
});

eventRouter.use(authenticateToken);

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(value));
}

function isScope(value: unknown): value is RepeatScope {
  return repeatScopes.includes(value as RepeatScope);
}

/** The event details from a request body, or null if any are missing or malformed. */
function readEventInput(body: Record<string, unknown> | undefined): EventInput | null {
  const { title, date, startTime, endTime, repeat } = body ?? {};
  if (
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    !isDateKey(date) ||
    typeof startTime !== 'string' ||
    !timePattern.test(startTime) ||
    typeof endTime !== 'string' ||
    !timePattern.test(endTime) ||
    !repeatRules.includes(repeat as RepeatRule)
  ) {
    return null;
  }
  return { title: title.trim(), date, startTime, endTime, repeat: repeat as RepeatRule };
}

const invalidEventMessage = 'title, date (YYYY-MM-DD), startTime and endTime (HH:mm), and repeat are required';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A cursor is a changedAt value from an earlier sync, like "2026-10-22 14:03:11.482".
const cursorPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;
/** Most events one sync request takes. Devices with more send them in several requests. */
const maxEventsPerSync = 500;

/** An event from a sync request, or null if anything about it is missing or malformed. */
function readSyncedEvent(value: unknown): SyncedEvent | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const body = value as Record<string, unknown>;
  const input = readEventInput(body);
  const { clientId, endDate, excludedDates, updatedAt, deleted } = body;
  if (
    !input ||
    typeof clientId !== 'string' ||
    !uuidPattern.test(clientId) ||
    (endDate !== undefined && endDate !== null && !isDateKey(endDate)) ||
    (excludedDates !== undefined && (!Array.isArray(excludedDates) || !excludedDates.every(isDateKey))) ||
    !Number.isSafeInteger(updatedAt) ||
    (updatedAt as number) <= 0 ||
    typeof deleted !== 'boolean'
  ) {
    return null;
  }
  const event: SyncedEvent = { ...input, clientId: clientId.toLowerCase(), updatedAt: updatedAt as number, deleted };
  if (endDate) {
    event.endDate = endDate as string;
  }
  if (Array.isArray(excludedDates) && excludedDates.length > 0) {
    event.excludedDates = excludedDates as string[];
  }
  return event;
}

// list a day's events
eventRouter.get('/', async (req: Request, res: Response) => {
  const { date } = req.query;
  if (!isDateKey(date)) {
    res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    return;
  }
  res.json(await getEventsForDay(req.user!.id, date));
});

// create
eventRouter.post('/', async (req: Request, res: Response) => {
  const input = readEventInput(req.body);
  if (!input) {
    res.status(400).json({ message: invalidEventMessage });
    return;
  }
  res.status(201).json(await createEvent(req.user!.id, input));
});

// sync. Registered before the /:id routes so "sync" is never read as an id.
eventRouter.post('/sync', async (req: Request, res: Response) => {
  const { events, since = null } = req.body ?? {};
  if (!Array.isArray(events) || events.length > maxEventsPerSync) {
    res.status(400).json({ message: `events must be a list of at most ${maxEventsPerSync}` });
    return;
  }
  if (since !== null && (typeof since !== 'string' || !cursorPattern.test(since))) {
    res.status(400).json({ message: 'since must be a cursor from an earlier sync, or null' });
    return;
  }
  const syncedEvents = events.map(readSyncedEvent);
  const invalidIndex = syncedEvents.indexOf(null);
  if (invalidIndex !== -1) {
    res.status(400).json({
      message: `event ${invalidIndex} is invalid: ${invalidEventMessage}, along with clientId (UUID), updatedAt (ms), and deleted`,
    });
    return;
  }
  res.json(await syncEvents(req.user!.id, syncedEvents as SyncedEvent[], since));
});

// update
eventRouter.put('/:id', async (req: Request, res: Response) => {
  const input = readEventInput(req.body);
  const { occurrenceDate, scope } = req.body ?? {};
  if (!input || !isDateKey(occurrenceDate) || !isScope(scope)) {
    res.status(400).json({ message: `${invalidEventMessage}, along with occurrenceDate and scope` });
    return;
  }
  if (!(await updateEvent(req.user!.id, Number(req.params.id), occurrenceDate, input, scope))) {
    res.status(404).json({ message: 'event not found' });
    return;
  }
  res.json({ message: 'event updated' });
});

// delete
eventRouter.delete('/:id', async (req: Request, res: Response) => {
  const { date, scope } = req.query;
  if (!isDateKey(date) || !isScope(scope)) {
    res.status(400).json({ message: 'date (YYYY-MM-DD) and scope are required' });
    return;
  }
  if (!(await deleteEvent(req.user!.id, Number(req.params.id), date, scope))) {
    res.status(404).json({ message: 'event not found' });
    return;
  }
  res.json({ message: 'event deleted' });
});

export { eventRouter };
