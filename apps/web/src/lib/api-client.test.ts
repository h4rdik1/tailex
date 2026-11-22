import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, type TailorPreferences } from '@tailex/shared';
import { ApiError, createApiClient, type KeySource } from './api-client.ts';

const KEY = 'test-key-1234567890';
const PREFS: TailorPreferences = { targetRole: 'Backend Engineer', keepSeniority: true };

interface Seen {
  url: string;
  init: RequestInit;
}

function setup(response: Response | Error, key = KEY) {
  const seen: Seen[] = [];
  const fetchFn = ((url: string, init: RequestInit = {}) => {
    seen.push({ url, init });
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response.clone());
  }) as typeof fetch;
  const keys: KeySource = { getKey: () => key, getProvider: () => 'gemini' };
  return { client: createApiClient(keys, fetchFn), seen };
}

function headersOf(seen: Seen | undefined): Record<string, string> {
  return (seen?.init.headers ?? {}) as Record<string, string>;
}

const PARSED = { resume: FICTIONAL_RESUME, redactedPreview: '[NAME]' };

describe('api-client: where the key goes', () => {
  it('parse sends the key and provider as headers, and the raw file as the body', async () => {
    const { client, seen } = setup(Response.json(PARSED));
    const file = new Blob(['%PDF-'], { type: 'application/pdf' });

    await client.parse(file);

    expect(seen[0]?.url).toBe('/api/parse');
    expect(headersOf(seen[0])).toMatchObject({
      'x-llm-key': KEY,
      'x-llm-provider': 'gemini',
      'content-type': 'application/pdf',
    });
    expect(seen[0]?.init.body).toBe(file);
    expect(seen[0]?.url).not.toContain(KEY);
  });

  it('testKey sends the key as a header only', async () => {
    const { client, seen } = setup(Response.json({ ok: true }));

    await client.testKey();

    expect(seen[0]?.url).toBe('/api/key/test');
    expect(headersOf(seen[0])['x-llm-key']).toBe(KEY);
    expect(seen[0]?.init.body).toBeUndefined();
  });

  it('render NEVER sends the key', async () => {
    const pdf = new Response(new Blob(['%PDF-']), {
      headers: {
        'x-page-count': '1',
        'x-render-warnings': encodeURIComponent('["🚀"]'),
        'x-layout': '9',
        'x-page-fill': '93',
      },
    });
    const { client, seen } = setup(pdf);

    const result = await client.render(FICTIONAL_RESUME);

    expect(JSON.stringify(seen[0]?.init)).not.toContain(KEY);
    expect(headersOf(seen[0])['x-llm-key']).toBeUndefined();
    expect(JSON.parse(seen[0]?.init.body as string)).toEqual({ resume: FICTIONAL_RESUME });
    expect(result).toMatchObject({ pageCount: 1, layout: 9, fill: 0.93 });
    expect(result.droppedChars).toEqual(['🚀']);
  });

  it('treats a missing or unknown layout and fill as unknown (null)', async () => {
    const pdf = new Response(new Blob(['%PDF-']), {
      headers: { 'x-page-count': '1', 'x-layout': '99', 'x-page-fill': 'abc' },
    });
    const { client } = setup(pdf);

    expect(await client.render(FICTIONAL_RESUME)).toMatchObject({ layout: null, fill: null });
  });

  it('keywords NEVER sends the key, and sends the resume and job description in the body', async () => {
    const analysis = { matched: ['React'], missing: [], extra: [], score: 100, jdSkillCount: 1 };
    const { client, seen } = setup(Response.json(analysis));

    const result = await client.keywords(FICTIONAL_RESUME, 'We use React');

    expect(seen[0]?.url).toBe('/api/keywords');
    expect(JSON.stringify(seen[0]?.init)).not.toContain(KEY);
    expect(headersOf(seen[0])['x-llm-key']).toBeUndefined();
    expect(JSON.parse(seen[0]?.init.body as string)).toEqual({
      resume: FICTIONAL_RESUME,
      jd: 'We use React',
    });
    expect(result).toEqual(analysis);
  });

  it('tailor sends the key as a header only, never in the url or the body', async () => {
    const reply = { suggestions: [], bulletsConsidered: 0, bulletsTotal: 0, ignored: 0 };
    const { client, seen } = setup(Response.json(reply));

    await client.tailor(FICTIONAL_RESUME, 'We use React', ['Kubernetes'], PREFS);

    expect(seen[0]?.url).toBe('/api/tailor');
    expect(headersOf(seen[0])).toMatchObject({ 'x-llm-key': KEY, 'x-llm-provider': 'gemini' });
    expect(seen[0]?.url).not.toContain(KEY);
    expect(seen[0]?.init.body as string).not.toContain(KEY);
    expect(JSON.parse(seen[0]?.init.body as string)).toEqual({
      resume: FICTIONAL_RESUME,
      jd: 'We use React',
      confirmedSkills: ['Kubernetes'],
      preferences: PREFS,
    });
  });

  it('tailor refuses to run without a key, before touching the network', async () => {
    const { client, seen } = setup(Response.json({}), '');

    await expect(client.tailor(FICTIONAL_RESUME, 'x', [], PREFS)).rejects.toMatchObject({
      code: 'KEY_MISSING',
    });
    expect(seen).toHaveLength(0);
  });

  it('keywords and tailor reject an answer in the wrong shape', async () => {
    const { client } = setup(Response.json({ surprise: true }));

    await expect(client.keywords(FICTIONAL_RESUME, 'x')).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
    await expect(client.tailor(FICTIONAL_RESUME, 'x', [], PREFS)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
  });

  it('health NEVER sends the key', async () => {
    const { client, seen } = setup(Response.json({ ok: true }));

    expect(await client.health()).toBe(true);
    expect(JSON.stringify(seen[0]?.init)).not.toContain(KEY);
  });

  it('refuses to call parse without a key, before touching the network', async () => {
    const { client, seen } = setup(Response.json(PARSED), '');

    await expect(client.parse(new Blob(['x']))).rejects.toMatchObject({ code: 'KEY_MISSING' });
    expect(seen).toHaveLength(0);
  });
});

describe('api-client: errors', () => {
  it('turns a server error into an ApiError with a friendly message', async () => {
    const body = { error: { code: 'FILE_TOO_LARGE', message: 'x' } };
    const { client } = setup(Response.json(body, { status: 413 }));

    const error = await client.parse(new Blob(['x'])).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 });
    expect((error as ApiError).message).toContain('larger than 1 MB');
  });

  it('exposes readable compile errors', async () => {
    const details = [{ line: 3, message: 'Undefined control sequence.' }];
    const body = { error: { code: 'COMPILE_FAILED', message: 'x', details } };
    const { client } = setup(Response.json(body, { status: 422 }));

    const error = (await client.render(FICTIONAL_RESUME).catch((e: unknown) => e)) as ApiError;

    expect(error.compileErrors).toEqual(details);
  });

  it('reports a network failure', async () => {
    const { client } = setup(new TypeError('Failed to fetch'));

    await expect(client.testKey()).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('rejects a malformed success response instead of trusting it', async () => {
    const { client } = setup(Response.json({ resume: 'nope' }));

    await expect(client.parse(new Blob(['x']))).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('health returns false when the server is unreachable', async () => {
    const { client } = setup(new TypeError('offline'));

    expect(await client.health()).toBe(false);
  });
});
