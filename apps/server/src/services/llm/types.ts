import type { ErrorCode } from '@tailex/shared';

export type ProviderName = 'gemini' | 'mock';

export interface GenerateJsonInput {
  /** The user's own key. Used for this one call, then dropped. Never logged. */
  apiKey: string;
  system: string;
  user: string;
  /** JSON Schema the provider should follow (structured output). Zod still validates after. */
  jsonSchema: Record<string, unknown>;
  temperature: number;
}

/**
 * Every LLM provider looks the same to the rest of the app (docs/ARCHITECTURE.md §5).
 * The provider returns RAW parsed JSON (`unknown`); callers must validate it with Zod.
 */
export interface LlmProvider {
  readonly name: ProviderName;
  generateJson(input: GenerateJsonInput): Promise<unknown>;
  /** Cheapest possible check that a key works (no content generated). */
  checkKey(apiKey: string): Promise<void>;
}

export type LlmErrorCode = Extract<
  ErrorCode,
  | 'KEY_INVALID'
  | 'LLM_RATE_LIMITED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_BLOCKED'
  | 'LLM_REQUEST_REJECTED'
  | 'PARSE_INVALID_OUTPUT'
>;

/**
 * Safe facts about a provider failure, for OUR logs only (never sent to the browser).
 * Only short UPPER_SNAKE codes like "INVALID_ARGUMENT" / "API_KEY_INVALID" are kept: they can't
 * contain the key or resume text, unlike the provider's free-text error message, which we drop.
 */
export interface LlmErrorDetail {
  httpStatus: number;
  providerStatus?: string;
  reason?: string;
}

/**
 * The only error type providers throw. Its message is a FIXED sentence we wrote, never text from
 * the provider's response (which could echo the key or the resume). docs/SECURITY.md T4.
 */
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly detail: LlmErrorDetail | undefined;

  constructor(code: LlmErrorCode, detail?: LlmErrorDetail) {
    super(LLM_ERROR_MESSAGES[code]);
    this.name = 'LlmError';
    this.code = code;
    this.detail = detail;
  }
}

export const LLM_ERROR_MESSAGES: Record<LlmErrorCode, string> = {
  KEY_INVALID: 'The API key was rejected by the provider. Check it and try again.',
  LLM_RATE_LIMITED: 'The provider says this key hit its rate limit or quota. Try again later.',
  LLM_UNAVAILABLE: 'The provider did not respond in time. Please try again.',
  LLM_BLOCKED: 'The provider declined to process this text.',
  LLM_REQUEST_REJECTED: 'The AI provider rejected our request. This is a problem on our side.',
  PARSE_INVALID_OUTPUT: 'The AI returned data we could not use, even after a retry.',
};
