import { describe, expect, it } from 'vitest';
import { RESUME_LIMITS, ResumeDataSchema, SAFE_URL_PATTERN } from './resume.ts';
import { LAYOUT_LEVELS, LayoutSchema, RenderRequestSchema } from './render.ts';
import { FICTIONAL_RESUME } from './samples/fictional-resume.ts';

describe('ResumeDataSchema', () => {
  it('accepts the fictional sample resume', () => {
    expect(ResumeDataSchema.safeParse(FICTIONAL_RESUME).success).toBe(true);
  });

  it('rejects a bullet over the length limit', () => {
    const tooLong = 'x'.repeat(RESUME_LIMITS.bullet + 1);
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.experience[0]?.bullets.push({ id: 'exp0-b9', text: tooLong });

    expect(ResumeDataSchema.safeParse(resume).success).toBe(false);
  });

  it('rejects ids that were not made by our code', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.experience[0]?.bullets.push({ id: 'Bad Id!', text: 'ok' });

    expect(ResumeDataSchema.safeParse(resume).success).toBe(false);
  });
});

describe('SAFE_URL_PATTERN', () => {
  it.each([
    'https://github.com/asha-example',
    'http://example.com/path?a=1&b=2#top',
    'https://example.com/~user/a_b/%20x',
  ])('allows %s', (url) => {
    expect(SAFE_URL_PATTERN.test(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'ftp://example.com',
    'https://example.com/a b',
    'https://example.com/\\input{x}',
    'https://example.com/{x}',
    'https://example.com/$x$',
    'https://example.com/^^5c',
    'https://example.com/"x"',
    '',
  ])('blocks %s', (url) => {
    expect(SAFE_URL_PATTERN.test(url)).toBe(false);
  });
});

// The client no longer chooses spacing: the server picks a layout (ADR-036).
describe('RenderRequestSchema', () => {
  it('accepts just the resume and drops an old "spacing" field', () => {
    const parsed = RenderRequestSchema.parse({ resume: FICTIONAL_RESUME, spacing: 'tight' });

    expect(parsed).toEqual({ resume: FICTIONAL_RESUME });
  });
});

describe('LayoutSchema', () => {
  it('accepts size levels 1 to LAYOUT_LEVELS and nothing else', () => {
    expect(LayoutSchema.safeParse(1).success).toBe(true);
    expect(LayoutSchema.safeParse(LAYOUT_LEVELS).success).toBe(true);
    expect(LayoutSchema.safeParse(0).success).toBe(false);
    expect(LayoutSchema.safeParse(LAYOUT_LEVELS + 1).success).toBe(false);
    expect(LayoutSchema.safeParse(2.5).success).toBe(false);
  });
});
