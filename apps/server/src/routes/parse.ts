import express, { Router, type Response } from 'express';
import { makeErrorResponse, UPLOAD_LIMITS, type ParseResponse } from '@tailex/shared';
import { getLlmContext, requireLlmKey } from '../middleware/require-llm-key.ts';
import { ExtractionError, type TextExtractor } from '../services/extract/extractor.ts';
import { detectFileType } from '../services/extract/file-type.ts';
import type { ProviderRegistry } from '../services/llm/registry.ts';
import { LlmError } from '../services/llm/types.ts';
import { parseResume } from '../services/parse/parse-resume.ts';
import type { Logger } from '../middleware/logger.ts';
import { sendLlmError } from './llm-errors.ts';

export interface ParseRouteDeps {
  registry: ProviderRegistry;
  extractText: TextExtractor;
  logger: Logger;
}

/**
 * POST /api/parse: the file is sent as the raw request body (Content-Type: application/pdf or the
 * DOCX type), so no multipart library is needed. express.raw keeps it in memory and stops at 1 MB.
 * Order: key check → read body (≤ 1 MB) → magic bytes → extract → redact + LLM → validate.
 */
export function createParseRouter({ registry, extractText, logger }: ParseRouteDeps): Router {
  const router = Router();
  const readFileBody = express.raw({
    type: () => true, // accept any Content-Type; the magic bytes decide what the file really is
    limit: UPLOAD_LIMITS.maxBytes,
  });

  router.post('/parse', requireLlmKey(registry), readFileBody, async (req, res) => {
    const file: unknown = req.body;
    if (!Buffer.isBuffer(file) || file.length === 0) {
      sendError(res, 400, 'BAD_REQUEST', 'Send the resume file as the request body.');
      return;
    }

    const type = detectFileType(file);
    if (type === null) {
      sendError(res, 415, 'UNSUPPORTED_FILE', 'Only PDF and DOCX files are supported.');
      return;
    }

    const text = await extractOrFail(extractText, file, type, res);
    if (text === null) return;

    const { provider, apiKey } = getLlmContext(req);
    try {
      const result: ParseResponse = await parseResume({ text, provider, apiKey });
      res.status(200).json(result);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      sendLlmError(res, logger, 'parse', error);
    }
  });

  return router;
}

/** Returns the text, or sends the error response and returns null. */
async function extractOrFail(
  extractText: TextExtractor,
  file: Buffer,
  type: 'pdf' | 'docx',
  res: Response,
): Promise<string | null> {
  let text: string;
  try {
    text = (await extractText(file, type)).trim();
  } catch (error) {
    // Unexpected errors (bugs) go to the error handler as 500; known read failures are 422.
    if (!(error instanceof ExtractionError)) throw error;
    sendError(res, 422, 'TEXT_EXTRACTION_FAILED', 'We could not read text from this file.');
    return null;
  }
  if (text === '') {
    sendError(res, 422, 'TEXT_EXTRACTION_FAILED', 'No text found. Is it a scanned image?');
    return null;
  }
  if (text.length > UPLOAD_LIMITS.maxTextChars) {
    sendError(res, 413, 'TEXT_TOO_LONG', 'This document is too long for a one-page resume.');
    return null;
  }
  return text;
}

function sendError(
  res: Response,
  status: number,
  code: Parameters<typeof makeErrorResponse>[0],
  message: string,
): void {
  res.status(status).json(makeErrorResponse(code, message));
}
