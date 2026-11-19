import mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import type { SupportedFileType } from './file-type.ts';
import { checkZipLimits } from './zip-limits.ts';

/**
 * Turns an uploaded file (already in memory, never written to disk) into plain text.
 * Libraries approved by the owner (docs/DECISIONS.md ADR-029): unpdf (Mozilla pdf.js for
 * servers) for PDF and mammoth for DOCX. Both take bytes from memory; no temp files.
 */
export type TextExtractor = (file: Buffer, type: SupportedFileType) => Promise<string>;

export const EXTRACTION_LIMITS = {
  /** A resume is 1–2 pages; 10 leaves room for long CVs and stops 500-page PDFs early. */
  maxPdfPages: 10,
  timeoutMs: 10_000,
} as const;

/** Thrown when a file can't be read. The message is ours and safe to log (no file content). */
export class ExtractionError extends Error {
  constructor(reason: string) {
    super(`Text extraction failed: ${reason}`);
    this.name = 'ExtractionError';
  }
}

export const extractText: TextExtractor = (file, type) =>
  withTimeout(type === 'pdf' ? readPdf(file) : readDocx(file), EXTRACTION_LIMITS.timeoutMs);

async function readPdf(file: Buffer): Promise<string> {
  // pdf.js wants a Uint8Array and may detach it, so give it a copy, not our Buffer.
  const pdf = await getDocumentProxy(new Uint8Array(file)).catch(() => {
    throw new ExtractionError('not a readable PDF');
  });
  try {
    if (pdf.numPages > EXTRACTION_LIMITS.maxPdfPages) throw new ExtractionError('too many pages');
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  } finally {
    // Frees pdf.js memory. In unpdf's build, destroy() lives on the loading task.
    await pdf.loadingTask.destroy();
  }
}

async function readDocx(file: Buffer): Promise<string> {
  const zip = checkZipLimits(file);
  if (!zip.ok) throw new ExtractionError(zip.reason);
  const result = await mammoth.extractRawText({ buffer: file }).catch(() => {
    throw new ExtractionError('not a readable DOCX');
  });
  return result.value;
}

/**
 * Stops WAITING after the timeout. JavaScript can't kill the parsing work itself, but the user
 * gets a quick error, and the size, page and zip limits keep that work small anyway.
 */
function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ExtractionError('took too long'));
    }, timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
