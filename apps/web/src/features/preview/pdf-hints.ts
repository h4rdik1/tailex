/** Below this the page looks noticeably empty, so we suggest adding content. */
export const LOW_FILL = 0.75;

export type PdfHint = { tone: 'warning'; text: string } | { tone: 'info'; text: string };

/**
 * What to tell the user about the PDF's length. The server already picked the best layout,
 * so the only remaining lever is the content itself.
 */
export function pdfHint(pdf: { pageCount: number; fill: number | null }): PdfHint | null {
  if (pdf.pageCount > 1) {
    return {
      tone: 'warning',
      text: 'Too long for one page, even at the smallest size. Shorten or remove a few bullets.',
    };
  }
  if (pdf.fill !== null && pdf.fill < LOW_FILL) {
    return {
      tone: 'info',
      text: `Your resume fills about ${String(Math.round(pdf.fill * 100))}% of the page. There is room for another project or a few more bullets.`,
    };
  }
  return null;
}
