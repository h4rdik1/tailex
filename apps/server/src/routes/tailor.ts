import { Router } from 'express';
import { makeErrorResponse, TailorRequestSchema } from '@tailex/shared';
import type { Logger } from '../middleware/logger.ts';
import { getLlmContext, requireLlmKey } from '../middleware/require-llm-key.ts';
import type { ProviderRegistry } from '../services/llm/registry.ts';
import { LlmError } from '../services/llm/types.ts';
import { tailorResume, TailorInputError } from '../services/tailor/tailor-resume.ts';
import type { TruthGuard } from '../services/tailor/truth-guard.ts';
import { badRequestDetails } from './bad-request.ts';
import { sendLlmError } from './llm-errors.ts';

export interface TailorRouteDeps {
  registry: ProviderRegistry;
  truthGuard: TruthGuard;
  logger: Logger;
}

/**
 * POST /api/tailor: the only tailoring route that reads the user's key (docs/SPEC.md §5).
 * Order: key check → validate body → one LLM call (retry once) → truth guard on every suggestion.
 * The job description, the bullets and the key are never logged.
 */
export function createTailorRouter({ registry, truthGuard, logger }: TailorRouteDeps): Router {
  const router = Router();

  router.post('/tailor', requireLlmKey(registry), async (req, res) => {
    const parsed = TailorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json(
          makeErrorResponse(
            'BAD_REQUEST',
            'The resume, the job description or the confirmed skills are not valid.',
            badRequestDetails(parsed.error),
          ),
        );
      return;
    }

    const { provider, apiKey } = getLlmContext(req);
    try {
      const result = await tailorResume({ ...parsed.data, provider, apiKey, truthGuard });
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof TailorInputError) {
        res.status(400).json(makeErrorResponse('BAD_REQUEST', error.message));
        return;
      }
      if (!(error instanceof LlmError)) throw error;
      sendLlmError(res, logger, 'tailor', error);
    }
  });

  return router;
}
