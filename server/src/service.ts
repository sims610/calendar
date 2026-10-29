import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminRouter } from './routes/adminRouter.ts';
import { authRouter, setAuthUser } from './routes/authRouter.ts';
import { eventRouter } from './routes/eventRouter.ts';
import { pushRouter } from './routes/pushRouter.ts';
import { userRouter } from './routes/userRouter.ts';

interface HttpError extends Error {
  statusCode?: number;
}

const app = express();
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Browsers ask first (a preflight) before sending a request with a token, and need a 2xx back.
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
// A sync can carry a few hundred events, more than the 100kb default.
app.use(express.json({ limit: '1mb' }));
app.use(setAuthUser);

const apiRouter = express.Router();
app.use('/api', apiRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/event', eventRouter);
apiRouter.use('/push', pushRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/user', userRouter);

apiRouter.use('/docs', (req: Request, res: Response) => {
  res.json({
    endpoints: [...authRouter.docs, ...eventRouter.docs, ...pushRouter.docs, ...adminRouter.docs, ...userRouter.docs],
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'welcome to Calendar',
  });
});

// Express 5 no longer accepts '*' as a path, so a path-less handler catches everything unmatched.
app.use((req: Request, res: Response) => {
  res.status(404).json({
    message: 'unknown endpoint',
  });
});

// Default error handler for all exceptions and errors.
app.use((err: HttpError, req: Request, res: Response, next: NextFunction) => {
  res.status(err.statusCode ?? 500).json({ message: err.message, stack: err.stack });
  next();
});

export default app;
