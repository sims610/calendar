import express from 'express';
import type { Request, Response } from 'express';
import { authorizeAdmin } from './authRouter.ts';
import type { EndpointDoc } from './authRouter.ts';
import { getFeatureSuggestions, getUsers } from '../database/database.ts';

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
    {
      method: 'GET',
      path: '/api/admin/suggestions',
      requiresAuth: true,
      description: 'List every feature suggestion, newest first (admin only)',
      example: `curl localhost:3000/api/admin/suggestions -H 'Authorization: Bearer abc123'`,
      response: {
        suggestions: [
          {
            id: 1,
            text: 'A week view',
            createdAt: '2026-11-11T15:04:05.000Z',
            user: { id: '…', name: 'Pat', email: 'pat@test.com' },
          },
        ],
      },
    },
  ] as EndpointDoc[],
});

adminRouter.use(authorizeAdmin);

// list users
adminRouter.get('/users', async (req: Request, res: Response) => {
  res.json({ users: await getUsers() });
});

// list feature suggestions
adminRouter.get('/suggestions', async (req: Request, res: Response) => {
  res.json({ suggestions: await getFeatureSuggestions() });
});

export { adminRouter };
