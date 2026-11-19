import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ParseResponseSchema, UPLOAD_LIMITS } from '@tailex/shared';
import { createApp } from '../src/app.ts';
import {
  EXTRACTION_LIMITS,
  ExtractionError,
  extractText,
} from '../src/services/extract/extractor.ts';
import { detectFileType } from '../src/services/extract/file-type.ts';
import { checkZipLimits, DOCX_LIMITS } from '../src/services/extract/zip-limits.ts';
import { createMockProvider } from '../src/services/llm/mock.ts';
import { createProviderRegistry } from '../src/services/llm/registry.ts';
import { compileTex } from '../src/services/latex/compile.ts';
import { buildDocx, buildZip } from './helpers/docx.ts';
import { hasPdflatex } from './helpers/pdflatex.ts';

/** Rendered by our own LaTeX pipeline from FICTIONAL_RESUME (a fictional person). */
const FICTIONAL_PDF = readFileSync(
  new URL('./fixtures/files/fictional-resume.pdf', import.meta.url),
);

const FICTIONAL_DOCX = buildDocx([
  'Asha Testwala',
  'asha.testwala@example.com | +91 90000 00000',
  'Experience',
  'Built a React dashboard used by 40 internal support agents & 3 teams.',
]);

describe('extractText: PDF (unpdf)', () => {
  it('reads the text of a real PDF', async () => {
    const text = await extractText(FICTIONAL_PDF, 'pdf');

    expect(text).toContain('Asha Testwala');
    expect(text).toContain('Built a React dashboard');
    expect(text).toContain('Jest & Supertest');
  });

  it('rejects a file that only starts like a PDF', async () => {
    await expect(extractText(Buffer.from('%PDF-1.7 garbage'), 'pdf')).rejects.toBeInstanceOf(
      ExtractionError,
    );
  });

  // Needs pdflatex to build a long PDF, so it runs in Docker/CI (skipped on Windows with a warning).
  it.skipIf(!hasPdflatex)('rejects PDFs with more pages than the cap', async () => {
    const pages = Array.from(
      { length: EXTRACTION_LIMITS.maxPdfPages + 1 },
      (_, i) => `Page ${String(i)}`,
    );
    const tex = `\\documentclass{article}\\begin{document}${pages.join('\\newpage ')}\\end{document}`;
    const compiled = await compileTex(tex);
    if (!compiled.ok) throw new Error('could not build the test PDF');

    await expect(extractText(compiled.pdf, 'pdf')).rejects.toThrow('too many pages');
  });
});

describe('extractText: DOCX (mammoth)', () => {
  it('reads the paragraphs of a real DOCX', async () => {
    expect(detectFileType(FICTIONAL_DOCX)).toBe('docx');

    const text = await extractText(FICTIONAL_DOCX, 'docx');

    expect(text).toContain('Asha Testwala');
    expect(text).toContain('40 internal support agents & 3 teams');
  });

  it('rejects a ZIP that is not a Word document', async () => {
    const zip = buildZip([{ name: 'word/document.xml', data: Buffer.from('not xml at all') }]);

    await expect(extractText(zip, 'docx')).rejects.toBeInstanceOf(ExtractionError);
  });
});

describe('zip-bomb protection', () => {
  it('accepts a normal DOCX', () => {
    expect(checkZipLimits(FICTIONAL_DOCX)).toEqual({ ok: true });
  });

  it('rejects a small file that unpacks to more than 10 MB', () => {
    const bomb = buildZip([
      { name: 'word/document.xml', data: Buffer.alloc(DOCX_LIMITS.maxUncompressedBytes + 1) },
    ]);

    expect(bomb.length).toBeLessThan(UPLOAD_LIMITS.maxBytes); // it fits under the upload limit…
    expect(checkZipLimits(bomb)).toEqual({ ok: false, reason: 'unpacks too large' }); // …but not past this check
  });

  it('rejects archives with too many files', () => {
    const entries = Array.from({ length: DOCX_LIMITS.maxEntries + 1 }, (_, i) => ({
      name: `f${String(i)}`,
      data: Buffer.from('x'),
    }));

    expect(checkZipLimits(buildZip(entries))).toEqual({ ok: false, reason: 'too many files' });
  });

  it('rejects data with no ZIP directory', () => {
    expect(checkZipLimits(Buffer.from('PK\x03\x04 not really a zip'))).toEqual({
      ok: false,
      reason: 'not a readable ZIP',
    });
  });

  it('rejects a damaged directory instead of reading past the end', () => {
    const zip = buildZip([{ name: 'a', data: Buffer.from('x') }]);
    zip.writeUInt32LE(zip.length - 10, zip.length - 6); // point the directory past the file

    expect(checkZipLimits(zip)).toEqual({ ok: false, reason: 'damaged ZIP directory' });
  });

  it('extractText refuses the bomb before mammoth unpacks it', async () => {
    const bomb = buildZip([
      { name: 'word/document.xml', data: Buffer.alloc(DOCX_LIMITS.maxUncompressedBytes + 1) },
    ]);

    await expect(extractText(bomb, 'docx')).rejects.toThrow('unpacks too large');
  });
});

describe('POST /api/parse end to end (real extraction, mock LLM)', () => {
  it.each([
    ['PDF', FICTIONAL_PDF, 'application/pdf'],
    ['DOCX', FICTIONAL_DOCX, UPLOAD_LIMITS.contentTypes.docx],
  ])('parses an uploaded %s', async (_kind, file, type) => {
    const mock = createMockProvider();
    const app = createApp({ registry: createProviderRegistry({ mock }, { allowMock: true }) });

    const res = await request(app)
      .post('/api/parse')
      .set('x-llm-provider', 'mock')
      .set('x-llm-key', 'canary-user-key-1234567890')
      .set('content-type', type)
      .send(file);

    expect(res.status).toBe(200);
    const body = ParseResponseSchema.parse(res.body);
    expect(body.resume.contact.email).toBe('asha.testwala@example.com');
    // The LLM saw the real extracted text, minus the contact details.
    const sent = mock.calls[0]?.user ?? '';
    expect(sent).toContain('React dashboard');
    expect(sent).not.toContain('asha.testwala@example.com');
    expect(sent).not.toContain('+91 90000 00000');
  });
});
