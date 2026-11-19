import { Router } from 'express';
import type { KeyTestResponse } from '@tailex/shared';
import type { Logger } from '../middleware/logger.ts';
import { getLlmContext, requireLlmKey } from '../middleware/require-llm-key.ts';
import type { ProviderRegistry } from '../services/llm/registry.ts';
import { LlmError } from '../services/llm/types.ts';
import { sendLlmError } from './llm-errors.ts';

/** POST /api/key/test: the "Test key" button. One tiny provider call that spends no tokens. */
export function createKeyTestRouter(registry: ProviderRegistry, logger: Logger): Router {
  const router = Router();

  router.post('/key/test', requireLlmKey(registry), async (req, res) => {
    const { provider, apiKey } = getLlmContext(req);
    try {
      await provider.checkKey(apiKey);
      const body: KeyTestResponse = { ok: true };
      res.status(200).json(body);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      sendLlmError(res, logger, 'key-test', error);
    }
  });

  return router;
}
