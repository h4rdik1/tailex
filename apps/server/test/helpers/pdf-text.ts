import { inflateSync } from 'node:zlib';

/**
 * Test-only, very small PDF text reader (no dependency). pdflatex stores each page's drawing
 * commands in zlib-compressed "streams"; text is drawn by operators like `(Hello) Tj` or
 * `[(Hel) -20 (lo)] TJ`. We inflate every stream and join the strings inside parentheses.
 *
 * Spaces between words are positioning in TeX, not characters, so words run together
 * ("BuiltaReact"). Tests therefore search for single words or space-free strings.
 * With T1 fonts, ASCII letters and symbols such as \ { } use their usual character codes.
 */
export function extractPdfText(pdf: Buffer): string {
  return inflateStreams(pdf).map(textFromContentStream).join('');
}

function inflateStreams(pdf: Buffer): string[] {
  const contents: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const start = pdf.indexOf('stream', searchFrom, 'latin1');
    if (start === -1) break;
    const dataStart = skipLineEnd(pdf, start + 'stream'.length);
    const end = pdf.indexOf('endstream', dataStart, 'latin1');
    if (end === -1) break;
    try {
      contents.push(inflateSync(pdf.subarray(dataStart, end)).toString('latin1'));
    } catch {
      // Not a zlib stream (for example an embedded font): ignore it.
    }
    searchFrom = end + 'endstream'.length;
  }
  return contents;
}

function skipLineEnd(pdf: Buffer, index: number): number {
  if (pdf[index] === 0x0d) index += 1; // \r
  if (pdf[index] === 0x0a) index += 1; // \n
  return index;
}

/** Reads the PDF string literals "( ... )" inside text blocks, decoding \\ \( \) and octal escapes. */
function textFromContentStream(content: string): string {
  let text = '';
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] !== '(') continue;
    let depth = 1;
    i += 1;
    while (i < content.length && depth > 0) {
      const char = content[i] ?? '';
      if (char === '\\') {
        const { decoded, length } = decodeEscape(content, i + 1);
        text += decoded;
        i += length + 1;
        continue;
      }
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (depth > 0) text += char;
      i += 1;
    }
  }
  return text;
}

function decodeEscape(content: string, index: number): { decoded: string; length: number } {
  const octal = /^[0-7]{1,3}/.exec(content.slice(index, index + 3));
  if (octal !== null) {
    return { decoded: String.fromCharCode(parseInt(octal[0], 8)), length: octal[0].length };
  }
  return { decoded: content[index] ?? '', length: 1 };
}
