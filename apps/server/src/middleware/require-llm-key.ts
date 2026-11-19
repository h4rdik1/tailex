import type { Request, RequestHandler } from 'express';
import { LLM_HEADERS, makeErrorResponse } from '@tailex/shared';
import type { ProviderRegistry } from '../services/llm/registry.ts';
import type { LlmProvider } from '../services/llm/types.ts';

export interface LlmContext {
  provider: LlmProvider;
  apiKey: string;
}

/**
 * The key is attached to the request object it arrived with, in a WeakMap. When the request is
 * finished and garbage-collected, the key goes with it: nothing keeps a reference (no globals,
 * no cache). A WeakMap also avoids loosely-typed `res.locals`.
 */
const contexts = new WeakMap<Request, LlmContext>();

/** Keys are opaque tokens: printable ASCII, no spaces, sensible length. */
const KEY_FORMAT = /^[\x21-\x7E]{10,200}$/;

/**
 * The ONLY place that reads `x-llm-key`. Mounted only on /api/parse, /api/tailor and
 * /api/key/test (docs/SPEC.md §5); other routes never see the key.
 */
export function requireLlmKey(registry: ProviderRegistry): RequestHandler {
  return (req, res, next) => {
    const providerName = req.get(LLM_HEADERS.provider) ?? '';
    const provider = registry.get(providerName);
    if (provider === null) {
      res
        .status(400)
        .json(makeErrorResponse('PROVIDER_UNKNOWN', 'Unknown or unsupported LLM provider.'));
      return;
    }

    const apiKey = req.get(LLM_HEADERS.key) ?? '';
    if (apiKey === '') {
      res
        .status(401)
        .json(makeErrorResponse('KEY_MISSING', 'Add your API key to use this feature.'));
      return;
    }
    if (!KEY_FORMAT.test(apiKey)) {
      res.status(401).json(makeErrorResponse('KEY_INVALID', 'That does not look like an API key.'));
      return;
    }

    contexts.set(req, { provider, apiKey });
    next();
  };
}

/** Reads the context set by requireLlmKey. Throws if a route forgot to mount the middleware. */
export function getLlmContext(req: Request): LlmContext {
  const context = contexts.get(req);
  if (context === undefined) throw new Error('requireLlmKey is not mounted on this route');
  return context;
}
