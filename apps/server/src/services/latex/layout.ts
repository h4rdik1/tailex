import { LAYOUT_LEVELS, type Layout, type ResumeData } from '@tailex/shared';
import type { CompileResult, CompileTex } from './compile.ts';
import { parsePageFill } from './log-parser.ts';
import { FILL_MARKER, renderResumeTex } from './template.ts';

export type CompileFailure = Extract<CompileResult, { ok: false }>;

export interface FittedPdf {
  ok: true;
  pdf: Buffer;
  pageCount: number;
  /** The size level that was chosen, 1 (smallest) to LAYOUT_LEVELS. */
  layout: Layout;
  /** 0–1, or null when it could not be measured. */
  fill: number | null;
  droppedChars: string[];
}

/**
 * Chooses the size of the design by trying it (docs/DECISIONS.md ADR-036): the LARGEST level
 * that still fits on one page, so a short resume is enlarged and a long one is shrunk, with
 * font, spacing and margins always scaled together (same look and rhythm at every size).
 * If even the smallest level needs a second page, that PDF is returned and the UI asks the
 * user to shorten. A bigger size never fits when a smaller one doesn't, so a binary search
 * finds the answer in at most 4 compiles instead of 14.
 */
export async function autoFitRender(
  resume: ResumeData,
  compileTex: CompileTex,
): Promise<FittedPdf | CompileFailure> {
  let best: FittedPdf | null = null; // the largest level that fit so far
  let smallest: FittedPdf | null = null; // the smallest level tried, in case nothing fits
  let low = 1;
  let high = LAYOUT_LEVELS;

  while (low <= high) {
    const level = Math.floor((low + high) / 2);
    const attempt = await compileLevel(resume, level, compileTex);
    if (!attempt.ok) return attempt;
    if (attempt.pageCount <= 1) {
      best = attempt;
      low = level + 1;
    } else {
      if (smallest === null || level < smallest.layout) smallest = attempt;
      high = level - 1;
    }
  }

  const chosen = best ?? smallest;
  if (chosen === null) throw new Error('No size level was tried');
  return chosen;
}

async function compileLevel(
  resume: ResumeData,
  layout: Layout,
  compileTex: CompileTex,
): Promise<FittedPdf | CompileFailure> {
  const { tex, droppedChars } = renderResumeTex(resume, { layout });
  const result = await compileTex(tex);
  if (!result.ok) return result;
  return {
    ok: true,
    pdf: result.pdf,
    pageCount: result.pageCount,
    layout,
    fill: parsePageFill(result.log, FILL_MARKER),
    droppedChars,
  };
}
