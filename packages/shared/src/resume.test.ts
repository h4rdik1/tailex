import { describe, expect, it } from 'vitest';
import { RESUME_LIMITS, ResumeDataSchema, SAFE_URL_PATTERN } from './resume.ts';
import { RenderRequestSchema } from './render.ts';
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

describe('RenderRequestSchema', () => {
  it('defaults spacing to normal', () => {
    const parsed = RenderRequestSchema.parse({ resume: FICTIONAL_RESUME });

    expect(parsed.spacing).toBe('normal');
  });

  it('rejects unknown spacing values', () => {
    const result = RenderRequestSchema.safeParse({ resume: FICTIONAL_RESUME, spacing: 'huge' });

    expect(result.success).toBe(false);
  });
});
