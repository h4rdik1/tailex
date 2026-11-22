/**
 * The truth guard (CLAUDE.md rule 6, docs/DECISIONS.md ADR-040, rules in truth-guard.spec.md).
 *
 * The AI may REPHRASE a bullet. It may not add a skill, a number, a name or a contact detail that the
 * bullet does not already have. Pure function: no I/O, no randomness, and it never throws. If anything
 * unexpected happens it answers "blocked" (fail closed): a false block costs the user one click, a
 * false pass puts a lie on their resume.
 *
 * Decisions taken (spec D1-D5): facts must come from THIS bullet (not the rest of the resume), a
 * confirmed skill is allowed, spelled-out numbers count, new capitalised words and acronyms are
 * blocked, and the length cap is 1.5x plus 20 characters.
 */
import { scanSkills, type ScanResult } from '../keywords/match.ts';
import {
  BARE_DOMAIN,
  EMAIL,
  PHONE_CANDIDATE,
  TRAILING_PUNCTUATION,
  URL_LIKE,
  looksLikePhone,
} from '../redact/redact-contact.ts';

export interface TruthGuardInput {
  /** The bullet as the user has it now. */
  original: string;
  /** The AI's rewrite, with the user's own emails/links/phones already put back. */
  suggested: string;
  /** All the resume's text. Not used: facts must come from the bullet itself (decision D1). */
  resumeText: string;
  /** Skills the user confirmed they really have (canonical names). */
  confirmedSkills: readonly string[];
}

export type TruthGuardResult = { ok: true } | { ok: false; reason: string };

export type TruthGuard = (input: TruthGuardInput) => TruthGuardResult;

const MAX_LENGTH_FACTOR = 1.5;
const LENGTH_SLACK = 20;

const blocked = (reason: string): TruthGuardResult => ({ ok: false, reason });

/** Everything we know about one text: its contact details, its skills, its numbers, its words. */
interface Facts {
  skills: Map<string, string>; // lowercase canonical name -> display name
  numbers: Map<string, string>; // comparable key -> the number as written
  names: string[]; // capitalised words and acronyms that are not skills
  words: Set<string>; // every word, lowercase
  contacts: Set<string>;
}

// ---------- contact details (R4) ----------

/**
 * Cuts links, emails and phone numbers out of the text (so their digits and words are not later
 * mistaken for numbers or names) and remembers a comparable key for each one.
 */
function stripContacts(text: string): { clean: string; contacts: Set<string> } {
  const contacts = new Set<string>();
  let clean = text;
  // Emails first: otherwise "docs@example.com" would leave "example.com" to the link patterns.
  for (const pattern of [EMAIL, URL_LIKE, BARE_DOMAIN]) {
    clean = clean.replace(pattern, (found) => {
      contacts.add(found.toLowerCase().replace(TRAILING_PUNCTUATION, ''));
      return ` ${TRAILING_PUNCTUATION.exec(found)?.[0] ?? ''}`; // keep the sentence's final dot
    });
  }
  clean = clean.replace(PHONE_CANDIDATE, (found) => {
    if (!looksLikePhone(found)) return found;
    contacts.add(found.replace(/\D/g, ''));
    return ' ';
  });
  return { clean, contacts };
}

// ---------- numbers (R2) ----------

/**
 * Digits not glued to letters ("S3", "p95", "HTML5" are names, so a letter before the digit rules
 * them out), an optional currency sign, and an optional unit: %, percent, k, m, b, thousand, million,
 * billion. Linear scan: no nested quantifiers, so no catastrophic backtracking.
 */
const NUMBER =
  /(?<![\p{L}\p{N}])[$€£₹]?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?(%|(?:percent|million|billion|thousand|k|m|b)(?![\p{L}\p{N}])))?/gu;

const MULTIPLIERS = new Map([
  ['k', 1e3],
  ['thousand', 1e3],
  ['m', 1e6],
  ['million', 1e6],
  ['b', 1e9],
  ['billion', 1e9],
]);

/** "one" is left out on purpose: "one of the", "one-off" and "no one" are ordinary English. */
const SPELLED_NUMBERS = new Map([
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
  ['hundred', 100],
  ['dozen', 12],
  ['thousand', 1e3],
  ['million', 1e6],
  ['billion', 1e9],
]);
/** Built from the fixed list above, never from user text. */
const SPELLED_NUMBER = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...SPELLED_NUMBERS.keys()].join('|')})(?![\\p{L}\\p{N}])`,
  'gu',
);

/** A comparable key: the value (1,000 = 1000, 1.5k = 1500, $5M = 5 million) plus "%" for percentages. */
const numberKey = (value: number, percent: boolean): string =>
  `${String(Number(value.toFixed(4)))}${percent ? '%' : ''}`;

function numbersIn(lower: string): Map<string, string> {
  const numbers = new Map<string, string>();
  for (const match of lower.matchAll(NUMBER)) {
    const [shown, whole = '', fraction = '', unit = ''] = match;
    const value = Number(whole.replaceAll(',', '') + fraction) * (MULTIPLIERS.get(unit) ?? 1);
    const percent = unit === '%' || unit === 'percent';
    numbers.set(numberKey(value, percent), shown.trim());
  }
  // Digits are blanked first, so "5 million" is not counted again as the word "million".
  for (const word of lower.replace(NUMBER, ' ').match(SPELLED_NUMBER) ?? []) {
    numbers.set(numberKey(SPELLED_NUMBERS.get(word) ?? 0, false), word);
  }
  return numbers;
}

// ---------- names (R3) ----------

const WORD = /\p{L}[\p{L}\p{N}']*/gu;
const uppercaseLetters = (word: string): number => (word.match(/\p{Lu}/gu) ?? []).length;

/**
 * A name is an acronym or mixed-case term (two or more capitals: KPI, SaaS) or a capitalised word
 * that does not start a sentence ("Stripe" in "built it at Stripe"). Words inside a recognised skill
 * are skipped: skills are rule R1's job.
 */
function namesIn(scan: ScanResult): string[] {
  const { cased } = scan.text;
  const names: string[] = [];
  let previousEnd = 0;
  for (const match of cased.matchAll(WORD)) {
    const word = match[0];
    const start = match.index;
    const startsSentence = previousEnd === 0 || /[.!?\n]/.test(cased.slice(previousEnd, start));
    previousEnd = start + word.length;

    const insideSkill = scan.hits.some((hit) => start >= hit.start && start < hit.end);
    if (insideSkill || word.length < 2) continue;
    const capitals = uppercaseLetters(word);
    const isName = capitals >= 2 || (capitals === 1 && /^\p{Lu}/u.test(word) && !startsSentence);
    if (isName) names.push(word);
  }
  return names;
}

// ---------- putting the facts together ----------

function factsOf(text: string): Facts {
  const { clean, contacts } = stripContacts(text);
  const scan = scanSkills(clean);

  const skills = new Map<string, string>();
  for (const hit of scan.hits) skills.set(hit.canonical.toLowerCase(), hit.canonical);

  const words = new Set((scan.text.cased.match(WORD) ?? []).map((word) => word.toLowerCase()));
  return { skills, numbers: numbersIn(scan.text.lower), names: namesIn(scan), words, contacts };
}

function firstNewSkill(before: Facts, after: Facts, confirmed: ReadonlySet<string>): string | null {
  for (const [key, display] of after.skills) {
    if (!before.skills.has(key) && !confirmed.has(key)) return display;
  }
  return null;
}

function firstNewNumber(before: Facts, after: Facts): string | null {
  for (const [key, shown] of after.numbers) if (!before.numbers.has(key)) return shown;
  return null;
}

function firstNewName(before: Facts, after: Facts): string | null {
  return after.names.find((name) => !before.words.has(name.toLowerCase())) ?? null;
}

const hasNewContact = (before: Facts, after: Facts): boolean =>
  [...after.contacts].some((contact) => !before.contacts.has(contact));

function check({ original, suggested, confirmedSkills }: TruthGuardInput): TruthGuardResult {
  if (suggested.trim() === '') return blocked('The rewrite is empty.');

  const before = factsOf(original);
  const after = factsOf(suggested);
  const confirmed = new Set(confirmedSkills.map((skill) => skill.toLowerCase()));

  const skill = firstNewSkill(before, after, confirmed);
  if (skill) return blocked(`Adds a skill that is not in this bullet: ${skill}.`);

  const number = firstNewNumber(before, after);
  if (number) return blocked(`Adds a number that is not in this bullet: ${number}.`);

  const name = firstNewName(before, after);
  if (name) return blocked(`Adds a name that is not in this bullet: ${name}.`);

  if (hasNewContact(before, after))
    return blocked('Adds a link, email or phone that is not in this bullet.');

  if (suggested.length > original.length * MAX_LENGTH_FACTOR + LENGTH_SLACK) {
    return blocked('Much longer than the original bullet.');
  }
  return { ok: true };
}

export const truthGuard: TruthGuard = (input) => {
  try {
    return check(input);
  } catch {
    return blocked('The truth check could not run on this text, so it was blocked to be safe.');
  }
};
