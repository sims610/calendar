import express from 'express';
import type { Request, Response } from 'express';
import { authenticateToken } from './authRouter.ts';
import type { EndpointDoc } from './authRouter.ts';
import {
  acceptConnection,
  createConnectionRequest,
  deleteConnection,
  getConnections,
  getSharedEvents,
  getUserByEmail,
} from '../database/database.ts';

const connectionRouter = Object.assign(express.Router(), {
  docs: [
    {
      method: 'GET',
      path: '/api/connection',
      requiresAuth: true,
      description: 'Your connections and requests. direction is incoming or outgoing, status is pending or accepted',
      example: `curl localhost:3000/api/connection -H 'Authorization: Bearer abc123'`,
      response: [
        {
          id: '…',
          status: 'pending',
          direction: 'incoming',
          user: { id: '…', name: 'Pat', email: 'pat@test.com' },
        },
      ],
    },
    {
      method: 'GET',
      path: '/api/connection/events',
      requiresAuth: true,
      description: 'The events of everyone you have an accepted connection with',
      example: `curl localhost:3000/api/connection/events -H 'Authorization: Bearer abc123'`,
      response: [
        {
          title: 'Gym',
          date: '2026-10-20',
          startTime: '07:00',
          endTime: '08:00',
          repeat: 'daily',
          clientId: '…',
          updatedAt: 1792656000000,
          deleted: false,
          ownerUserId: '…',
        },
      ],
    },
    {
      method: 'POST',
      path: '/api/connection',
      requiresAuth: true,
      description:
        'Ask to connect with the person who has that email. If they already asked you, this accepts their request instead',
      example: `curl -X POST localhost:3000/api/connection -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"email":"pat@test.com"}'`,
      response: {
        id: '…',
        status: 'pending',
        direction: 'outgoing',
        user: { id: '…', name: 'Pat', email: 'pat@test.com' },
      },
    },
    {
      method: 'PUT',
      path: '/api/connection/:id/accept',
      requiresAuth: true,
      description: 'Accept a request sent to you',
      example: `curl -X PUT localhost:3000/api/connection/abc/accept -H 'Authorization: Bearer abc123'`,
      response: { message: 'connection accepted' },
    },
    {
      method: 'DELETE',
      path: '/api/connection/:id',
      requiresAuth: true,
      description: 'Decline a request, cancel one you sent, or remove a connection',
      example: `curl -X DELETE localhost:3000/api/connection/abc -H 'Authorization: Bearer abc123'`,
      response: { message: 'connection deleted' },
    },
  ] as EndpointDoc[],
});

connectionRouter.use(authenticateToken);

// list
connectionRouter.get('/', async (req: Request, res: Response) => {
  res.json(await getConnections(req.user!.id));
});

// the events of accepted connections
connectionRouter.get('/events', async (req: Request, res: Response) => {
  res.json(await getSharedEvents(req.user!.id));
});

// request
connectionRouter.post('/', async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || email.trim().length === 0) {
    res.status(400).json({ message: 'email is required' });
    return;
  }
  const userId = req.user!.id;
  const other = await getUserByEmail(email);
  if (!other) {
    res.status(404).json({ message: 'No account with that email' });
    return;
  }
  if (other.id === userId) {
    res.status(400).json({ message: "That's your own email" });
    return;
  }

  const findConnection = async () =>
    (await getConnections(userId)).find((connection) => connection.user.id === other.id);

  const createdId = await createConnectionRequest(userId, other.id);
  if (createdId) {
    res.status(201).json(await findConnection());
    return;
  }

  // They already have a connection. If the other person asked first, both clearly want to connect.
  const existing = await findConnection();
  if (existing?.status === 'pending' && existing.direction === 'incoming') {
    await acceptConnection(existing.id, userId);
    res.json({ ...existing, status: 'accepted' });
    return;
  }
  res.status(409).json({
    message: existing?.status === 'accepted' ? "You're already connected" : "You've already sent them a request",
  });
});

// accept
connectionRouter.put('/:id/accept', async (req: Request<{ id: string }>, res: Response) => {
  if (!(await acceptConnection(req.params.id, req.user!.id))) {
    res.status(404).json({ message: 'request not found' });
    return;
  }
  res.json({ message: 'connection accepted' });
});

// decline, cancel or remove
connectionRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  if (!(await deleteConnection(req.params.id, req.user!.id))) {
    res.status(404).json({ message: 'connection not found' });
    return;
  }
  res.json({ message: 'connection deleted' });
});

export { connectionRouter };
