/**
 * pdflatex (with T1 fonts) can only print a limited set of characters. An emoji or a Chinese
 * character makes the whole compile fail, so we clean every user string first (docs/DECISIONS.md
 * ADR-021). This runs BEFORE escapeLatex.
 *
 * - Common look-alikes are mapped (PDF ligatures like "ﬁ" -> "fi", non-breaking space -> space).
 * - Invisible characters (zero-width space, soft hyphen, BOM) are removed silently.
 * - Anything else outside the supported set is dropped and REPORTED, so the UI can warn the user.
 */

const REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  [' ', ' '], // non-breaking space
  ['‐', '-'], // hyphen
  ['‑', '-'], // non-breaking hyphen
  ['−', '-'], // minus sign
  ['ﬀ', 'ff'],
  ['ﬁ', 'fi'],
  ['ﬂ', 'fl'],
  ['ﬃ', 'ffi'],
  ['ﬄ', 'ffl'],
]);

const INVISIBLE = new Set(['\u007F', '­', '​', '‌', '‍', '⁠', '﻿']);

/** C1 control characters (U+0080 to U+009F): invisible garbage, often from bad PDF extraction. */
function isC1Control(code: number): boolean {
  return code >= 0x80 && code <= 0x9f;
}

/** Typographic characters outside Latin-1 that our fonts support (verified by a compile test). */
const EXTRA_SUPPORTED = new Set(['‘', '’', '“', '”', '–', '—', '…', '•', '€', '™']);

export function isSupportedChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  const isAsciiOrControl = code <= 0x7e; // control chars are handled later by escapeLatex
  const isLatin1 = code >= 0xa1 && code <= 0xff;
  return isAsciiOrControl || isLatin1 || EXTRA_SUPPORTED.has(char);
}

export interface TextCleaner {
  /** Returns the printable version of `text`. */
  clean(text: string): string;
  /** Every distinct character dropped so far, in the order first seen. */
  droppedChars(): string[];
}

/** One cleaner per render, so warnings are collected across all fields of the resume. */
export function createTextCleaner(): TextCleaner {
  const dropped = new Set<string>();

  function cleanChar(char: string): string {
    const replacement = REPLACEMENTS.get(char);
    if (replacement !== undefined) return replacement;
    if (INVISIBLE.has(char) || isC1Control(char.codePointAt(0) ?? 0)) return '';
    if (isSupportedChar(char)) return char;
    dropped.add(char);
    return '';
  }

  return {
    clean(text) {
      // NFC joins "e" + combining accent into "é", which the fonts support.
      // Array.from splits by code point, so an emoji is one item, not two halves.
      return Array.from(text.normalize('NFC'), cleanChar).join('');
    },
    droppedChars() {
      return [...dropped];
    },
  };
}
