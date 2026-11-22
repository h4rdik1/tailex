import { Router } from 'express';
import { KeywordsRequestSchema, makeErrorResponse } from '@tailex/shared';
import { analyze } from '../services/keywords/analyze.ts';
import { badRequestDetails } from './bad-request.ts';

/**
 * POST /api/keywords: `{ resume, jd }` in, matched / missing / extra skills and a score out
 * (docs/SPEC.md §5, §8). Deterministic code only: it never calls an LLM, so it deliberately does
 * NOT read `x-llm-key`, and the key never reaches it (a test sends one and checks).
 */
export function createKeywordsRouter(): Router {
  const router = Router();

  router.post('/keywords', (req, res) => {
    const parsed = KeywordsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json(
          makeErrorResponse(
            'BAD_REQUEST',
            'The resume or the job description is not valid.',
            badRequestDetails(parsed.error),
          ),
        );
      return;
    }
    res.status(200).json(analyze(parsed.data.resume, parsed.data.jd));
  });

  return router;
}
