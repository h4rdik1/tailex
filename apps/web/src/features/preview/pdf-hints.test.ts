import { describe, expect, it } from 'vitest';
import { pdfHint } from './pdf-hints.ts';

describe('pdfHint', () => {
  it('warns when even the densest layout needs two pages', () => {
    expect(pdfHint({ pageCount: 2, fill: 0.5 })).toMatchObject({ tone: 'warning' });
  });

  it('suggests adding content when the page is mostly empty', () => {
    expect(pdfHint({ pageCount: 1, fill: 0.55 })).toEqual({
      tone: 'info',
      text: expect.stringContaining('about 55%') as unknown,
    });
  });

  it.each([
    { pageCount: 1, fill: 0.75 },
    { pageCount: 1, fill: 1 },
    { pageCount: 1, fill: null }, // unknown: say nothing rather than guess
  ])('says nothing for a well-filled or unmeasured page %o', (pdf) => {
    expect(pdfHint(pdf)).toBeNull();
  });
});
