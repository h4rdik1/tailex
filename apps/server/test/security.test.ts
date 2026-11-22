import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorResponseSchema } from '@tailex/shared';
import { createApp } from '../src/app.ts';
import { createLogger } from '../src/middleware/logger.ts';
import { DEFAULT_RATE_LIMITS } from '../src/middleware/rate-limit.ts';

/** The policy in docs/SECURITY.md. `blob:` is for the PDF preview only. */
const EXPECTED_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  'object-src blob:',
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const directivesOf = (header: unknown): string[] =>
  String(header)
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');

let staticDir = '';
beforeAll(() => {
  staticDir = mkdtempSync(path.join(tmpdir(), 'tailex-static-'));
  writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Tailex</title>');
});
afterAll(() => {
  rmSync(staticDir, { recursive: true, force: true });
});

describe('security headers', () => {
  it('sends the strict policy from docs/SECURITY.md on API answers', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(directivesOf(res.headers['content-security-policy'])).toEqual(EXPECTED_CSP);
  });

  it('sends the same headers on the web app itself', async () => {
    const res = await request(createApp({ staticDir })).get('/');

    expect(res.status).toBe(200);
    expect(directivesOf(res.headers['content-security-policy'])).toEqual(EXPECTED_CSP);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('adds the other protective headers and hides the framework name', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['permissions-policy']).toMatch(/camera=\(\)/);
    expect(res.headers['permissions-policy']).toMatch(/microphone=\(\)/);
    expect(res.headers['permissions-policy']).toMatch(/geolocation=\(\)/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('upgrades insecure requests only in production (plain http on localhost must keep working)', async () => {
    const dev = await request(createApp()).get('/api/health');
    const prod = await request(createApp({ production: true })).get('/api/health');

    expect(directivesOf(dev.headers['content-security-policy'])).not.toContain(
      'upgrade-insecure-requests',
    );
    expect(directivesOf(prod.headers['content-security-policy'])).toContain(
      'upgrade-insecure-requests',
    );
  });

  it('keeps the headers on error answers too', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('rate limits', () => {
  const tight = { windowMs: 60_000, general: 100, keyTest: 2 };
  const hit = (app: ReturnType<typeof createApp>, ip = '203.0.113.1') =>
    request(app).post('/api/key/test').set('x-forwarded-for', ip);

  it('answers 429 with our error shape and a Retry-After after the limit', async () => {
    const app = createApp({ rateLimits: tight });

    await hit(app);
    await hit(app);
    const res = await hit(app);

    expect(res.status).toBe(429);
    const body = ErrorResponseSchema.parse(res.body);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toMatch(/too many requests/i);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits each route on its own: one busy route does not block the others', async () => {
    const app = createApp({ rateLimits: tight });
    await hit(app);
    await hit(app);
    expect((await hit(app)).status).toBe(429);

    expect(
      (await request(app).get('/api/health').set('x-forwarded-for', '203.0.113.1')).status,
    ).toBe(200);
    const keywords = await request(app)
      .post('/api/keywords')
      .set('x-forwarded-for', '203.0.113.1')
      .send({});
    expect(keywords.status).toBe(400); // reached the route (bad body), not blocked
  });

  it('counts each visitor separately, by the address the proxy reports', async () => {
    const app = createApp({ rateLimits: { ...tight, keyTest: 1 } });

    expect((await hit(app, '203.0.113.10')).status).not.toBe(429);
    expect((await hit(app, '203.0.113.11')).status).not.toBe(429);
    expect((await hit(app, '203.0.113.10')).status).toBe(429);
  });

  it('never limits the health check (the platform polls it)', async () => {
    const app = createApp({ rateLimits: { ...tight, general: 2 } });

    for (let i = 0; i < 6; i += 1) {
      expect((await request(app).get('/api/health')).status).toBe(200);
    }
  });

  it('has a general limit on every API route', async () => {
    const app = createApp({ rateLimits: { ...tight, general: 3 } });
    const call = () => request(app).post('/api/keywords').send({});

    await call();
    await call();
    await call();

    expect((await call()).status).toBe(429);
  });

  it('uses sensible defaults: the expensive routes stop at their limit, normal use does not', async () => {
    const app = createApp();
    const render = () => request(app).post('/api/render').send({});

    for (let i = 0; i < DEFAULT_RATE_LIMITS.render; i += 1) {
      expect((await render()).status).not.toBe(429);
    }
    expect((await render()).status).toBe(429);
    // The cheap, deterministic route still has room.
    expect((await request(app).post('/api/keywords').send({})).status).toBe(400);
  });

  it('never logs the key, not even on a rejected request', async () => {
    const lines: string[] = [];
    const app = createApp({
      rateLimits: { ...tight, keyTest: 1 },
      logger: createLogger((line) => lines.push(line)),
    });
    const secret = 'canary-key-1234567890';

    await hit(app).set('x-llm-key', secret).set('x-llm-provider', 'gemini');
    const res = await hit(app).set('x-llm-key', secret).set('x-llm-provider', 'gemini');

    expect(res.status).toBe(429);
    expect(lines.join('\n')).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });
});
