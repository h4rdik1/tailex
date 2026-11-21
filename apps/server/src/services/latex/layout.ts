import { LayoutSchema, type Layout, type ResumeData } from '@tailex/shared';
import type { CompileResult, CompileTex } from './compile.ts';
import { parsePageFill } from './log-parser.ts';
import { FILL_MARKER, renderResumeTex } from './template.ts';

/**
 * Only stretch the gaps to the bottom margin when the page is already this full. Below it the
 * content is genuinely short: stretching would open big holes, so we leave it top-aligned and
 * the UI suggests adding content instead.
 */
export const STRETCH_FROM_FILL = 0.75;

/** Roomiest first: the order the auto-fit loop tries them in. */
export const LAYOUT_ORDER: readonly Layout[] = LayoutSchema.options;

export type CompileFailure = Extract<CompileResult, { ok: false }>;

export interface FittedPdf {
  ok: true;
  pdf: Buffer;
  pageCount: number;
  layout: Layout;
  /** 0–1, or null when it could not be measured. */
  fill: number | null;
  /** True when the gaps were stretched so the last line sits on the bottom margin. */
  stretched: boolean;
  droppedChars: string[];
}

/**
 * "Classifies" a resume by trying it: the roomiest layout that fits on one page wins
 * (docs/DECISIONS.md ADR-036). Measuring real pdflatex output beats guessing from character
 * counts, because line breaks and page breaks in TeX jump in whole lines.
 * A short resume costs 1–2 compiles, a very long one at most 5.
 */
export async function autoFitRender(
  resume: ResumeData,
  compileTex: CompileTex,
): Promise<FittedPdf | CompileFailure> {
  let best: FittedPdf | null = null;

  for (const layout of LAYOUT_ORDER) {
    const attempt = await compileLayout(resume, layout, false, compileTex);
    if (!attempt.ok) return attempt;
    best = attempt;
    if (attempt.pageCount <= 1) break;
  }
  if (best === null) throw new Error('LAYOUT_ORDER is empty');

  if (!shouldStretch(best)) return best;
  const stretched = await compileLayout(resume, best.layout, true, compileTex);
  // Stretching never adds content, but if anything odd happens, keep the unstretched PDF.
  return stretched.ok && stretched.pageCount === 1 ? stretched : best;
}

/** Pure rule, tested on its own: one page, measured, and already nearly full. */
export function shouldStretch(pdf: Pick<FittedPdf, 'pageCount' | 'fill'>): boolean {
  return pdf.pageCount === 1 && pdf.fill !== null && pdf.fill >= STRETCH_FROM_FILL;
}

async function compileLayout(
  resume: ResumeData,
  layout: Layout,
  fillPage: boolean,
  compileTex: CompileTex,
): Promise<FittedPdf | CompileFailure> {
  const { tex, droppedChars } = renderResumeTex(resume, { layout, fillPage });
  const result = await compileTex(tex);
  if (!result.ok) return result;
  return {
    ok: true,
    pdf: result.pdf,
    pageCount: result.pageCount,
    layout,
    fill: parsePageFill(result.log, FILL_MARKER),
    stretched: fillPage,
    droppedChars,
  };
}
