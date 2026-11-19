import { SAFE_URL_PATTERN, type Contact, type Link } from '@tailex/shared';

/**
 * Best-effort PII redaction (docs/DECISIONS.md ADR-005). Runs in OUR code before any text goes to
 * the LLM. Contact details are replaced with placeholders and returned separately, so the user can
 * confirm them in the review form and they are put back only when rendering the PDF.
 *
 * "Best-effort" is honest: the UI says so and shows the exact redacted text ("See what's sent").
 */

export const PLACEHOLDERS = {
  name: '[NAME]',
  email: '[EMAIL]',
  phone: '[PHONE]',
  link: '[LINK]',
} as const;

export interface RedactionResult {
  redactedText: string;
  contact: Contact;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** http(s) URLs, www. addresses and bare profile links like linkedin.com/in/x or github.com/x. */
const URL_LIKE =
  /\b(?:https?:\/\/[^\s<>()"']+|www\.[^\s<>()"']+|(?:linkedin\.com|github\.com|gitlab\.com|x\.com|twitter\.com|leetcode\.com)\/[^\s<>()"']+)/gi;

/** @handles (emails are already gone by the time this runs, so "a@b.com" can't match). */
const HANDLE = /(^|[\s(|,])@([A-Za-z0-9_]{2,30})\b/g;

/**
 * Phone-shaped runs: optional +country code, then 2–5 groups of digits separated by space, dot,
 * dash or brackets. Candidates are then filtered by digit count (10–15) and "not a list of years".
 */
const PHONE_CANDIDATE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){1,4}\d{2,5}/g;

const NON_NAME_FIRST_LINES = new Set(['resume', 'curriculum vitae', 'cv', 'résumé', 'profile']);

export function redactContact(text: string): RedactionResult {
  const emails: string[] = [];
  const links: string[] = [];
  const phones: string[] = [];

  let redacted = text.replace(EMAIL, (match) => {
    emails.push(match);
    return PLACEHOLDERS.email;
  });

  redacted = redacted.replace(URL_LIKE, (match) => {
    links.push(trimTrailingPunctuation(match));
    return PLACEHOLDERS.link + trailingPunctuation(match);
  });

  redacted = redacted.replace(HANDLE, (_match, before: string) => `${before}${PLACEHOLDERS.link}`);

  redacted = redacted.replace(PHONE_CANDIDATE, (match) => {
    if (!looksLikePhone(match)) return match;
    phones.push(match.trim());
    return PLACEHOLDERS.phone;
  });

  const name = guessName(text);
  if (name !== '') {
    redacted = replaceAllCaseInsensitive(redacted, name, PLACEHOLDERS.name);
  }

  return {
    redactedText: redacted,
    contact: {
      name,
      email: emails[0] ?? '',
      phone: phones[0] ?? '',
      location: '',
      links: toLinks(links),
    },
  };
}

function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return false;
  // "2019 2020 2021" or "2019-2023" are years, not phone numbers.
  const groups = candidate
    .trim()
    .split(/[\s.\-()]+/)
    .filter((group) => group !== '');
  return !groups.every((group) => /^(19|20)\d{2}$/.test(group));
}

/**
 * A resume usually starts with the person's name: 2–4 capitalised words, letters only.
 * If the first line doesn't look like that, we don't guess (the user fills it in on review).
 */
export function guessName(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (firstLine === undefined) return '';
  if (NON_NAME_FIRST_LINES.has(firstLine.toLowerCase())) return '';

  const words = firstLine.split(/\s+/);
  const isNameWord = (word: string): boolean => /^\p{Lu}[\p{L}'.-]*$/u.test(word);
  if (words.length < 2 || words.length > 4 || !words.every(isNameWord)) return '';
  return firstLine;
}

function toLinks(urls: readonly string[]): Link[] {
  const unique = [...new Set(urls)];
  return unique
    .map((url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`))
    .filter((url) => SAFE_URL_PATTERN.test(url))
    .slice(0, 5)
    .map((url, index) => ({
      id: `link${String(index)}`,
      label: url.replace(/^https?:\/\//i, ''),
      url,
    }));
}

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function trimTrailingPunctuation(url: string): string {
  return url.replace(TRAILING_PUNCTUATION, '');
}

function trailingPunctuation(url: string): string {
  return TRAILING_PUNCTUATION.exec(url)?.[0] ?? '';
}

function replaceAllCaseInsensitive(text: string, search: string, replacement: string): string {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), replacement);
}
