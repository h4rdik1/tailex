import { describe, expect, it } from 'vitest';
import { escapeLatex } from '../src/services/latex/escape-latex.ts';
import { INJECTION_PAYLOADS } from './helpers/payloads.ts';

/** The contract from escape-latex.spec.md. */
const SPECIAL_CHARS: ReadonlyArray<[string, string]> = [
  ['\\', '\\textbackslash{}'],
  ['{', '\\{'],
  ['}', '\\}'],
  ['&', '\\&'],
  ['%', '\\%'],
  ['$', '\\$'],
  ['#', '\\#'],
  ['_', '\\_'],
  ['~', '\\textasciitilde{}'],
  ['^', '\\textasciicircum{}'],
];

describe('escapeLatex: each special character', () => {
  it.each(SPECIAL_CHARS)('escapes %s on its own', (input, expected) => {
    expect(escapeLatex(input)).toBe(expected);
  });

  it.each(SPECIAL_CHARS)('escapes %s inside a word', (input, expected) => {
    expect(escapeLatex(`a${input}b`)).toBe(`a${expected}b`);
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeLatex('50% of 80%')).toBe('50\\% of 80\\%');
  });
});

describe('escapeLatex: ordinary text', () => {
  it.each([
    ['', ''],
    ['Built a React dashboard', 'Built a React dashboard'],
    ['José Müller – “quoted” • 10€', 'José Müller – “quoted” • 10€'],
    ['a < b > c | d', 'a < b > c | d'],
    ['Node.js, C++, .NET', 'Node.js, C++, .NET'],
  ])('leaves %j unchanged', (input, expected) => {
    expect(escapeLatex(input)).toBe(expected);
  });
});

describe('escapeLatex: control characters', () => {
  it('turns newlines, carriage returns and tabs into single spaces', () => {
    expect(escapeLatex('a\nb\r\nc\td')).toBe('a b  c d');
  });

  it('removes other control characters and DEL', () => {
    expect(escapeLatex('a\u0000b\u0007c\u001Bd\u007Fe')).toBe('abcde');
  });
});

describe('escapeLatex: single pass (no double escaping)', () => {
  it('does not escape the braces it adds for a backslash', () => {
    expect(escapeLatex('\\')).toBe('\\textbackslash{}');
  });

  it('handles an already-escaped looking input as plain text', () => {
    expect(escapeLatex('\\&')).toBe('\\textbackslash{}\\&');
  });

  it('is not idempotent, so callers must escape exactly once', () => {
    expect(escapeLatex(escapeLatex('&'))).not.toBe(escapeLatex('&'));
  });
});

describe('escapeLatex: injection payloads', () => {
  it.each([
    ['\\input{/etc/passwd}', '\\textbackslash{}input\\{/etc/passwd\\}'],
    ['\\write18{rm -rf /}', '\\textbackslash{}write18\\{rm -rf /\\}'],
    ['^^5cinput', '\\textasciicircum{}\\textasciicircum{}5cinput'],
    ['$\\alpha$', '\\$\\textbackslash{}alpha\\$'],
    ['} \\end{document}', '\\} \\textbackslash{}end\\{document\\}'],
  ])('neutralises %s', (input, expected) => {
    expect(escapeLatex(input)).toBe(expected);
  });

  it.each(INJECTION_PAYLOADS)('leaves no live command in %s', (payload) => {
    expect(findUnescapedSpecial(escapeLatex(payload))).toBeNull();
  });
});

/**
 * Seeded fuzz test (no extra dependency). Random strings mixing specials, letters and
 * control characters; after escaping, no special character may be left "live".
 */
describe('escapeLatex: fuzz', () => {
  const ALPHABET = [
    '\\',
    '{',
    '}',
    '&',
    '%',
    '$',
    '#',
    '_',
    '~',
    '^',
    'a',
    'Z',
    '1',
    ' ',
    '\n',
    '\t',
    '\u0001',
    'é',
    '–',
  ];

  it('never leaves an unescaped special character (2,000 random strings)', () => {
    const random = seededRandom(20261120);
    for (let run = 0; run < 2_000; run += 1) {
      const length = Math.floor(random() * 40);
      const input = Array.from(
        { length },
        () => ALPHABET[Math.floor(random() * ALPHABET.length)],
      ).join('');

      const output = escapeLatex(input);

      expect(findUnescapedSpecial(output), `input: ${JSON.stringify(input)}`).toBeNull();
      expect(hasControlChar(output), `input: ${JSON.stringify(input)}`).toBe(false);
    }
  });
});

/**
 * Removes every escape sequence the spec allows, then looks for any special character left.
 * Returns the first live special character, or null if the output is safe.
 */
function findUnescapedSpecial(output: string): string | null {
  const withoutEscapes = output
    .replaceAll('\\textbackslash{}', '')
    .replaceAll('\\textasciitilde{}', '')
    .replaceAll('\\textasciicircum{}', '')
    .replace(/\\[{}&%$#_]/g, '');
  const live = /[\\{}&%$#_~^]/.exec(withoutEscapes);
  return live === null ? null : live[0];
}

/** Small deterministic PRNG (mulberry32), so a failing fuzz case is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** True if the text still contains a C0 control character or DEL. */
function hasControlChar(text: string): boolean {
  return Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
