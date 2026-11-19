import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, type ResumeData } from '@tailex/shared';
import { compileTex, type CompileResult } from '../src/services/latex/compile.ts';
import { renderResumeTex } from '../src/services/latex/template.ts';
import { hasPdflatex } from './helpers/pdflatex.ts';
import { extractPdfText } from './helpers/pdf-text.ts';
import { INJECTION_PAYLOADS } from './helpers/payloads.ts';

function expectOk(result: CompileResult): Extract<CompileResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected a successful compile, got ${JSON.stringify(result)}`);
  return result;
}

async function renderPdf(resume: ResumeData, spacing: 'normal' | 'tight' = 'normal') {
  const { tex, droppedChars } = renderResumeTex(resume, spacing);
  return { result: expectOk(await compileTex(tex)), droppedChars };
}

/** Removes the spaces that TeX turns into positioning, to match extracted PDF text. */
function squash(text: string): string {
  return text.replace(/\s+/g, '');
}

/** End-to-end template tests: real pdflatex + the owner's escapeLatex. */
describe.skipIf(!hasPdflatex)('resume template → PDF (needs escapeLatex)', () => {
  it('renders the fictional sample on exactly one page, as real text', async () => {
    const { result, droppedChars } = await renderPdf(FICTIONAL_RESUME);
    const text = extractPdfText(result.pdf);

    expect(result.pageCount).toBe(1);
    expect(droppedChars).toEqual([]);
    expect(text).toContain(squash(FICTIONAL_RESUME.contact.name));
    expect(text).toContain('Experience');
    expect(text).toContain(squash('Jest & Supertest')); // & printed, not used as a column break
    expect(text).toContain(squash('85% (from 60%)')); // % printed, not a comment
  });

  it('prints every injection payload as literal text and never executes it', async () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.projects[0]?.bullets.push(
      ...INJECTION_PAYLOADS.map((text, index) => ({ id: `proj0-b${String(index + 1)}`, text })),
    );

    const { result } = await renderPdf(resume);
    const text = extractPdfText(result.pdf);

    for (const payload of INJECTION_PAYLOADS) {
      expect(text).toContain(squash(payload));
    }
    expect(result.log).not.toContain('(/etc/passwd');
    expect(result.log).not.toContain('runsystem');
  });

  it('compiles every character the cleaner lets through', async () => {
    const latin1 = Array.from({ length: 0xff - 0xa1 + 1 }, (_, i) => String.fromCharCode(0xa1 + i));
    const ascii = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i));
    const extras = ['‘', '’', '“', '”', '–', '—', '…', '•', '€', '™'];
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.projects[0]?.bullets.push(
      { id: 'proj0-b1', text: ascii.join('') },
      { id: 'proj0-b2', text: latin1.join('') },
      { id: 'proj0-b3', text: extras.join(' ') },
    );

    const { result, droppedChars } = await renderPdf(resume);

    expect(droppedChars).toEqual([]);
    expect(result.pageCount).toBeGreaterThan(0);
  });

  it('keeps link targets intact, including % # & in the URL', async () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    const url = 'https://asha.example.org/a%20b?x=1&y=2#top';
    resume.contact.links = [{ id: 'link0', label: 'Portfolio', url }];

    const { result } = await renderPdf(resume);

    // PDF syntax allows "/URI(" with or without a space, so match either.
    expect(result.pdf.toString('latin1')).toContain(`(${url})`);
    expect(result.pdf.toString('latin1')).toMatch(/\/URI\s*\(https:/);
  });

  it('reports overflow beyond one page, and tight spacing never uses more pages', async () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    const longBullet = 'Delivered a measurable improvement to a fictional internal system. '.repeat(
      4,
    );
    resume.experience = Array.from({ length: 6 }, (_, i) => ({
      id: `exp${String(i)}`,
      title: 'Software Engineer',
      company: 'Fictional Co',
      location: 'Remote',
      startDate: '2020',
      endDate: '2021',
      bullets: Array.from({ length: 5 }, (__, j) => ({
        id: `exp${String(i)}-b${String(j)}`,
        text: longBullet,
      })),
    }));

    const normal = await renderPdf(resume, 'normal');
    const tight = await renderPdf(resume, 'tight');

    expect(normal.result.pageCount).toBeGreaterThan(1);
    expect(tight.result.pageCount).toBeLessThanOrEqual(normal.result.pageCount);
  });
});
