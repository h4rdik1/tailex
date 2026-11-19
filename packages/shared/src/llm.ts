import { z } from 'zod';

/** Request headers that carry the user's own key (BYOK). Only api-client.ts sets them. */
export const LLM_HEADERS = {
  key: 'x-llm-key',
  provider: 'x-llm-provider',
} as const;

/**
 * Providers a browser may ask for. The client sends only this NAME; the server maps it to a
 * hardcoded host (docs/SECURITY.md T6). The server also knows a "mock" provider for tests and
 * sample mode, which is never accepted in production.
 */
export const PublicProviderSchema = z.enum(['gemini']);
export type PublicProvider = z.infer<typeof PublicProviderSchema>;

/** Response of `POST /api/key/test`. */
export const KeyTestResponseSchema = z.object({ ok: z.literal(true) });
export type KeyTestResponse = z.infer<typeof KeyTestResponseSchema>;
