import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authRouter, setAuthUser } from './routes/authRouter.ts';

interface HttpError extends Error {
  statusCode?: number;
}

const app = express();
app.use(express.json());
app.use(setAuthUser);
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

const apiRouter = express.Router();
app.use('/api', apiRouter);
apiRouter.use('/auth', authRouter);

apiRouter.use('/docs', (req: Request, res: Response) => {
  res.json({
    endpoints: [...authRouter.docs],
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
