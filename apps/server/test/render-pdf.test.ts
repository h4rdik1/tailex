import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, type ResumeData } from '@tailex/shared';
import { compileTex, type CompileResult } from '../src/services/latex/compile.ts';
import { autoFitRender } from '../src/services/latex/layout.ts';
import { parsePageFill } from '../src/services/latex/log-parser.ts';
import { FILL_MARKER, renderResumeTex } from '../src/services/latex/template.ts';
import { hasPdflatex } from './helpers/pdflatex.ts';
import { extractPdfText } from './helpers/pdf-text.ts';
import { INJECTION_PAYLOADS } from './helpers/payloads.ts';

function expectOk(result: CompileResult): Extract<CompileResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected a successful compile, got ${JSON.stringify(result)}`);
  return result;
}

async function renderPdf(resume: ResumeData) {
  const { tex, droppedChars } = renderResumeTex(resume, { layout: 'comfortable', fillPage: false });
  return { result: expectOk(await compileTex(tex)), droppedChars };
}

/** A fictional resume with `jobs` extra jobs of `bullets` one-line bullets each. */
function withJobs(jobs: number, bullets: number): ResumeData {
  const resume = structuredClone(FICTIONAL_RESUME);
  for (let i = 0; i < jobs; i += 1) {
    resume.experience.push({
      id: `x${String(i)}`,
      title: 'Software Engineer',
      company: 'Fictional Co',
      location: 'Remote',
      startDate: '2019',
      endDate: '2020',
      bullets: Array.from({ length: bullets }, (_, j) => ({
        id: `x${String(i)}-b${String(j)}`,
        text: 'Delivered a measurable improvement to a fictional internal system used by many teams.',
      })),
    });
  }
  return resume;
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

  it('measures how full the page is', async () => {
    const { result } = await renderPdf(FICTIONAL_RESUME);
    const fill = parsePageFill(result.log, FILL_MARKER);

    expect(fill).not.toBeNull();
    expect(fill).toBeGreaterThan(0.2);
    expect(fill).toBeLessThan(0.9);
  });
});

/** The auto-fit loop against real pdflatex: the "classification" the user sees. */
describe.skipIf(!hasPdflatex)('autoFitRender with real pdflatex', () => {
  it('a short resume keeps the roomiest layout, top-aligned', async () => {
    const result = await autoFitRender(FICTIONAL_RESUME, compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'roomy', pageCount: 1, stretched: false });
  });

  it('a medium resume fills the page down to the bottom margin', async () => {
    const result = await autoFitRender(withJobs(2, 5), compileTex);

    expect(result).toMatchObject({ ok: true, pageCount: 1, stretched: true });
    expect(result.ok && result.fill).toBeGreaterThanOrEqual(0.75);
  });

  it('a long resume moves to a denser layout and still fits one page', async () => {
    const result = await autoFitRender(withJobs(4, 5), compileTex);

    expect(result.ok && result.layout).not.toBe('roomy');
    expect(result).toMatchObject({ ok: true, pageCount: 1 });
  });

  it('a resume too long for any layout comes back dense, with its real page count', async () => {
    const result = await autoFitRender(withJobs(9, 8), compileTex);

    expect(result).toMatchObject({ ok: true, layout: 'dense' });
    expect(result.ok && result.pageCount).toBeGreaterThan(1);
  });
});
