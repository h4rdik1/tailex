import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, LAYOUT_LEVELS } from '@tailex/shared';
import type { CompileResult, CompileTex } from '../src/services/latex/compile.ts';
import { autoFitRender } from '../src/services/latex/layout.ts';

/**
 * A fake pdflatex: levels up to `largestThatFits` give 1 page, bigger ones give 2 pages. The
 * level is read from the first line of the .tex. Real TeX behaves the same way (bigger text
 * never fits when smaller text does not), so this checks the search without TeX installed.
 */
function fakeCompiler(largestThatFits: number, fill = 0.9) {
  const tried: number[] = [];
  const compileTex: CompileTex = (tex) => {
    const level = Number(/^% tailex-layout: (\d+)/.exec(tex)?.[1]);
    tried.push(level);
    const result: CompileResult = {
      ok: true,
      pdf: Buffer.from(`%PDF-${String(level)}`),
      pageCount: level <= largestThatFits ? 1 : 2,
      log: `TAILEX-FILL ${String(fill * 600)}pt 600.0pt`,
    };
    return Promise.resolve(result);
  };
  return { compileTex, tried };
}

describe('autoFitRender', () => {
  it.each([1, 2, 5, 6, 9, 13, LAYOUT_LEVELS])(
    'picks level %i when it is the largest that fits one page',
    async (largest) => {
      const { compileTex } = fakeCompiler(largest);

      const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

      expect(result).toMatchObject({ ok: true, layout: largest, pageCount: 1 });
    },
  );

  it('needs at most 4 compiles for 14 levels (binary search, not a loop over all)', async () => {
    for (let largest = 1; largest <= LAYOUT_LEVELS; largest += 1) {
      const { compileTex, tried } = fakeCompiler(largest);
      await autoFitRender(FICTIONAL_RESUME, compileTex);
      expect(tried.length).toBeLessThanOrEqual(4);
    }
  });

  it('returns the smallest size with its real page count when nothing fits', async () => {
    const { compileTex } = fakeCompiler(0);

    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 1, pageCount: 2 });
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

  it('reports the measured fill, or null when the log has no marker', async () => {
    const measured = await autoFitRender(FICTIONAL_RESUME, fakeCompiler(7, 0.55).compileTex);
    const unmeasured = await autoFitRender(FICTIONAL_RESUME, (_tex) =>
      Promise.resolve({ ok: true, pdf: Buffer.from('%PDF-'), pageCount: 1, log: '' }),
    );

    expect(measured).toMatchObject({ fill: 0.55 });
    expect(unmeasured).toMatchObject({ ok: true, layout: LAYOUT_LEVELS, fill: null });
  });
});
