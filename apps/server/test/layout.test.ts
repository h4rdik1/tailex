import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, type Layout } from '@tailex/shared';
import type { CompileResult, CompileTex } from '../src/services/latex/compile.ts';
import { autoFitRender, shouldStretch } from '../src/services/latex/layout.ts';

interface FakePage {
  pages: number;
  /** Fraction of the page used; becomes the TAILEX-FILL line in the fake log. */
  fill?: number;
}

/**
 * A fake pdflatex that answers per layout (read from the first line of the .tex), so we can
 * test the auto-fit decisions without TeX installed. It records every call.
 */
function fakeCompiler(byLayout: Partial<Record<Layout, FakePage>>, fallback: FakePage) {
  const calls: { layout: string; stretched: boolean }[] = [];
  const compileTex: CompileTex = (tex) => {
    const layout = /^% tailex-layout: (\w+)/.exec(tex)?.[1] ?? '?';
    calls.push({ layout, stretched: tex.includes('\\flushbottom') });
    const page = byLayout[layout as Layout] ?? fallback;
    const log =
      page.fill === undefined
        ? ''
        : `TAILEX-FILL ${String(page.fill * 600)}pt 600.0pt\nOutput written on resume.pdf`;
    const result: CompileResult = {
      ok: true,
      pdf: Buffer.from(`%PDF-${layout}`),
      pageCount: page.pages,
      log,
    };
    return Promise.resolve(result);
  };
  return { compileTex, calls };
}

describe('autoFitRender', () => {
  it('a short resume stays on the roomiest layout and is not stretched', async () => {
    const { compileTex, calls } = fakeCompiler({}, { pages: 1, fill: 0.5 });

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'roomy', fill: 0.5, stretched: false });
    expect(calls).toEqual([{ layout: 'roomy', stretched: false }]);
  });

  it('a nearly full page is compiled once more, stretched to the bottom margin', async () => {
    const { compileTex, calls } = fakeCompiler({}, { pages: 1, fill: 0.9 });

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'roomy', stretched: true });
    expect(calls.map((c) => c.stretched)).toEqual([false, true]);
  });

  it('walks down to the first layout that fits on one page', async () => {
    const { compileTex, calls } = fakeCompiler(
      { roomy: { pages: 2 }, spacious: { pages: 2 }, comfortable: { pages: 1, fill: 0.97 } },
      { pages: 1, fill: 0.5 },
    );

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'comfortable', pageCount: 1 });
    expect(calls.map((c) => c.layout)).toEqual(['roomy', 'spacious', 'comfortable', 'comfortable']);
  });

  it('returns the densest PDF with its real page count when nothing fits', async () => {
    const { compileTex, calls } = fakeCompiler({}, { pages: 2, fill: 0.4 });

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'dense', pageCount: 2, stretched: false });
    expect(calls).toHaveLength(5);
  });

  it('stops at the first compile error', async () => {
    let calls = 0;
    const failing: CompileTex = () => {
      calls += 1;
      return Promise.resolve({ ok: false, reason: 'error', errors: [{ line: 1, message: 'x' }] });
    };

    const result = await autoFitRender(FICTIONAL_RESUME, failing);

    expect(result).toEqual({ ok: false, reason: 'error', errors: [{ line: 1, message: 'x' }] });
    expect(calls).toBe(1);
  });

  it('keeps the unstretched PDF if stretching somehow makes two pages', async () => {
    let call = 0;
    const compileTex: CompileTex = () => {
      call += 1;
      const pages = call === 1 ? 1 : 2;
      return Promise.resolve({
        ok: true,
        pdf: Buffer.from(`%PDF-${String(call)}`),
        pageCount: pages,
        log: 'TAILEX-FILL 540pt 600pt',
      });
    };

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, pageCount: 1, stretched: false });
  });
});

describe('shouldStretch', () => {
  it.each([
    [{ pageCount: 1, fill: 0.9 }, true],
    [{ pageCount: 1, fill: 0.75 }, true],
    [{ pageCount: 1, fill: 0.74 }, false],
    [{ pageCount: 1, fill: null }, false],
    [{ pageCount: 2, fill: 0.95 }, false],
  ])('%o -> %s', (pdf, expected) => {
    expect(shouldStretch(pdf)).toBe(expected);
  });
});
