import type { ErrorCode } from '@tailex/shared';

/** Client-only failure codes (the server never sends these). */
export type ClientErrorCode = 'NETWORK' | 'BAD_RESPONSE';

/** What the user reads for each error. Short, specific, and says what to do next. */
export const ERROR_MESSAGES: Record<ErrorCode | ClientErrorCode, string> = {
  BAD_REQUEST: 'Something in the request was not valid. Please check your input.',
  NOT_FOUND: 'That feature is not available.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
  BUSY: 'The PDF builder is busy. Please try again in a few seconds.',
  COMPILE_FAILED: 'The PDF could not be built. See the details below.',
  COMPILE_TIMEOUT: 'Building the PDF took too long. Try shortening some text.',
  KEY_MISSING: 'Add your API key first (top of the page), or try the sample resume.',
  KEY_INVALID: 'Your API key was rejected. Check it, or create a new one in Google AI Studio.',
  PROVIDER_UNKNOWN: 'That AI provider is not supported.',
  FILE_TOO_LARGE: 'That file is larger than 1 MB. Try exporting a smaller PDF.',
  UNSUPPORTED_FILE: 'Only PDF and DOCX files are supported.',
  TEXT_EXTRACTION_FAILED: 'We could not read text from this file. Is it a scanned image?',
  TEXT_TOO_LONG: 'This document is too long for a one-page resume.',
  LLM_RATE_LIMITED: 'Your key hit its rate limit or free quota. Wait a minute and try again.',
  LLM_UNAVAILABLE: 'The AI provider did not answer in time. Please try again.',
  LLM_BLOCKED: 'The AI provider declined to process this text.',
  LLM_REQUEST_REJECTED: 'The AI provider rejected our request. This is a bug on our side.',
  PARSE_INVALID_OUTPUT: 'The AI returned data we could not use. Please try again.',
  NETWORK: 'Could not reach the server. Check your connection and try again.',
  BAD_RESPONSE: 'The server sent an unexpected answer. Please try again.',
};
