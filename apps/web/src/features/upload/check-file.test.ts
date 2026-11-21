import { describe, expect, it } from 'vitest';
import { checkFile } from './check-file.ts';

describe('checkFile', () => {
  it.each(['resume.pdf', 'Resume.PDF', 'cv.docx'])('accepts %s', (name) => {
    expect(checkFile({ name, size: 1000 })).toBeNull();
  });

  it.each(['resume.doc', 'resume.txt', 'resume.pdf.exe', 'resume'])('rejects %s', (name) => {
    expect(checkFile({ name, size: 1000 })).toMatch(/PDF and DOCX/);
  });

  it('rejects an empty file', () => {
    expect(checkFile({ name: 'a.pdf', size: 0 })).toMatch(/empty/);
  });

  it('rejects files over 1 MB and accepts exactly 1 MB', () => {
    expect(checkFile({ name: 'a.pdf', size: 1024 * 1024 + 1 })).toMatch(/1 MB/);
    expect(checkFile({ name: 'a.pdf', size: 1024 * 1024 })).toBeNull();
  });
});
