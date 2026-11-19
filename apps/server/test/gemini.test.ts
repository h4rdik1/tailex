import { describe, expect, it } from 'vitest';
import {
  buildRequestBody,
  createGeminiProvider,
  GEMINI_HOST,
  GEMINI_MODEL,
  readJsonAnswer,
} from '../src/services/llm/gemini.ts';
import { createMockProvider } from '../src/services/llm/mock.ts';
import { createProviderRegistry } from '../src/services/llm/registry.ts';
import { LlmError } from '../src/services/llm/types.ts';

const KEY = 'canary-gemini-key-000';
const INPUT = {
  apiKey: KEY,
  system: 'SYSTEM',
  user: '<resume_text>x</resume_text>',
  jsonSchema: { type: 'object' },
  temperature: 0,
};

interface SeenRequest {
  url: string;
  init: RequestInit;
}

/** A fake fetch that replays scripted responses and records every request. */
function fakeFetch(responses: (Response | Error)[]): {
  fetchFn: typeof fetch;
  seen: SeenRequest[];
} {
  const seen: SeenRequest[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    seen.push({ url, init: init ?? {} });
    const next = responses[Math.min(seen.length - 1, responses.length - 1)];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next?.clone());
  }) as typeof fetch;
  return { fetchFn, seen };
}

function geminiAnswer(json: unknown): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }],
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    return error instanceof LlmError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe('Gemini request', () => {
  it('calls the hardcoded host and model, with the key ONLY in the x-goog-api-key header', async () => {
    const { fetchFn, seen } = fakeFetch([geminiAnswer({ ok: 1 })]);

    await createGeminiProvider({ fetchFn }).generateJson(INPUT);

    const request = seen[0];
    expect(request?.url).toBe(`${GEMINI_HOST}/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect(request?.url).not.toContain(KEY);
    expect(request?.init.body).toBeTypeOf('string');
    expect(request?.init.body as string).not.toContain(KEY);
    expect((request?.init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(request?.init.method).toBe('POST');
  });

  it('builds a JSON-mode body with the system prompt and temperature', () => {
    expect(buildRequestBody(INPUT)).toEqual({
      systemInstruction: { parts: [{ text: 'SYSTEM' }] },
      contents: [{ role: 'user', parts: [{ text: '<resume_text>x</resume_text>' }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
      },
    });
  });
});

describe('Gemini response handling', () => {
  it('returns the parsed JSON answer', async () => {
    const { fetchFn } = fakeFetch([geminiAnswer({ skills: [] })]);

    await expect(createGeminiProvider({ fetchFn }).generateJson(INPUT)).resolves.toEqual({
      skills: [],
    });
  });

  it.each([
    [400, 'KEY_INVALID'],
    [401, 'KEY_INVALID'],
    [403, 'KEY_INVALID'],
    [402, 'LLM_RATE_LIMITED'],
    [429, 'LLM_RATE_LIMITED'],
    [503, 'LLM_UNAVAILABLE'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const { fetchFn } = fakeFetch([new Response('{}', { status })]);

    expect(await codeOf(createGeminiProvider({ fetchFn }).generateJson(INPUT))).toBe(code);
  });

  it('retries once on a 5xx, then succeeds', async () => {
    const { fetchFn, seen } = fakeFetch([
      new Response('', { status: 503 }),
      geminiAnswer({ a: 1 }),
    ]);

    await expect(createGeminiProvider({ fetchFn }).generateJson(INPUT)).resolves.toEqual({ a: 1 });
    expect(seen).toHaveLength(2);
  });

  it('retries once on a network error, then gives up with LLM_UNAVAILABLE', async () => {
    const { fetchFn, seen } = fakeFetch([new TypeError('fetch failed')]);

    expect(await codeOf(createGeminiProvider({ fetchFn }).generateJson(INPUT))).toBe(
      'LLM_UNAVAILABLE',
    );
    expect(seen).toHaveLength(2);
  });

  it('does not retry a 4xx (a bad key will not fix itself)', async () => {
    const { fetchFn, seen } = fakeFetch([new Response('', { status: 403 })]);

    await codeOf(createGeminiProvider({ fetchFn }).generateJson(INPUT));
    expect(seen).toHaveLength(1);
  });

  it('never puts provider error text (which may echo the key) into the error', async () => {
    const echo = new Response(JSON.stringify({ error: { message: `API key ${KEY} not valid` } }), {
      status: 400,
    });
    const { fetchFn } = fakeFetch([echo]);

    try {
      await createGeminiProvider({ fetchFn }).generateJson(INPUT);
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
      expect(JSON.stringify(error)).not.toContain(KEY);
      expect((error as Error).stack ?? '').not.toContain(KEY);
    }
  });
});

describe('readJsonAnswer', () => {
  it('reports a blocked prompt', () => {
    expect(() => readJsonAnswer({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(LlmError);
  });

  it('reports a safety finish reason as blocked', () => {
    const body = { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '{}' }] } }] };
    expect(() => readJsonAnswer(body)).toThrow('declined');
  });

  it.each([
    {},
    { candidates: [] },
    { candidates: [{ content: { parts: [{ text: 'not json' }] } }] },
  ])('treats %j as invalid output', (body) => {
    expect(() => readJsonAnswer(body)).toThrow('could not use');
  });
});

describe('checkKey', () => {
  it('lists one model with the key in the header (no tokens spent)', async () => {
    const { fetchFn, seen } = fakeFetch([Response.json({ models: [] })]);

    await createGeminiProvider({ fetchFn }).checkKey(KEY);

    expect(seen[0]?.url).toBe(`${GEMINI_HOST}/v1beta/models?pageSize=1`);
    expect(seen[0]?.url).not.toContain(KEY);
  });

  it('rejects a bad key', async () => {
    const { fetchFn } = fakeFetch([new Response('', { status: 403 })]);

    expect(await codeOf(createGeminiProvider({ fetchFn }).checkKey(KEY))).toBe('KEY_INVALID');
  });
});

describe('provider allowlist', () => {
  const gemini = createGeminiProvider({ fetchFn: fakeFetch([]).fetchFn });
  const mock = createMockProvider();

  it('returns known providers', () => {
    const registry = createProviderRegistry({ gemini, mock }, { allowMock: true });
    expect(registry.get('gemini')).toBe(gemini);
    expect(registry.get('mock')).toBe(mock);
  });

  it.each([
    'openai',
    'Gemini',
    'https://evil.example.com',
    'gemini@evil.example.com',
    '../gemini',
    'gemini ',
    '',
    '__proto__',
    'constructor',
  ])('rejects %j', (name) => {
    const registry = createProviderRegistry({ gemini, mock }, { allowMock: true });
    expect(registry.get(name)).toBeNull();
  });

  it('rejects "mock" when mocks are not allowed (production)', () => {
    const registry = createProviderRegistry({ gemini, mock }, { allowMock: false });
    expect(registry.get('mock')).toBeNull();
  });
});
