import type { ScanResult } from './match.ts';

/**
 * Required or nice-to-have? Read from the words around each skill (docs/SPEC.md §8):
 * 1. the sentence it is in ("must have", "required" vs "nice to have", "a plus", "bonus");
 * 2. otherwise the nearest heading above it ("Requirements" vs "Nice to have").
 * Nothing marked either way counts as normal weight but not "required". A skill that is required
 * anywhere in the text is required. Known limit: negations ("no Java experience needed") are
 * not understood and are treated like any other mention.
 */

const NICE_PHRASES = [
  'nice to have',
  'a plus',
  'is a plus',
  'would be a plus',
  'bonus',
  'preferred',
  'desirable',
  'ideally',
  'good to have',
  'would be great',
  'an advantage',
  'advantage',
  'optional',
  'not required',
  'not necessary',
];

const REQUIRED_PHRASES = [
  'must',
  'must have',
  'required',
  'requires',
  'requirement',
  'requirements',
  'minimum',
  'essential',
  'mandatory',
  'proficiency',
  'proficient',
  'strong',
  'expert',
  'solid',
];

/** Headings that start a required block, a nice-to-have block, or end either (neutral). */
const REQUIRED_HEADINGS = [
  'requirements',
  'required skills',
  'required qualifications',
  'must have',
  'must haves',
  'qualifications',
  'minimum qualifications',
  'basic qualifications',
  'what you need',
  'what you ll need',
  'what we re looking for',
  'you have',
  'you bring',
  'who you are',
  'skills and experience',
];
const NICE_HEADINGS = [
  'nice to have',
  'nice to haves',
  'preferred',
  'preferred qualifications',
  'bonus',
  'bonus points',
  'good to have',
  'desirable',
  'extra credit',
];
const NEUTRAL_HEADINGS = [
  'responsibilities',
  'what you ll do',
  'what you will do',
  'about us',
  'about the role',
  'about the company',
  'benefits',
  'perks',
  'who we are',
  'what we offer',
];

type Section = 'required' | 'nice' | 'neutral';

/** Words only: punctuation becomes a space, so "required," still matches the word "required". */
function words(text: string): string {
  return ` ${text.replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim()} `;
}

function hasPhrase(padded: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => padded.includes(` ${phrase} `));
}

/** A short line without a full stop, like "Requirements:" or "Nice to have". */
function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 60 &&
    !/[.!?]$/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 8
  );
}

/** The section in force on each line (a heading with no skill in it changes the section). */
function sectionPerLine(scan: ScanResult): Section[] {
  const linesWithSkill = new Set(scan.hits.map((hit) => hit.line));
  const sections: Section[] = [];
  let current: Section = 'neutral';
  scan.lines.forEach((span, index) => {
    const line = scan.text.lower.slice(span.start, span.end);
    if (!linesWithSkill.has(index) && looksLikeHeading(line)) {
      const padded = words(line);
      if (hasPhrase(padded, NICE_HEADINGS)) current = 'nice';
      else if (hasPhrase(padded, REQUIRED_HEADINGS)) current = 'required';
      else if (hasPhrase(padded, NEUTRAL_HEADINGS)) current = 'neutral';
    }
    sections.push(current);
  });
  return sections;
}

/** canonical skill name → true when required anywhere in the text. */
export function requiredSkills(scan: ScanResult): Map<string, boolean> {
  const sections = sectionPerLine(scan);
  const result = new Map<string, boolean>();
  for (const hit of scan.hits) {
    const span = scan.sentences[hit.sentence];
    const sentence = span === undefined ? '' : words(scan.text.lower.slice(span.start, span.end));
    let required: boolean;
    if (hasPhrase(sentence, NICE_PHRASES)) required = false;
    else if (hasPhrase(sentence, REQUIRED_PHRASES)) required = true;
    else required = sections[hit.line] === 'required';
    result.set(hit.canonical, (result.get(hit.canonical) ?? false) || required);
  }
  return result;
}
