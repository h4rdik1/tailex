import { Router } from 'express';
import { makeErrorResponse, type KeyTestResponse } from '@tailex/shared';
import { getLlmContext, requireLlmKey } from '../middleware/require-llm-key.ts';
import type { ProviderRegistry } from '../services/llm/registry.ts';
import { LlmError } from '../services/llm/types.ts';

/** POST /api/key/test: the "Test key" button. One tiny provider call that spends no tokens. */
export function createKeyTestRouter(registry: ProviderRegistry): Router {
  const router = Router();

  router.post('/key/test', requireLlmKey(registry), async (req, res) => {
    const { provider, apiKey } = getLlmContext(req);
    try {
      await provider.checkKey(apiKey);
      const body: KeyTestResponse = { ok: true };
      res.status(200).json(body);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      const status =
        error.code === 'KEY_INVALID' ? 401 : error.code === 'LLM_RATE_LIMITED' ? 429 : 503;
      res.status(status).json(makeErrorResponse(error.code, error.message));
    }
  });

  return router;
}
