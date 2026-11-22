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

export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** http(s) URLs, www. addresses and bare profile links like linkedin.com/in/x or github.com/x. */
export const URL_LIKE =
  /\b(?:https?:\/\/[^\s<>()"']+|www\.[^\s<>()"']+|(?:linkedin\.com|github\.com|gitlab\.com|x\.com|twitter\.com|leetcode\.com)\/[^\s<>()"']+)/gi;

/**
 * Bare domains like "asha.example.org" or "mysite.dev/work" (no https://, no www.). PDFs often
 * show a link's text without the scheme; the first real Gemini call leaked one (ADR-030).
 * Deliberately case-SENSITIVE and limited to common personal-site endings, so tech names like
 * "Node.js", "ASP.NET", "B.Tech" or "Vue.js" are not mistaken for links.
 */
export const BARE_DOMAIN =
  /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|dev|in|co|me|ai|app|xyz|page|site|info|blog|codes)\b(?:\/[^\s<>()"']*)?/g;

/** @handles (emails are already gone by the time this runs, so "a@b.com" can't match). */
export const HANDLE = /(^|[\s(|,])@([A-Za-z0-9_]{2,30})\b/g;

/**
 * Phone-shaped runs: optional +country code, then 2–5 groups of digits separated by space, dot,
 * dash or brackets. Candidates are then filtered by digit count (10–15) and "not a list of years".
 */
export const PHONE_CANDIDATE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){1,4}\d{2,5}/g;

const NON_NAME_FIRST_LINES = new Set(['resume', 'curriculum vitae', 'cv', 'résumé', 'profile']);

/**
 * `hiddenUrls` are link targets found inside the file (a PDF/Word link shows "LinkedIn" but keeps
 * the address in the link). They never appear in the text, so they are not sent to the LLM; they
 * only complete the contact block that the user reviews.
 */
export function redactContact(text: string, hiddenUrls: readonly string[] = []): RedactionResult {
  const emails: string[] = [];
  const links: string[] = [];
  const phones: string[] = [];

  let redacted = text.replace(EMAIL, (match) => {
    emails.push(match);
    return PLACEHOLDERS.email;
  });

  const replaceLink = (match: string): string => {
    links.push(trimTrailingPunctuation(match));
    return PLACEHOLDERS.link + trailingPunctuation(match);
  };
  redacted = redacted.replace(URL_LIKE, replaceLink).replace(BARE_DOMAIN, replaceLink);

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

  const hidden = splitHiddenUrls(hiddenUrls);

  return {
    redactedText: redacted,
    contact: {
      name,
      email: emails[0] ?? hidden.mailAddresses[0] ?? '',
      phone: phones[0] ?? '',
      location: guessLocation(redacted),
      links: toLinks(links, hidden.webUrls),
    },
  };
}

function splitHiddenUrls(urls: readonly string[]): { webUrls: string[]; mailAddresses: string[] } {
  const webUrls: string[] = [];
  const mailAddresses: string[] = [];
  for (const url of urls) {
    if (/^mailto:/i.test(url)) {
      // "mailto:a@b.com?subject=x" → "a@b.com"; anything that is not an address is ignored.
      const address = url.slice('mailto:'.length).split('?')[0] ?? '';
      if (new RegExp(`^${EMAIL.source}$`).test(address)) mailAddresses.push(address);
    } else {
      webUrls.push(url);
    }
  }
  return { webUrls, mailAddresses };
}

const SECTION_HEADING =
  /^(summary|profile|objective|about|experience|work|employment|education|skills|technical|projects|certifications|achievements)\b/i;

/** Words that sit in a contact line but are labels, not places. */
const NOT_A_PLACE = new Set([
  'resume',
  'curriculum vitae',
  'cv',
  'linkedin',
  'github',
  'gitlab',
  'leetcode',
  'portfolio',
  'website',
  'blog',
  'twitter',
  'email',
  'e-mail',
  'phone',
  'mobile',
  'contact',
  'address',
  'location',
]);

/**
 * Comma-separated parts that start with a capital letter and contain only letters, spaces and
 * . ' - , optionally ending in a 5–6 digit postcode. The capital rules out stray words like "asha".
 */
const PLACE_SHAPE = /^\p{Lu}[\p{L}\s.'-]*(?:,\s*\p{Lu}[\p{L}\s.'-]*)*(?:\s+\d{5,6})?$/u;

/** Designed templates put name, title, a CONTACT heading and the details in a sidebar. */
const CONTACT_HEADING =
  /^(contact|contact (information|details|info)|personal (details|information))$/i;
const HEADER_MAX_LINES = 8;

/**
 * The location is almost always in the header, next to the phone and email: "Bangalore, Karnataka
 * | [PHONE] | [EMAIL]". After redaction the placeholders and "|" separators cut that line into
 * pieces, and the piece that looks like a place is the location. Only the first few lines are
 * looked at (until a section heading), so a job's city further down is never mistaken for it.
 * Best-effort, like the rest of the redaction: when unsure we return '' and the user fills it in.
 */
export function guessLocation(redactedText: string): string {
  const headerLines: string[] = [];
  for (const rawLine of redactedText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    // A "CONTACT" heading starts the contact block, which is part of the header, so skip it.
    if (CONTACT_HEADING.test(line)) continue;
    if (SECTION_HEADING.test(line) || headerLines.length >= HEADER_MAX_LINES) break;
    headerLines.push(line);
  }

  for (const line of headerLines) {
    const pieces = line
      .split(/\[(?:NAME|EMAIL|PHONE|LINK)\]|[|•·–—]/)
      .map((piece) => piece.trim())
      .filter((piece) => piece !== '');
    // A line with several pieces is a contact line. A lone piece could be a name we failed to
    // recognise, so there only "City, State" (a comma) counts.
    const isContactLine = pieces.length > 1 || /\[(?:EMAIL|PHONE|LINK)\]/.test(line);
    for (const piece of pieces) {
      if (!looksLikePlace(piece)) continue;
      if (piece.includes(',') || isContactLine) return piece;
    }
  }
  return '';
}

function looksLikePlace(piece: string): boolean {
  if (piece.length > 60 || piece.split(/\s+/).length > 6) return false;
  if (NOT_A_PLACE.has(piece.toLowerCase().replace(/:$/, ''))) return false;
  return PLACE_SHAPE.test(piece);
}

export function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return false;
  // "2019 2020 2021" or "2019-2023" are years, not phone numbers.
  const groups = candidate
    .trim()
    .split(/[\s.\-()]+/)
    .filter((group) => group !== '');
  return !groups.every((group) => /^(19|20)\d{2}$/.test(group));
}

const isNameWord = (word: string): boolean => /^\p{Lu}[\p{L}'.-]*$/u.test(word);

/** "EDUCATION", "Contact", "Resume": a heading is never half of a name. */
function isHeadingWord(word: string): boolean {
  return (
    NON_NAME_FIRST_LINES.has(word.toLowerCase()) ||
    SECTION_HEADING.test(word) ||
    CONTACT_HEADING.test(word) ||
    /^contact/i.test(word)
  );
}

/**
 * A resume usually starts with the person's name: 2–4 capitalised words, letters only.
 * Designed templates often print a big name over two lines ("Leonard" / "Hamilton"), so two
 * lines of one capitalised word each also count. If the start doesn't look like a name we don't
 * guess (the user fills it in on review).
 */
export function guessName(text: string): string {
  const [first, second] = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (first === undefined) return '';
  if (NON_NAME_FIRST_LINES.has(first.toLowerCase())) return '';

  const words = first.split(/\s+/);
  if (words.length >= 2 && words.length <= 4 && words.every(isNameWord)) return first;

  const isSingleNameWord = (line: string | undefined): line is string =>
    line !== undefined && !/\s/.test(line) && isNameWord(line) && !isHeadingWord(line);
  if (isSingleNameWord(first) && isSingleNameWord(second)) return `${first} ${second}`;
  return '';
}

const SITE_NAMES: Record<string, string> = {
  'linkedin.com': 'LinkedIn',
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'leetcode.com': 'LeetCode',
  'x.com': 'X',
  'twitter.com': 'Twitter',
};

/** "https://www.linkedin.com/in/x" → "LinkedIn" for well-known sites; otherwise the address. */
function labelFor(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//i, '');
  const host = (withoutScheme.split(/[/?#]/)[0] ?? '').toLowerCase().replace(/^www\./, '');
  return SITE_NAMES[host] ?? withoutScheme.replace(/\/$/, '');
}

/** The same page written two ways ("https://www.x.com/a/" and "x.com/a") counts once. */
function linkKey(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Links found in the text keep their visible address as the label (it is what the resume shows).
 * Links found only inside the file get a friendly label, which reproduces "LinkedIn | GitHub".
 */
function toLinks(visibleUrls: readonly string[], hiddenUrls: readonly string[]): Link[] {
  const withScheme = (url: string): string => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
  const candidates = [
    ...visibleUrls.map((url) => ({ url: withScheme(url), label: undefined })),
    ...hiddenUrls.map((url) => ({ url, label: labelFor(url) })),
  ];

  const safe = candidates.filter(({ url }) => SAFE_URL_PATTERN.test(url));
  // A visible address cut by a line wrap ("…/hardik-mamgain" + "-ba5a27223" on the next line) is a
  // prefix of the full link kept inside the file. Keep only the complete one.
  const hiddenKeys = hiddenUrls.map(linkKey);
  const seen = new Set<string>();
  return safe
    .filter(({ url, label }) => {
      const key = linkKey(url);
      const isCutOff =
        label === undefined && hiddenKeys.some((full) => full.startsWith(key) && full !== key);
      return !isCutOff;
    })
    .filter(({ url }) => {
      const key = linkKey(url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map(({ url, label }, index) => ({
      id: `link${String(index)}`,
      label: label ?? url.replace(/^https?:\/\//i, ''),
      url,
    }));
}

export const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function trimTrailingPunctuation(url: string): string {
  return url.replace(TRAILING_PUNCTUATION, '');
}

function trailingPunctuation(url: string): string {
  return TRAILING_PUNCTUATION.exec(url)?.[0] ?? '';
}

/** Matches a name in any case; any run of whitespace in it matches any whitespace, so a name split over two lines is found. */
export function nameRegex(name: string): RegExp {
  const escaped = name
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(escaped, 'gi');
}

function replaceAllCaseInsensitive(text: string, search: string, replacement: string): string {
  return text.replace(nameRegex(search), replacement);
}
