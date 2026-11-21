import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  ErrorResponseSchema,
  FICTIONAL_RESUME,
  RENDER_HEADERS,
  type ResumeData,
} from '@tailex/shared';
import { createApp } from '../src/app.ts';
import type { CompileResult, CompileTex } from '../src/services/latex/compile.ts';

/** A fake compiler: no pdflatex needed. It records the .tex it was given. */
function fakeCompiler(result: CompileResult = okResult()): {
  compileTex: CompileTex;
  seen: string[];
} {
  const seen: string[] = [];
  return {
    seen,
    compileTex: (tex) => {
      seen.push(tex);
      return Promise.resolve(result);
    },
  };
}

function okResult(pageCount = 1): CompileResult {
  return { ok: true, pdf: Buffer.from('%PDF-fake'), pageCount, log: '' };
}

function withBullet(text: string): ResumeData {
  const resume = structuredClone(FICTIONAL_RESUME);
  resume.experience[0]?.bullets.push({ id: 'exp0-b9', text });
  return resume;
}

describe('POST /api/render: input validation (no escapeLatex needed)', () => {
  it('rejects a body that is not ResumeData, listing the bad fields', async () => {
    const { compileTex, seen } = fakeCompiler();
    const res = await request(createApp({ compileTex }))
      .post('/api/render')
      .send({ resume: { contact: {} } });

    expect(res.status).toBe(400);
    const body = ErrorResponseSchema.parse(res.body);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'resume.contact.name' })]),
    );
    expect(seen).toEqual([]);
  });

  it('rejects a link URL that could break out of \\href', async () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.contact.links.push({ id: 'link9', label: 'x', url: 'https://x.example/}\\input{a}' });
    const { compileTex, seen } = fakeCompiler();

    const res = await request(createApp({ compileTex })).post('/api/render').send({ resume });

    expect(res.status).toBe(400);
    expect(seen).toEqual([]);
  });
});

describe('POST /api/render: rendering (needs escapeLatex)', () => {
  it('returns the PDF with page count and warning headers', async () => {
    const { compileTex } = fakeCompiler(okResult(1));
    const res = await request(createApp({ compileTex }))
      .post('/api/render')
      .send({ resume: withBullet('Launched it 🚀') });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers[RENDER_HEADERS.pageCount]).toBe('1');
    expect(res.headers[RENDER_HEADERS.layout]).toBe('roomy'); // fits at once: roomiest layout
    expect(res.headers[RENDER_HEADERS.pageFill]).toBeUndefined(); // the fake log has no marker
    expect(JSON.parse(decodeURIComponent(String(res.headers[RENDER_HEADERS.warnings])))).toEqual([
      '🚀',
    ]);
  });

  it('sends the measured page fill as a whole percentage', async () => {
    const { compileTex } = fakeCompiler({
      ok: true,
      pdf: Buffer.from('%PDF-fake'),
      pageCount: 1,
      log: 'TAILEX-FILL 313.7pt 600.0pt',
    });

    const res = await request(createApp({ compileTex }))
      .post('/api/render')
      .send({ resume: FICTIONAL_RESUME, spacing: 'tight' }); // old clients' field is ignored

    expect(res.status).toBe(200);
    expect(res.headers[RENDER_HEADERS.pageFill]).toBe('52');
  });

  it('never reads the LLM key: it does not reach the .tex or the response', async () => {
    const canary = 'canary-key-should-never-appear';
    const { compileTex, seen } = fakeCompiler();

    const res = await request(createApp({ compileTex }))
      .post('/api/render')
      .set('x-llm-key', canary)
      .set('x-llm-provider', 'gemini')
      .send({ resume: FICTIONAL_RESUME });

    expect(res.status).toBe(200);
    expect(seen.join('')).not.toContain(canary);
    expect(JSON.stringify(res.headers)).not.toContain(canary);
  });

  it('returns parsed compile errors, never the raw log', async () => {
    const { compileTex } = fakeCompiler({
      ok: false,
      reason: 'error',
      errors: [{ line: 12, message: 'Undefined control sequence.' }],
    });

    const res = await request(createApp({ compileTex }))
      .post('/api/render')
      .send({ resume: FICTIONAL_RESUME });

    expect(res.status).toBe(422);
    expect(ErrorResponseSchema.parse(res.body).error).toEqual({
      code: 'COMPILE_FAILED',
      message: 'The PDF could not be built.',
      details: [{ line: 12, message: 'Undefined control sequence.' }],
    });
  });

  it('reports a timeout', async () => {
    const { compileTex } = fakeCompiler({ ok: false, reason: 'timeout' });

    const res = await request(createApp({ compileTex }))
      .post('/api/render')
      .send({ resume: FICTIONAL_RESUME });

    expect(res.status).toBe(422);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('COMPILE_TIMEOUT');
  });

  it('answers 503 BUSY when all compile slots are taken, then recovers', async () => {
    let finishFirst: (result: CompileResult) => void = () => undefined;
    let firstStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const compileTex: CompileTex = () =>
      new Promise((resolve) => {
        finishFirst = resolve;
        firstStarted();
      });
    const app = createApp({ compileTex, maxConcurrentCompiles: 1 });

    const first = request(app)
      .post('/api/render')
      .send({ resume: FICTIONAL_RESUME })
      .then((r) => r);
    await started;
    const second = await request(app).post('/api/render').send({ resume: FICTIONAL_RESUME });

    expect(second.status).toBe(503);
    expect(second.headers['retry-after']).toBe('5');
    expect(ErrorResponseSchema.parse(second.body).error.code).toBe('BUSY');

    finishFirst(okResult());
    expect((await first).status).toBe(200);
  });

  it('frees the slot even when rendering throws', async () => {
    const failing: CompileTex = () => Promise.reject(new Error('boom'));
    const app = createApp({ compileTex: failing, maxConcurrentCompiles: 1 });

    const firstTry = await request(app).post('/api/render').send({ resume: FICTIONAL_RESUME });
    const secondTry = await request(app).post('/api/render').send({ resume: FICTIONAL_RESUME });

    expect(firstTry.status).toBe(500);
    expect(secondTry.status).toBe(500); // not 503: the first request released its slot
  });
});
