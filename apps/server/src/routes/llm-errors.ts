import type { Response } from 'express';
import { makeErrorResponse } from '@tailex/shared';
import type { Logger } from '../middleware/logger.ts';
import type { LlmError, LlmErrorCode } from '../services/llm/types.ts';

/** HTTP status the browser gets for each LLM error code. */
export const LLM_ERROR_STATUS: Record<LlmErrorCode, number> = {
  KEY_INVALID: 401,
  LLM_RATE_LIMITED: 429,
  LLM_UNAVAILABLE: 503,
  LLM_BLOCKED: 422,
  LLM_REQUEST_REJECTED: 502,
  PARSE_INVALID_OUTPUT: 502,
};

/**
 * Logs the safe facts (our code + the provider's short status codes) and sends our fixed message.
 * The browser never sees provider details; our logs never see the key or any text.
 */
export function sendLlmError(res: Response, logger: Logger, route: string, error: LlmError): void {
  logger.error('llm_error', {
    route,
    code: error.code,
    ...(error.detail === undefined
      ? {}
      : {
          httpStatus: error.detail.httpStatus,
          ...(error.detail.providerStatus === undefined
            ? {}
            : { providerStatus: error.detail.providerStatus }),
          ...(error.detail.reason === undefined ? {} : { reason: error.detail.reason }),
        }),
  });
  res.status(LLM_ERROR_STATUS[error.code]).json(makeErrorResponse(error.code, error.message));
}
