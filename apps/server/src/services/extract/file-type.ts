/**
 * Decides the file type from its first bytes ("magic bytes"), not from the file name or the
 * Content-Type header, which the client controls (docs/SECURITY.md T1).
 *
 * - PDF files start with "%PDF-".
 * - DOCX files are ZIP archives ("PK\x03\x04") containing "word/document.xml". ZIP stores file
 *   names as plain bytes, so a cheap search for that name tells DOCX apart from other ZIPs.
 */
export type SupportedFileType = 'pdf' | 'docx';

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_MARKER = Buffer.from('word/document.xml', 'latin1');

export function detectFileType(file: Buffer): SupportedFileType | null {
  if (startsWith(file, PDF_MAGIC)) return 'pdf';
  if (startsWith(file, ZIP_MAGIC) && file.includes(DOCX_MARKER)) return 'docx';
  return null;
}

function startsWith(file: Buffer, prefix: Buffer): boolean {
  return file.length >= prefix.length && file.subarray(0, prefix.length).equals(prefix);
}
