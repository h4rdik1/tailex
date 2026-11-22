import { ALIAS_RULES } from './skills.ts';
import { normalizeText, type NormalizedText } from './normalize.ts';

/**
 * Finds skills in free text (docs/DECISIONS.md ADR-039). Plain `indexOf` plus boundary checks:
 * no regex built from user text and no backtracking, so a hostile job description (one giant
 * word, the same skill 5 000 times) cannot make it slow. Work is limited by the text length.
 */
export interface SkillHit {
  canonical: string;
  category: string;
  start: number;
  end: number;
  /** Index into `ScanResult.sentences`. */
  sentence: number;
  /** Index into `ScanResult.lines`. */
  line: number;
}

export interface Span {
  start: number;
  end: number;
}

export interface ScanResult {
  text: NormalizedText;
  hits: SkillHit[];
  sentences: Span[];
  lines: Span[];
}

const isAlnum = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char);

/**
 * Does the alias at [start, start + length) stand alone? Returns the end of the match (one longer
 * for a plural "s": "microservices"), or -1 when the neighbours make it part of another word.
 * `c` must not match inside `c++` or `cpp`, `java` not inside `javascript`, `node` not inside
 * `node.js`, and a file name like `package.json` is not the skill `json`.
 */
function boundaryEnd(lower: string, start: number, alias: string): number {
  const end = start + alias.length;
  const prev = lower[start - 1];
  const next = lower[end];
  const first = alias[0];
  const last = alias[alias.length - 1];

  if (isAlnum(first) && (isAlnum(prev) || prev === '&')) return -1;
  if (first === '.' && isAlnum(prev)) return -1;
  if (isAlnum(first) && prev === '.' && isAlnum(lower[start - 2])) return -1;

  if (isAlnum(last)) {
    const plural =
      next === 's' && !isAlnum(lower[end + 1]) && alias.length >= 4 && !alias.endsWith('s');
    if (plural) return end + 1;
    if (isAlnum(next) || next === '+' || next === '#' || next === '&') return -1;
    if (next === '.' && isAlnum(lower[end + 1])) return -1;
    return end;
  }
  return isAlnum(next) ? -1 : end;
}

/** Sentences end at a newline or at . ! ? ; followed by a space. */
function splitSpans(text: string, isBoundary: (index: number) => boolean): Span[] {
  const spans: Span[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (isBoundary(i)) {
      spans.push({ start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < text.length) spans.push({ start, end: text.length });
  return spans;
}

function indexTable(length: number, spans: readonly Span[]): Int32Array {
  const table = new Int32Array(length);
  spans.forEach((span, index) => {
    table.fill(index, span.start, span.end);
  });
  return table;
}

const SENTENCE_END = new Set(['.', '!', '?', ';']);

export function scanSkills(raw: string): ScanResult {
  const text = normalizeText(raw);
  const { lower, cased } = text;

  const lines = splitSpans(lower, (i) => lower[i] === '\n');
  const sentences = splitSpans(
    lower,
    (i) =>
      lower[i] === '\n' ||
      (SENTENCE_END.has(lower[i] ?? '') && (lower[i + 1] === ' ' || lower[i + 1] === '\n')),
  );
  const sentenceAt = indexTable(lower.length, sentences);
  const lineAt = indexTable(lower.length, lines);

  const taken = new Uint8Array(lower.length);
  const hits: SkillHit[] = [];
  const sentencesWithSkill = new Set<number>();

  const collect = (ambiguousPass: boolean): void => {
    for (const rule of ALIAS_RULES) {
      if (rule.ambiguous !== ambiguousPass) continue;
      let from = 0;
      for (;;) {
        const start = lower.indexOf(rule.alias, from);
        if (start === -1) break;
        from = start + 1;
        const end = boundaryEnd(lower, start, rule.alias);
        if (end === -1 || taken.subarray(start, end).some((flag) => flag === 1)) continue;
        if (
          ambiguousPass &&
          !looksLikeSkillUse(lower, cased, start, end, sentenceAt, sentencesWithSkill)
        ) {
          continue;
        }
        taken.fill(1, start, end);
        hits.push({
          canonical: rule.canonical,
          category: rule.category,
          start,
          end,
          sentence: sentenceAt[start] ?? 0,
          line: lineAt[start] ?? 0,
        });
        if (!ambiguousPass) sentencesWithSkill.add(sentenceAt[start] ?? 0);
      }
    }
  };
  collect(false);
  collect(true);

  hits.sort((a, b) => a.start - b.start);
  return { text, hits, sentences, lines };
}

/**
 * "Go", "R", "C", "Swift", "Excel", "Express" are also ordinary words or single letters. They
 * count only when written with a capital letter AND used like a skill: another skill in the same
 * sentence ("Python and Go"), or sitting in a list or after a label ("Languages: Go", "C, R").
 */
function looksLikeSkillUse(
  lower: string,
  cased: string,
  start: number,
  end: number,
  sentenceAt: Int32Array,
  sentencesWithSkill: ReadonlySet<number>,
): boolean {
  if (!/\p{Lu}/u.test(cased[start] ?? '')) return false;
  if (sentencesWithSkill.has(sentenceAt[start] ?? -1)) return true;
  const before = lower.slice(0, start).trimEnd().slice(-1);
  const after = lower.slice(end).trimStart().charAt(0);
  return [',', ':', '/', '(', '|'].includes(before) || [',', '/', ')', '|'].includes(after);
}
