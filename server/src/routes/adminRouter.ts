import express from 'express';
import type { Request, Response } from 'express';
import { authorizeAdmin } from './authRouter.ts';
import type { EndpointDoc } from './authRouter.ts';
import { getUsers } from '../database/database.ts';

const adminRouter = Object.assign(express.Router(), {
  docs: [
    {
      method: 'GET',
      path: '/api/admin/users',
      requiresAuth: true,
      description: 'List every registered user (admin only)',
      example: `curl localhost:3000/api/admin/users -H 'Authorization: Bearer abc123'`,
      response: { users: [{ id: '…', name: 'Pat', email: 'pat@test.com' }] },
    },
  ] as EndpointDoc[],
});

adminRouter.use(authorizeAdmin);

// list users
adminRouter.get('/users', async (req: Request, res: Response) => {
  res.json({ users: await getUsers() });
});

export { adminRouter };
