import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorResponseSchema, HealthResponseSchema } from '@tailex/shared';
import { createApp } from '../src/app.ts';
import { errorHandler } from '../src/middleware/error-handler.ts';

describe('GET /api/health', () => {
  it('returns { ok: true }', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ ok: true });
  });

  it('does not reveal the framework in headers', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('API errors', () => {
  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('returns a generic 400 for malformed JSON without echoing the input', async () => {
    const secret = 'canary-value-123';
    const res = await request(createApp())
      .post('/api/health')
      .set('content-type', 'application/json')
      .send(`{"broken": "${secret}"`);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('BAD_REQUEST');
    expect(res.text).not.toContain(secret);
  });

  it('hides internal error messages and stacks', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('internal secret detail');
    });
    app.use(errorHandler);

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('INTERNAL');
    expect(res.text).not.toContain('internal secret detail');
    expect(res.text).not.toMatch(/\.ts:\d+/); // no stack-trace frames
  });
});

describe('static SPA hosting', () => {
  let staticDir = '';

  beforeAll(() => {
    staticDir = mkdtempSync(path.join(tmpdir(), 'tailex-spa-'));
    writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Tailex</title>');
  });

  afterAll(() => {
    rmSync(staticDir, { recursive: true, force: true });
  });

  it('serves index.html for client-side paths', async () => {
    const res = await request(createApp({ staticDir })).get('/some/client/path');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Tailex</title>');
  });

  it('still returns JSON 404s for unknown API routes', async () => {
    const res = await request(createApp({ staticDir })).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });
});
