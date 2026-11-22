import {
  BARE_DOMAIN,
  EMAIL,
  HANDLE,
  PLACEHOLDERS,
  PHONE_CANDIDATE,
  TRAILING_PUNCTUATION,
  URL_LIKE,
  looksLikePhone,
  nameRegex,
} from './redact-contact.ts';

/**
 * The same PII scrub as the resume parse, for any other text that goes to an LLM: the bullets
 * and the job description in the tailoring step (CLAUDE.md: redact BEFORE any LLM call).
 * Unlike `redactContact`, it remembers the real values in order of appearance, so a rewritten
 * bullet can get its own email, link or phone back (docs/DECISIONS.md ADR-039).
 */
export type PlaceholderKind = 'name' | 'email' | 'phone' | 'link';

export type FoundValues = Record<PlaceholderKind, string[]>;

export interface ScrubbedText {
  text: string;
  found: FoundValues;
}

interface Match {
  start: number;
  end: number;
  kind: PlaceholderKind;
  value: string;
}

const KINDS: readonly PlaceholderKind[] = ['name', 'email', 'phone', 'link'];

/** The PLACEHOLDERS entry for each kind: [NAME], [EMAIL], [PHONE], [LINK]. */
const TOKEN: Record<PlaceholderKind, string> = {
  name: PLACEHOLDERS.name,
  email: PLACEHOLDERS.email,
  phone: PLACEHOLDERS.phone,
  link: PLACEHOLDERS.link,
};

function collect(text: string, knownName: string): Match[] {
  const matches: Match[] = [];
  const add = (kind: PlaceholderKind, start: number, value: string): void => {
    matches.push({ start, end: start + value.length, kind, value });
  };

  for (const m of text.matchAll(EMAIL)) add('email', m.index, m[0]);
  for (const m of text.matchAll(URL_LIKE))
    add('link', m.index, m[0].replace(TRAILING_PUNCTUATION, ''));
  for (const m of text.matchAll(BARE_DOMAIN))
    add('link', m.index, m[0].replace(TRAILING_PUNCTUATION, ''));
  for (const m of text.matchAll(HANDLE)) {
    const before = m[1] ?? '';
    add('link', m.index + before.length, m[0].slice(before.length));
  }
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    if (looksLikePhone(m[0])) add('phone', m.index, m[0].trim());
  }
  if (knownName.trim() !== '') {
    for (const m of text.matchAll(nameRegex(knownName.trim()))) add('name', m.index, m[0]);
  }
  return matches;
}

/** Replaces emails, links, handles, phones and the known name with placeholders, remembering them. */
export function redactText(text: string, knownName = ''): ScrubbedText {
  // Earlier first; when two matches start together the longer one wins; overlaps are dropped.
  const ordered = collect(text, knownName).sort((a, b) => a.start - b.start || b.end - a.end);
  const found: FoundValues = { name: [], email: [], phone: [], link: [] };

  let out = '';
  let last = 0;
  for (const match of ordered) {
    if (match.start < last) continue;
    out += text.slice(last, match.start) + TOKEN[match.kind];
    found[match.kind].push(match.value);
    last = match.end;
  }
  return { text: out + text.slice(last), found };
}

const PLACEHOLDER_PATTERN = /\[(NAME|EMAIL|PHONE|LINK)\]/g;

function countPlaceholders(text: string): Record<PlaceholderKind, number> {
  const counts: Record<PlaceholderKind, number> = { name: 0, email: 0, phone: 0, link: 0 };
  for (const m of text.matchAll(PLACEHOLDER_PATTERN)) {
    const kind = (m[1] ?? '').toLowerCase() as PlaceholderKind;
    counts[kind] += 1;
  }
  return counts;
}

/**
 * Puts the real values back into an AI rewrite of a redacted bullet. Only when the rewrite has
 * exactly as many placeholders of each kind as the original bullet: if it dropped one, added one
 * or invented one, we cannot know what belongs where, so the answer is null and the caller
 * blocks the suggestion ("placeholder changed").
 */
export function restorePlaceholders(suggested: string, found: FoundValues): string | null {
  const counts = countPlaceholders(suggested);
  if (KINDS.some((kind) => counts[kind] !== found[kind].length)) return null;

  const used: Record<PlaceholderKind, number> = { name: 0, email: 0, phone: 0, link: 0 };
  return suggested.replace(PLACEHOLDER_PATTERN, (_whole, name: string) => {
    const kind = name.toLowerCase() as PlaceholderKind;
    const value = found[kind][used[kind]];
    used[kind] += 1;
    return value ?? '';
  });
}
