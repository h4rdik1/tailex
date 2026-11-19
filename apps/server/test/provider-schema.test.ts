import { describe, expect, it } from 'vitest';
import { LlmParsedResumeSchema } from '@tailex/shared';
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
      required: ['skills', 'experience', 'projects', 'education'],
      additionalProperties: false,
    });
    expect(text).toContain('"startDate":{"type":"string"}');
  });

  it('still lets Zod enforce the limits the provider no longer sees', () => {
    const tooManyGroups = {
      skills: Array.from({ length: 11 }, () => ({ category: 'x', items: [] })),
      experience: [],
      projects: [],
      education: [],
    };

    expect(LlmParsedResumeSchema.safeParse(tooManyGroups).success).toBe(false);
  });
});
