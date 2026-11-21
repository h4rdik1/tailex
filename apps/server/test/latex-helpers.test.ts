import { describe, expect, it } from 'vitest';
import { escapeHrefUrl } from '../src/services/latex/escape-href-url.ts';
import {
  parseLatexErrors,
  parsePageCount,
  parsePageFill,
} from '../src/services/latex/log-parser.ts';
import { createTextCleaner, isSupportedChar } from '../src/services/latex/normalize-text.ts';
import { createSlotLimiter } from '../src/services/latex/slot-limiter.ts';

describe('createTextCleaner', () => {
  it('keeps ASCII, accented Latin letters and common typography', () => {
    const cleaner = createTextCleaner();
    const text = 'José Müller – “quoted” • 10€ … naïve façade';

    expect(cleaner.clean(text)).toBe(text);
    expect(cleaner.droppedChars()).toEqual([]);
  });

  it('maps PDF ligatures and odd spaces/hyphens to plain characters', () => {
    const cleaner = createTextCleaner();

    expect(cleaner.clean('eﬃcient work ﬂow non‑stop −5')).toBe('efficient work flow non-stop -5');
    expect(cleaner.droppedChars()).toEqual([]);
  });

  it('joins a letter + combining accent into one character (NFC)', () => {
    expect(createTextCleaner().clean('José')).toBe('José');
  });

  it('removes invisible characters silently', () => {
    const cleaner = createTextCleaner();

    expect(cleaner.clean('a​b­c﻿d\u007Fe\u0085f')).toBe('abcdef');
    expect(cleaner.droppedChars()).toEqual([]);
  });

  it('drops unsupported characters and reports each one once, across calls', () => {
    const cleaner = createTextCleaner();

    expect(cleaner.clean('Shipped 🚀 fast 🚀')).toBe('Shipped  fast ');
    expect(cleaner.clean('Team 東京')).toBe('Team ');
    expect(cleaner.droppedChars()).toEqual(['🚀', '東', '京']);
  });

  it('leaves control characters for escapeLatex to handle', () => {
    expect(isSupportedChar('\n')).toBe(true);
  });
});

describe('escapeHrefUrl', () => {
  it('escapes only % # &', () => {
    expect(escapeHrefUrl('https://a.example/x%20y?a=1&b=2#top')).toBe(
      'https://a.example/x\\%20y?a=1\\&b=2\\#top',
    );
  });

  it('leaves other URL characters alone', () => {
    const url = 'https://a.example/~user/a_b/(c)';
    expect(escapeHrefUrl(url)).toBe(url);
  });
});

describe('parseLatexErrors', () => {
  it('extracts the message and line number', () => {
    const log = [
      'This is pdfTeX',
      '! Undefined control sequence.',
      '<argument> \\foo',
      'l.42 \\section{\\foo}',
      '',
    ].join('\n');

    expect(parseLatexErrors(log)).toEqual([{ message: 'Undefined control sequence.', line: 42 }]);
  });

  it('skips the generic "Fatal error occurred" line pdflatex adds after a real error', () => {
    const log = [
      '! Undefined control sequence.',
      'l.3 \\notACommand',
      '!  ==> Fatal error occurred, no output PDF file produced!',
    ].join('\n');

    expect(parseLatexErrors(log)).toEqual([{ message: 'Undefined control sequence.', line: 3 }]);
  });

  it('returns line null when the log has no l.<n> line', () => {
    expect(parseLatexErrors('! Emergency stop.\n*** (job aborted)')).toEqual([
      { message: 'Emergency stop.', line: null },
    ]);
  });

  it('caps the number and length of messages', () => {
    const log = Array.from({ length: 20 }, () => `! ${'x'.repeat(500)}`).join('\n');
    const errors = parseLatexErrors(log);

    expect(errors).toHaveLength(5);
    expect(errors[0]?.message).toHaveLength(200);
  });

  it('returns nothing for a clean log', () => {
    expect(parseLatexErrors('Output written on resume.pdf (1 page, 100 bytes).')).toEqual([]);
  });
});

describe('parsePageCount', () => {
  it.each([
    ['Output written on resume.pdf (1 page, 31337 bytes).', 1],
    ['Output written on resume.pdf (2 pages, 41234 bytes).', 2],
    ['No pages of output.', 0],
  ])('%s -> %i', (log, pages) => {
    expect(parsePageCount(log)).toBe(pages);
  });
});

describe('parsePageFill', () => {
  it('returns used height divided by page height', () => {
    expect(parsePageFill('x\nTAILEX-FILL 300.0pt 600.0pt\ny', 'TAILEX-FILL')).toBe(0.5);
  });

  it('caps at 1 when TeX reports a little more than the page height', () => {
    expect(parsePageFill('TAILEX-FILL 610.5pt 600.0pt', 'TAILEX-FILL')).toBe(1);
  });

  it.each([
    ['no marker', 'Output written on resume.pdf (1 page)'],
    ['empty page (TeX reports a huge goal)', 'TAILEX-FILL 0.0pt 16383.99998pt'],
    ['zero height', 'TAILEX-FILL 10pt 0.0pt'],
  ])('returns null for %s', (_name, log) => {
    expect(parsePageFill(log, 'TAILEX-FILL')).toBeNull();
  });
});

describe('createSlotLimiter', () => {
  it('hands out at most N slots and frees them on release', () => {
    const limiter = createSlotLimiter(2);
    const first = limiter.tryAcquire();
    const second = limiter.tryAcquire();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(limiter.tryAcquire()).toBeNull();

    first?.();
    expect(limiter.active).toBe(1);
    expect(limiter.tryAcquire()).not.toBeNull();
  });

  it('ignores a second release of the same slot', () => {
    const limiter = createSlotLimiter(1);
    const release = limiter.tryAcquire();

    release?.();
    release?.();
    expect(limiter.active).toBe(0);
  });
});
