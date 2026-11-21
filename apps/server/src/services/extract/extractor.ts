import mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import type { SupportedFileType } from './file-type.ts';
import { checkZipLimits } from './zip-limits.ts';

/**
 * Turns an uploaded file (already in memory, never written to disk) into plain text.
 * Libraries approved by the owner (docs/DECISIONS.md ADR-029): unpdf (Mozilla pdf.js for
 * servers) for PDF and mammoth for DOCX. Both take bytes from memory; no temp files.
 */
export interface ExtractedDocument {
  text: string;
  /**
   * Link targets that are not visible as text: a PDF or Word link shows the words "LinkedIn" but
   * keeps the address in the link itself. Only http(s) and mailto, capped; used for the contact
   * block and NEVER sent to the LLM.
   */
  urls: string[];
}

export type TextExtractor = (file: Buffer, type: SupportedFileType) => Promise<ExtractedDocument>;

export const EXTRACTION_LIMITS = {
  /** A resume is 1–2 pages; 10 leaves room for long CVs and stops 500-page PDFs early. */
  maxPdfPages: 10,
  timeoutMs: 10_000,
  /** A resume has a handful of links; the cap stops a link-stuffed file from bloating the work. */
  maxLinks: 20,
  maxLinkLength: 500,
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

async function readPdf(file: Buffer): Promise<ExtractedDocument> {
  // pdf.js wants a Uint8Array and may detach it, so give it a copy, not our Buffer.
  const pdf = await getDocumentProxy(new Uint8Array(file)).catch(() => {
    throw new ExtractionError('not a readable PDF');
  });
  try {
    if (pdf.numPages > EXTRACTION_LIMITS.maxPdfPages) throw new ExtractionError('too many pages');
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return { text, urls: keepSafeUrls(await readPdfLinkTargets(pdf)) };
  } finally {
    // Frees pdf.js memory. In unpdf's build, destroy() lives on the loading task.
    await pdf.loadingTask.destroy();
  }
}

/** The address of every clickable link on every page (pdf.js "link annotations"). */
async function readPdfLinkTargets(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<string[]> {
  const urls: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    for (const annotation of await page.getAnnotations()) {
      // pdf.js types annotations loosely; only link annotations carry a string `url`.
      const { url } = annotation as { url?: unknown };
      if (typeof url === 'string') urls.push(url);
    }
  }
  return urls;
}

async function readDocx(file: Buffer): Promise<ExtractedDocument> {
  const zip = checkZipLimits(file);
  if (!zip.ok) throw new ExtractionError(zip.reason);
  const result = await mammoth.extractRawText({ buffer: file }).catch(() => {
    throw new ExtractionError('not a readable DOCX');
  });
  return { text: result.value, urls: keepSafeUrls(await readDocxLinkTargets(file)) };
}

/**
 * Word links also hide their address. mammoth can turn the document into HTML; we read ONLY the
 * href values out of that string. The HTML itself is never rendered or returned.
 */
async function readDocxLinkTargets(file: Buffer): Promise<string[]> {
  const { value: html } = await mammoth
    .convertToHtml({ buffer: file })
    .catch(() => ({ value: '' }));
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
    (match[1] ?? '').replaceAll('&amp;', '&'),
  );
}

/** Only web and mail links, no duplicates, and a cap: javascript:, file: and the like are dropped. */
export function keepSafeUrls(urls: readonly string[]): string[] {
  const safe = urls
    .map((url) => url.trim())
    .filter((url) => url.length <= EXTRACTION_LIMITS.maxLinkLength)
    .filter((url) => /^(https?:\/\/|mailto:)/i.test(url));
  return [...new Set(safe)].slice(0, EXTRACTION_LIMITS.maxLinks);
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
