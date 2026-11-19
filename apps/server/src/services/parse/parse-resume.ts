import { z } from 'zod';
import { LlmParsedResumeSchema, type ParseResponse } from '@tailex/shared';
import { buildParseUserMessage, PARSE_SYSTEM_PROMPT } from '../../prompts/parse.ts';
import { LlmError, type LlmProvider } from '../llm/types.ts';
import { redactContact } from '../redact/redact-contact.ts';
import { assembleResume } from './assemble-resume.ts';

/** Low temperature: we want faithful extraction, not creativity (CLAUDE.md, Prompts). */
const PARSE_TEMPERATURE = 0;

/** At most 2 LLM calls per upload: the first try and one retry on invalid output. */
const MAX_ATTEMPTS = 2;

/**
 * JSON Schema handed to the provider's structured-output mode, generated from the same Zod schema
 * we validate with, so the two can never drift apart. `$schema` is dropped (providers don't need it).
 */
const PARSE_JSON_SCHEMA: Record<string, unknown> = Object.fromEntries(
  Object.entries(z.toJSONSchema(LlmParsedResumeSchema)).filter(([key]) => key !== '$schema'),
);

export interface ParseResumeInput {
  text: string;
  provider: LlmProvider;
  apiKey: string;
}

/**
 * Extracted text → redact → ONE LLM call (retry once if the output is invalid) → validate → ids.
 * Single call, no tools, no agent loop (CLAUDE.md Non-goals).
 */
export async function parseResume({
  text,
  provider,
  apiKey,
}: ParseResumeInput): Promise<ParseResponse> {
  const { redactedText, contact } = redactContact(text);
  const request = {
    apiKey,
    system: PARSE_SYSTEM_PROMPT,
    user: buildParseUserMessage(redactedText),
    jsonSchema: PARSE_JSON_SCHEMA,
    temperature: PARSE_TEMPERATURE,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await callProvider(provider, request);
    const parsed = LlmParsedResumeSchema.safeParse(raw);
    if (parsed.success) {
      return { resume: assembleResume(parsed.data, contact), redactedPreview: redactedText };
    }
  }
  throw new LlmError('PARSE_INVALID_OUTPUT');
}

/** Invalid JSON from the provider counts as "invalid output" (retryable); other errors bubble up. */
async function callProvider(
  provider: LlmProvider,
  request: Parameters<LlmProvider['generateJson']>[0],
): Promise<unknown> {
  try {
    return await provider.generateJson(request);
  } catch (error) {
    if (error instanceof LlmError && error.code === 'PARSE_INVALID_OUTPUT') return undefined;
    throw error;
  }
}
