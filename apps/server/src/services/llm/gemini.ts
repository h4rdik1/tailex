import { LlmError, type GenerateJsonInput, type LlmProvider } from './types.ts';

/**
 * Google Gemini over plain REST (no SDK dependency).
 * Checked against the official docs on 2026-11-20 (docs/DECISIONS.md ADR-027):
 * - POST {host}/v1beta/models/{model}:generateContent
 * - key in the `x-goog-api-key` header (never in the URL, so it can't end up in access logs)
 * - JSON mode: generationConfig.responseMimeType = "application/json" + responseJsonSchema
 * - system prompt: systemInstruction; text answer at candidates[0].content.parts[0].text
 *
 * The host is a constant. Nothing from the client is ever used to build a URL (SSRF, T6).
 */
export const GEMINI_HOST = 'https://generativelanguage.googleapis.com';
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2; // one retry, only for network errors, timeouts and 5xx

export interface GeminiOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  model?: string;
}

export function createGeminiProvider(options: GeminiOptions = {}): LlmProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = options.model ?? GEMINI_MODEL;

  async function send(url: string, apiKey: string, init: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetchOnce(fetchFn, url, apiKey, init, timeoutMs);
      const retryable = response === null || response.status >= 500;
      if (!retryable) return response;
      if (attempt >= MAX_ATTEMPTS) throw new LlmError('LLM_UNAVAILABLE');
    }
  }

  return {
    name: 'gemini',

    async generateJson(input: GenerateJsonInput): Promise<unknown> {
      const url = `${GEMINI_HOST}/v1beta/models/${model}:generateContent`;
      const response = await send(url, input.apiKey, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildRequestBody(input)),
      });
      throwForStatus(response.status);
      return readJsonAnswer(await response.json());
    },

    async checkKey(apiKey: string): Promise<void> {
      // Listing models costs no tokens. pageSize=1 keeps the response tiny.
      const response = await send(`${GEMINI_HOST}/v1beta/models?pageSize=1`, apiKey, {
        method: 'GET',
      });
      throwForStatus(response.status);
    },
  };
}

export function buildRequestBody(input: GenerateJsonInput): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: 'user', parts: [{ text: input.user }] }],
    generationConfig: {
      temperature: input.temperature,
      responseMimeType: 'application/json',
      responseJsonSchema: input.jsonSchema,
    },
  };
}

/** Returns null for network errors and timeouts (both are retryable). */
async function fetchOnce(
  fetchFn: typeof fetch,
  url: string,
  apiKey: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  try {
    return await fetchFn(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Deliberately not rethrown: fetch errors can include request details. We map to a safe code.
    return null;
  }
}

function throwForStatus(status: number): void {
  if (status >= 200 && status < 300) return;
  if (status === 400 || status === 401 || status === 403) throw new LlmError('KEY_INVALID');
  if (status === 402 || status === 429) throw new LlmError('LLM_RATE_LIMITED');
  throw new LlmError('LLM_UNAVAILABLE');
}

/** Pulls the model's text out of a generateContent response and parses it as JSON. */
export function readJsonAnswer(body: unknown): unknown {
  if (isBlocked(body)) throw new LlmError('LLM_BLOCKED');
  const text = firstCandidateText(body);
  if (text === null) throw new LlmError('PARSE_INVALID_OUTPUT');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LlmError('PARSE_INVALID_OUTPUT');
  }
}

function isBlocked(body: unknown): boolean {
  const blockReason = getPath(body, ['promptFeedback', 'blockReason']);
  const finishReason = getPath(body, ['candidates', 0, 'finishReason']);
  const blockedFinish = ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION'];
  return (
    typeof blockReason === 'string' ||
    (typeof finishReason === 'string' && blockedFinish.includes(finishReason))
  );
}

function firstCandidateText(body: unknown): string | null {
  const text = getPath(body, ['candidates', 0, 'content', 'parts', 0, 'text']);
  return typeof text === 'string' ? text : null;
}

/** Safe nested read of an unknown JSON value, without `any`. */
function getPath(value: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}
