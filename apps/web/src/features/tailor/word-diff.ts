/**
 * A word-level diff for the Accept/Reject list (docs/SPEC.md §10): which words of a bullet were
 * kept, removed or added. Our own longest-common-subsequence code (about 40 lines), not a
 * dependency (CLAUDE.md rule 3). Bullets are at most 400 characters, so the table stays tiny;
 * anything unexpectedly large falls back to "all removed, all added" instead of freezing the page.
 */
export type DiffKind = 'same' | 'removed' | 'added';

export interface DiffPart {
  kind: DiffKind;
  text: string;
}

/** Above this many tokens on either side we do not build the table. */
const MAX_TOKENS = 600;

/** Words and the spaces between them, so the diff can be joined back into exact text. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Does a word match another ignoring a trailing "," or "."? No: exact match only, so punctuation changes show. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return merge([
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ]);
  }

  // table[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const get = (i: number, j: number): number => table[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i];
    if (row === undefined) continue;
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? get(i + 1, j + 1) + 1 : Math.max(get(i + 1, j), get(i, j + 1));
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const wordA = a[i];
    const wordB = b[j];
    if (wordA !== undefined && wordB !== undefined && wordA === wordB) {
      parts.push({ kind: 'same', text: wordA });
      i += 1;
      j += 1;
    } else if (wordA !== undefined && (wordB === undefined || get(i + 1, j) >= get(i, j + 1))) {
      // Removed first, so a replaced word reads "old new", the usual way.
      parts.push({ kind: 'removed', text: wordA });
      i += 1;
    } else {
      parts.push({ kind: 'added', text: wordB ?? '' });
      j += 1;
    }
  }
  return merge(parts);
}

/** Joins neighbours of the same kind, so "Built a" is one part and not three. */
function merge(parts: readonly DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const part of parts) {
    if (part.text === '') continue;
    const last = merged.at(-1);
    if (last?.kind === part.kind) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}
