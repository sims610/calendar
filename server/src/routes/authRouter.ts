import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { addUser, verifyUser, createSession, getUserByToken, deleteSession } from '../database/database.ts';
import type { User } from '../database/database.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      token?: string;
    }
  }
}

interface EndpointDoc {
  method: string;
  path: string;
  requiresAuth: boolean;
  description: string;
  example: string;
  response: unknown;
}

const authRouter = Object.assign(express.Router(), {
  docs: [
    {
      method: 'POST',
      path: '/api/auth',
      requiresAuth: false,
      description: 'Register a new user',
      example: `curl -X POST localhost:3000/api/auth -H 'Content-Type: application/json' -d '{"name":"Pat", "email":"pat@test.com", "password":"secret"}'`,
      response: { user: { id: '…', name: 'Pat', email: 'pat@test.com' }, token: 'abc123' },
    },
    {
      method: 'PUT',
      path: '/api/auth',
      requiresAuth: false,
      description: 'Login existing user',
      example: `curl -X PUT localhost:3000/api/auth -H 'Content-Type: application/json' -d '{"email":"pat@test.com", "password":"secret"}'`,
      response: { user: { id: '…', name: 'Pat', email: 'pat@test.com' }, token: 'abc123' },
    },
    {
      method: 'DELETE',
      path: '/api/auth',
      requiresAuth: true,
      description: 'Logout a user',
      example: `curl -X DELETE localhost:3000/api/auth -H 'Authorization: Bearer abc123'`,
      response: { message: 'logout successful' },
    },
  ] as EndpointDoc[],
});

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice('Bearer '.length).trim() || undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Attaches req.user and req.token when the request carries a valid session token.
function setAuthUser(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (token) {
    const user = getUserByToken(token);
    if (user) {
      req.user = user;
      req.token = token;
    }
  }
  next();
}

function authenticateToken(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ message: 'unauthorized' });
    return;
  }
  next();
}

// register
authRouter.post('/', async (req: Request, res: Response) => {
  const { name, email, password } = req.body ?? {};
  if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
    res.status(400).json({ message: 'name, email, and password are required' });
    return;
  }
  const user = await addUser(name.trim(), email, password);
  if (!user) {
    res.status(409).json({ message: 'email already registered' });
    return;
  }
  const token = createSession(user.id);
  res.status(201).json({ user, token });
});

// login
authRouter.put('/', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    res.status(400).json({ message: 'email and password are required' });
    return;
  }
  const user = await verifyUser(email, password);
  if (!user) {
    res.status(401).json({ message: 'invalid email or password' });
    return;
  }
  const token = createSession(user.id);
  res.json({ user, token });
});

// logout
authRouter.delete('/', authenticateToken, (req: Request, res: Response) => {
  deleteSession(req.token!);
  res.json({ message: 'logout successful' });
});

export { authRouter, setAuthUser, authenticateToken };
