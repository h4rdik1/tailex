import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, ResumeDataSchema } from '@tailex/shared';
import {
  buildParseUserMessage,
  PARSE_PROMPT_VERSION,
  PARSE_SYSTEM_PROMPT,
} from '../src/prompts/parse.ts';
import { TAILOR_PROMPT_VERSION, TAILOR_SYSTEM_PROMPT } from '../src/prompts/tailor.ts';
import { assembleResume } from '../src/services/parse/assemble-resume.ts';
import { SAMPLE_PARSED } from '../src/services/llm/mock.ts';

/** The prompts in code must match docs/SPEC.md §11 character for character (CLAUDE.md). */
function promptFromSpec(heading: string): string {
  const spec = readFileSync(new URL('../../../docs/SPEC.md', import.meta.url), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const start = spec.indexOf(heading);
  const open = spec.indexOf('```\n', start) + 4;
  const close = spec.indexOf('\n```', open);
  return spec.slice(open, close);
}

describe('runtime prompts', () => {
  it('parse-v2 is stored verbatim from the spec', () => {
    expect(PARSE_PROMPT_VERSION).toBe('parse-v2');
    expect(PARSE_SYSTEM_PROMPT).toBe(promptFromSpec('`PARSE_SYSTEM_PROMPT`'));
  });

  it('tailor-v1 is stored verbatim from the spec', () => {
    expect(TAILOR_PROMPT_VERSION).toBe('tailor-v1');
    expect(TAILOR_SYSTEM_PROMPT).toBe(promptFromSpec('`TAILOR_SYSTEM_PROMPT`'));
  });

  it('parse-v2 asks for headline and summary and forbids writing one', () => {
    expect(PARSE_SYSTEM_PROMPT).toContain('"headline": string, "summary": string');
    expect(PARSE_SYSTEM_PROMPT).toContain('Never write one yourself.');
    expect(PARSE_SYSTEM_PROMPT).toContain('Never add, infer, guess or improve anything.');
  });

  it('wraps resume text in data tags', () => {
    expect(buildParseUserMessage('hello')).toBe('<resume_text>\nhello\n</resume_text>');
  });
});

describe('assembleResume', () => {
  it('produces valid ResumeData with stable, unique ids', () => {
    const resume = assembleResume(
      {
        ...SAMPLE_PARSED,
        experience: [
          {
            title: 't',
            company: 'c',
            location: '',
            startDate: '',
            endDate: '',
            bullets: ['a', 'b'],
          },
        ],
      },
      FICTIONAL_RESUME.contact,
    );

    expect(ResumeDataSchema.safeParse(resume).success).toBe(true);
    expect(resume.experience[0]?.bullets.map((b) => b.id)).toEqual(['exp0-b0', 'exp0-b1']);
  });

  it('puts unambiguous contact values back where the LLM kept a placeholder', () => {
    const contact = {
      ...FICTIONAL_RESUME.contact,
      links: FICTIONAL_RESUME.contact.links.slice(0, 1),
    };
    const parsed = {
      ...SAMPLE_PARSED,
      projects: [{ name: 'x', tech: [], bullets: ['Code at [LINK], mail [EMAIL]'] }],
    };

    const resume = assembleResume(parsed, contact);

    expect(resume.projects[0]?.bullets[0]?.text).toBe(
      'Code at github.com/asha-example, mail asha.testwala@example.com',
    );
  });

  it('copies the headline and summary, putting contact values back into the summary', () => {
    const contact = { ...FICTIONAL_RESUME.contact, links: [] };
    const parsed = {
      ...SAMPLE_PARSED,
      headline: 'Master Tailor',
      summary: 'Tailor for 25 years. Write to [EMAIL].',
    };

    const resume = assembleResume(parsed, contact);

    expect(resume.headline).toBe('Master Tailor');
    expect(resume.summary).toBe('Tailor for 25 years. Write to asha.testwala@example.com.');
    expect(ResumeDataSchema.safeParse(resume).success).toBe(true);
  });

  it('keeps both empty when the resume has neither', () => {
    const resume = assembleResume(SAMPLE_PARSED, FICTIONAL_RESUME.contact);

    expect(resume).toMatchObject({ headline: '', summary: '' });
  });

  it('leaves [LINK] visible when several links make it ambiguous', () => {
    const parsed = {
      ...SAMPLE_PARSED,
      projects: [{ name: 'x', tech: [], bullets: ['See [LINK]'] }],
    };

    const resume = assembleResume(parsed, FICTIONAL_RESUME.contact); // has 2 links

    expect(resume.projects[0]?.bullets[0]?.text).toBe('See [LINK]');
  });
});
