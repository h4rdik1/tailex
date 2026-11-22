import { describe, expect, it } from 'vitest';
import { LlmParsedResumeSchema, RESUME_LIMITS } from '@tailex/shared';
import { toProviderJsonSchema } from '../src/services/llm/provider-schema.ts';

describe('toProviderJsonSchema', () => {
  const schema = toProviderJsonSchema(LlmParsedResumeSchema);
  const text = JSON.stringify(schema);

  it('sends no size limits (Gemini rejected them as "too many states")', () => {
    for (const keyword of [
      'maxLength',
      'minLength',
      'maxItems',
      'minItems',
      'pattern',
      '$schema',
    ]) {
      expect(text).not.toContain(`"${keyword}"`);
    }
  });

  it('keeps the shape: fields, types, required, no extra properties', () => {
    expect(schema).toMatchObject({
      type: 'object',
      required: ['headline', 'summary', 'skills', 'experience', 'projects', 'education'],
      additionalProperties: false,
    });
    expect(text).toContain('"startDate":{"type":"string"}');
    expect(text).toContain('"summary":{"type":"string"}'); // no maxLength: Zod enforces it
  });

  it('still lets Zod enforce the limits the provider no longer sees', () => {
    const tooManyGroups = {
      headline: '',
      summary: '',
      skills: Array.from({ length: 11 }, () => ({ category: 'x', items: [] })),
      experience: [],
      projects: [],
      education: [],
    };

    expect(LlmParsedResumeSchema.safeParse(tooManyGroups).success).toBe(false);
    // The same answer with 10 groups is fine, so the failure above really was the group limit.
    expect(
      LlmParsedResumeSchema.safeParse({ ...tooManyGroups, skills: tooManyGroups.skills.slice(1) })
        .success,
    ).toBe(true);
  });

  it('enforces the summary length limit itself', () => {
    const answer = {
      headline: '',
      summary: 'x'.repeat(RESUME_LIMITS.summary + 1),
      skills: [],
      experience: [],
      projects: [],
      education: [],
    };

    expect(LlmParsedResumeSchema.safeParse(answer).success).toBe(false);
  });
});
