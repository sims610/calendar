import express from 'express';
import type { Request, Response } from 'express';
import { authenticateToken, isNonEmptyString } from './authRouter.ts';
import type { EndpointDoc } from './authRouter.ts';
import { deleteOtherSessions, updateUser, verifyPassword } from '../database/database.ts';
import type { UserChanges } from '../database/database.ts';

const userRouter = Object.assign(express.Router(), {
  docs: [
    {
      method: 'GET',
      path: '/api/user',
      requiresAuth: true,
      description: "Get the signed-in user's details",
      example: `curl localhost:3000/api/user -H 'Authorization: Bearer abc123'`,
      response: { user: { id: '…', name: 'Pat', email: 'pat@test.com', role: 'user' } },
    },
    {
      method: 'PUT',
      path: '/api/user',
      requiresAuth: true,
      description:
        "Update the signed-in user's name, email, or password. Changing email or password needs currentPassword.",
      example: `curl -X PUT localhost:3000/api/user -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"email":"pat@new.com", "currentPassword":"secret"}'`,
      response: { user: { id: '…', name: 'Pat', email: 'pat@new.com', role: 'user' } },
    },
  ] as EndpointDoc[],
});

userRouter.use(authenticateToken);

// get own details
userRouter.get('/', (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// update own details
userRouter.put('/', async (req: Request, res: Response) => {
  const { name, email, password, currentPassword } = req.body ?? {};
  const changes: UserChanges = {};
  for (const [field, value] of Object.entries({ name, email, password })) {
    if (value === undefined) {
      continue;
    }
    if (!isNonEmptyString(value)) {
      res.status(400).json({ message: `${field} can't be empty` });
      return;
    }
    changes[field as keyof UserChanges] = field === 'name' ? value.trim() : value;
  }
  if (Object.keys(changes).length === 0) {
    res.status(400).json({ message: 'name, email, or password is required' });
    return;
  }

  const user = req.user!;
  // Someone using a device left signed in shouldn't be able to take the account over.
  if (changes.email !== undefined || changes.password !== undefined) {
    if (typeof currentPassword !== 'string' || !(await verifyPassword(user.id, currentPassword))) {
      res.status(401).json({ message: 'current password is incorrect' });
      return;
    }
  }

  const updated = await updateUser(user.id, changes);
  if (!updated) {
    res.status(409).json({ message: 'email already registered' });
    return;
  }
  if (changes.password !== undefined) {
    // Anyone who knew the old password is signed out; this device stays signed in.
    await deleteOtherSessions(user.id, req.token!);
  }
  res.json({ user: updated });
});

export { userRouter };
