import { LayoutSchema, type Layout, type ResumeData } from '@tailex/shared';
import type { CompileResult, CompileTex } from './compile.ts';
import { parsePageFill } from './log-parser.ts';
import { FILL_MARKER, renderResumeTex } from './template.ts';

/** The order the auto-fit loop tries: the reference design first, denser ones only if needed. */
export const LAYOUT_ORDER: readonly Layout[] = LayoutSchema.options;

export type CompileFailure = Extract<CompileResult, { ok: false }>;

export interface FittedPdf {
  ok: true;
  pdf: Buffer;
  pageCount: number;
  layout: Layout;
  /** 0–1, or null when it could not be measured. */
  fill: number | null;
  droppedChars: string[];
}

/**
 * Picks the layout by trying it (docs/DECISIONS.md ADR-036): the standard design if it fits on
 * one page, otherwise `compact`, then `dense`. A short resume is never stretched or enlarged:
 * same rhythm always, and the UI suggests adding content when the page is mostly empty.
 * Measuring real pdflatex output beats guessing from character counts, because TeX breaks
 * lines and pages in whole lines. Costs 1 compile normally, at most 3.
 */
export async function autoFitRender(
  resume: ResumeData,
  compileTex: CompileTex,
): Promise<FittedPdf | CompileFailure> {
  let last: FittedPdf | null = null;
  for (const layout of LAYOUT_ORDER) {
    const attempt = await compileLayout(resume, layout, compileTex);
    if (!attempt.ok || attempt.pageCount <= 1) return attempt;
    last = attempt;
  }
  if (last === null) throw new Error('LAYOUT_ORDER is empty');
  return last; // even `dense` needs more than one page: the UI asks the user to shorten
}

async function compileLayout(
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
