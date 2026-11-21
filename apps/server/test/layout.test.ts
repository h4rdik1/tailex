import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, type Layout } from '@tailex/shared';
import type { CompileResult, CompileTex } from '../src/services/latex/compile.ts';
import { autoFitRender } from '../src/services/latex/layout.ts';

interface FakePage {
  pages: number;
  /** Fraction of the page used; becomes the TAILEX-FILL line in the fake log. */
  fill?: number;
}

/**
 * A fake pdflatex that answers per layout (read from the first line of the .tex), so we can
 * test the auto-fit decisions without TeX installed. It records which layouts were tried.
 */
function fakeCompiler(byLayout: Partial<Record<Layout, FakePage>>, fallback: FakePage) {
  const tried: string[] = [];
  const compileTex: CompileTex = (tex) => {
    const layout = /^% tailex-layout: (\w+)/.exec(tex)?.[1] ?? '?';
    tried.push(layout);
    const page = byLayout[layout as Layout] ?? fallback;
    const log = page.fill === undefined ? '' : `TAILEX-FILL ${String(page.fill * 600)}pt 600.0pt`;
    const result: CompileResult = {
      ok: true,
      pdf: Buffer.from(`%PDF-${layout}`),
      pageCount: page.pages,
      log,
    };
    return Promise.resolve(result);
  };
  return { compileTex, tried };
}

describe('autoFitRender', () => {
  it('uses the standard design when it fits, in one compile, never stretched', async () => {
    const { compileTex, tried } = fakeCompiler({}, { pages: 1, fill: 0.55 });

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toEqual(
      expect.objectContaining({ ok: true, layout: 'standard', pageCount: 1, fill: 0.55 }),
    );
    expect(tried).toEqual(['standard']);
  });

  it('moves to a denser layout only when the standard one needs two pages', async () => {
    const { compileTex, tried } = fakeCompiler(
      { standard: { pages: 2 }, compact: { pages: 1, fill: 0.97 } },
      { pages: 1 },
    );

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'compact', pageCount: 1 });
    expect(tried).toEqual(['standard', 'compact']);
  });

  it('returns the densest PDF with its real page count when nothing fits', async () => {
    const { compileTex, tried } = fakeCompiler({}, { pages: 2, fill: 0.4 });

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'dense', pageCount: 2 });
    expect(tried).toEqual(['standard', 'compact', 'dense']);
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

  it('reports fill as null when the log has no marker', async () => {
    const { compileTex } = fakeCompiler({}, { pages: 1 });

    expect(await autoFitRender(FICTIONAL_RESUME, compileTex)).toMatchObject({ fill: null });
  });
});
