/**
 * Cleans pasted text before matching skills (docs/DECISIONS.md ADR-009, ADR-039).
 * Job descriptions are copied from web pages, so they carry HTML, odd spaces, zero-width
 * characters and fancy bullets. All of those are removed or turned into plain separators.
 */

/** A character class from numeric code point ranges: explicit, and no invisible characters in the source. */
function charClass(ranges: readonly (readonly [number, number])[]): RegExp {
  const body = ranges
    .map(([from, to]) => `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`)
    .join('');
  return new RegExp(`[${body}]`, 'gu');
}

/** Control characters except tab and newline, zero-width spaces and joiners, direction marks, BOM. */
const INVISIBLE = charClass([
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0xfeff, 0xfeff],
]);
/** Fancy bullets: • · ● ▪ ◦ ‣ ▸ ► ■ □ become line breaks. */
const BULLET_CHARS = charClass(
  [0x2022, 0xb7, 0x25cf, 0x25aa, 0x25e6, 0x2023, 0x25b8, 0x25ba, 0x25a0, 0x25a1].map(
    (code) => [code, code] as const,
  ),
);
/** Hyphen, en dash, em dash, minus sign and friends become a plain hyphen. */
const DASHES = charClass([
  [0x2010, 0x2015],
  [0x2212, 0x2212],
]);
/** Tab, no-break space and the other Unicode spaces become a plain space. */
const ODD_SPACES = charClass([
  [0x09, 0x09],
  [0xa0, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
]);
/** Curly single quotes become a plain apostrophe. */
const CURLY_QUOTES = charClass([[0x2018, 0x2019]]);

const HTML_TAG = /<[^>]*>/g;
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
};

export interface NormalizedText {
  /** Lowercase, hyphens as spaces, single spaces, "\n" between lines. Used for matching. */
  lower: string;
  /** The same characters with the ORIGINAL case, for names that must be matched exactly ("Go"). */
  cased: string;
}

/** Same length as `text`: a character whose lowercase form is longer is left as it is. */
function lowerKeepingLength(text: string): string {
  let out = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    out += lower.length === char.length ? lower : char;
  }
  return out;
}

export function normalizeText(raw: string): NormalizedText {
  const cased = raw
    .replace(HTML_TAG, ' ')
    .replace(/&(?:amp|nbsp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? ' ')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\r\n?/g, '\n')
    .replace(BULLET_CHARS, '\n')
    .replace(DASHES, '-')
    .replace(CURLY_QUOTES, "'")
    .replace(ODD_SPACES, ' ')
    // A hyphen between words is a space for matching: "front-end" and "front end" are the same.
    .replace(/-/g, ' ')
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .join('\n');
  return { cased, lower: lowerKeepingLength(cased) };
}

/** Aliases are normalised exactly like the text, so they compare character for character. */
export function normalizeAlias(alias: string): string {
  return normalizeText(alias).lower;
}
