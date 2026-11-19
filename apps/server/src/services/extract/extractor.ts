import type { SupportedFileType } from './file-type.ts';

/**
 * Turns an uploaded file (already in memory, never written to disk) into plain text.
 * Real PDF/DOCX extraction needs a library; it is wired in once the owner approves the
 * dependency (docs/DECISIONS.md ADR-029). Until then the route answers 501 EXTRACTION_UNAVAILABLE
 * and tests inject a fake extractor.
 */
export type TextExtractor = (file: Buffer, type: SupportedFileType) => Promise<string>;

export class ExtractionUnavailableError extends Error {
  constructor() {
    super('Text extraction is not configured');
    this.name = 'ExtractionUnavailableError';
  }
}

export const unavailableExtractor: TextExtractor = () =>
  Promise.reject(new ExtractionUnavailableError());
