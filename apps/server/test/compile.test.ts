import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compileTex, WORK_DIR_PREFIX, type CompileResult } from '../src/services/latex/compile.ts';
import { hasPdflatex } from './helpers/pdflatex.ts';
import { extractPdfText } from './helpers/pdf-text.ts';

/** A tiny raw LaTeX document. These tests call pdflatex directly, WITHOUT escapeLatex. */
function doc(body: string): string {
  return `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
}

/**
 * This file's own parent folder for work folders. Other test files compile PDFs at the same
 * time, so checking the shared OS temp folder for leftovers would be flaky.
 */
const tempRoot = mkdtempSync(path.join(tmpdir(), 'tailex-compile-test-'));
afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function workDirsLeft(): string[] {
  return readdirSync(tempRoot).filter((name) => name.startsWith(WORK_DIR_PREFIX));
}

function expectOk(result: CompileResult): Extract<CompileResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected a successful compile, got ${JSON.stringify(result)}`);
  return result;
}

describe.skipIf(!hasPdflatex)('compileTex (real pdflatex)', () => {
  beforeEach(() => {
    expect(workDirsLeft()).toEqual([]);
  });

  it('compiles a document to a one-page PDF', async () => {
    const result = expectOk(await compileTex(doc('Hello Tailex'), { tempRoot }));

    expect(result.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(result.pageCount).toBe(1);
    expect(extractPdfText(result.pdf)).toContain('Tailex');
    expect(workDirsLeft()).toEqual([]);
  });

  it('reports the page count when content spills over', async () => {
    const result = expectOk(await compileTex(doc('one \\newpage two'), { tempRoot }));

    expect(result.pageCount).toBe(2);
  });

  it('returns a readable error with a line number, and cleans up', async () => {
    const result = await compileTex(doc('\\notACommand'), { tempRoot });

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      errors: [{ message: 'Undefined control sequence.', line: 3 }],
    });
    expect(workDirsLeft()).toEqual([]);
  });

  it('kills an endless compile after the timeout, and cleans up', async () => {
    const started = Date.now();
    const result = await compileTex(doc('\\def\\spin{\\spin}\\spin'), {
      timeoutMs: 1_000,
      tempRoot,
    });

    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(workDirsLeft()).toEqual([]);
  });
});

/**
 * Defense in depth (docs/SECURITY.md T8): even if raw TeX ever got past escapeLatex,
 * the sandbox flags must stop it from reading or writing files or running commands.
 */
describe.skipIf(!hasPdflatex)('pdflatex sandbox (raw malicious TeX)', () => {
  const canaryFiles = [
    path.join(tmpdir(), 'tailex-pwned-shell'),
    path.join(tmpdir(), 'tailex-pwned-openout.tex'),
  ];

  beforeEach(() => {
    for (const file of canaryFiles) rmSync(file, { force: true });
  });

  // Each assertion checks the sandbox's specific refusal, not just "the compile failed":
  // WITHOUT openin_any=p, \input{/etc/passwd} does read the file and then fails on its contents,
  // so "it failed" alone would pass even with no sandbox (verified manually, docs/LEARNING.md).
  it.each([
    ['an absolute path', '\\input{/etc/passwd}'],
    ['parent folders', '\\input{../../../../etc/passwd}'],
  ])('refuses to \\input /etc/passwd via %s', async (_name, payload) => {
    const result = await compileTex(doc(payload));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason === 'error' && result.errors[0]?.message).toMatch(
      /^LaTeX Error: File `.*etc\/passwd\.tex' not found\.$/,
    );
  });

  it('cannot open /etc/passwd with \\openin (the stream stays closed)', async () => {
    const result = expectOk(
      await compileTex(
        doc('\\newread\\r \\immediate\\openin\\r=/etc/passwd \\ifeof\\r CLOSED\\else OPENED\\fi'),
      ),
    );

    const text = extractPdfText(result.pdf);
    expect(text).toContain('CLOSED');
    expect(text).not.toContain('OPENED');
  });

  it('cannot run shell commands with \\write18', async () => {
    const target = canaryFiles[0] ?? '';
    const result = expectOk(await compileTex(doc(`\\immediate\\write18{touch ${target}}done`)));

    expect(result.log).toContain(`runsystem(touch ${target})...disabled`);
    expect(existsSync(target)).toBe(false);
  });

  it('cannot write files outside its work folder', async () => {
    const target = canaryFiles[1] ?? '';
    const result = await compileTex(
      doc(`\\newwrite\\out \\immediate\\openout\\out=${target} \\immediate\\write\\out{x}`),
    );

    expect(!result.ok && result.reason === 'error' && result.errors[0]?.message).toBe(
      `I can't write on file \`${target}'.`,
    );
    expect(existsSync(target)).toBe(false);
  });
});
