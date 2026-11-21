import { UPLOAD_LIMITS } from '@tailex/shared';

/**
 * Quick checks in the browser so the user gets instant feedback. They are only a convenience:
 * the server checks size and magic bytes again and is the real gate (docs/SECURITY.md).
 */
export function checkFile(file: { name: string; size: number }): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
    return 'Only PDF and DOCX files are supported.';
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > UPLOAD_LIMITS.maxBytes) {
    return 'That file is larger than 1 MB. Try exporting a smaller PDF.';
  }
  return null;
}
