import express from 'express';
import type { Request, Response } from 'express';
import { authenticateToken } from './authRouter.ts';
import type { EndpointDoc } from './authRouter.ts';
import { addFeatureSuggestion, maxSuggestionLength } from '../database/database.ts';

const suggestionRouter = Object.assign(express.Router(), {
  docs: [
    {
      method: 'POST',
      path: '/api/suggestion',
      requiresAuth: true,
      description: `Suggest a feature, up to ${maxSuggestionLength} characters. Admins can list them at /api/admin/suggestions`,
      example: `curl -X POST localhost:3000/api/suggestion -H 'Authorization: Bearer abc123' -H 'Content-Type: application/json' -d '{"text":"A week view"}'`,
      response: { message: 'suggestion sent' },
    },
  ] as EndpointDoc[],
});

suggestionRouter.use(authenticateToken);

// suggest a feature
suggestionRouter.post('/', async (req: Request, res: Response) => {
  const { text } = req.body ?? {};
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed.length === 0) {
    res.status(400).json({ message: 'text is required' });
    return;
  }
  if (trimmed.length > maxSuggestionLength) {
    res.status(400).json({ message: `Suggestions can be up to ${maxSuggestionLength} characters` });
    return;
  }
  await addFeatureSuggestion(req.user!.id, trimmed);
  res.status(201).json({ message: 'suggestion sent' });
});

export { suggestionRouter };
