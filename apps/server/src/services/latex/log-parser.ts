import type { CompileErrorDetail } from '@tailex/shared';

const MAX_ERRORS = 5;
const MAX_MESSAGE_LENGTH = 200;
const LINE_SEARCH_WINDOW = 10;

/**
 * Turns a pdflatex log into a few readable errors. A TeX error looks like:
 *
 *   ! Undefined control sequence.
 *   l.42 \foo
 *
 * We keep only the "! ..." message and the line number from "l.<n>", never the surrounding
 * log text (it can contain file paths and large chunks of user input).
 */
export function parseLatexErrors(log: string): CompileErrorDetail[] {
  const lines = log.split(/\r?\n/);
  const errors: CompileErrorDetail[] = [];

  lines.forEach((text, index) => {
    if (!text.startsWith('! ') || isGenericFatalLine(text)) return;
    errors.push({
      message: text.slice(2).trim().slice(0, MAX_MESSAGE_LENGTH),
      line: findLineNumber(lines, index + 1),
    });
  });

  return errors.slice(0, MAX_ERRORS);
}

/** pdflatex adds "!  ==> Fatal error occurred, no output PDF file produced!" after every real error. */
function isGenericFatalLine(text: string): boolean {
  return text.includes('==> Fatal error occurred');
}

function findLineNumber(lines: string[], start: number): number | null {
  for (const text of lines.slice(start, start + LINE_SEARCH_WINDOW)) {
    const match = /^l\.(\d+)/.exec(text);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  return null;
}

/**
 * Reads our marker line "TAILEX-FILL 512.3pt 682.0pt" (content height, then page text height)
 * and returns how full the last page is, from 0 to 1. Null when the marker is missing or odd
 * (e.g. an empty page, where TeX reports a huge \pagegoal).
 */
export function parsePageFill(log: string, marker: string): number | null {
  const match = new RegExp(`${marker} ([\\d.]+)pt ([\\d.]+)pt`).exec(log);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const used = Number(match[1]);
  const available = Number(match[2]);
  if (!(available > 0) || available > 10_000) return null;
  return Math.min(1, used / available);
}

/** Reads "Output written on resume.pdf (2 pages, 41234 bytes)." Returns 0 if no PDF was made. */
export function parsePageCount(log: string): number {
  const match = /Output written on .*?\((\d+) pages?/s.exec(log);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}
