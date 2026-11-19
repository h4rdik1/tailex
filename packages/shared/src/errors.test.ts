import { describe, expect, it } from 'vitest';
import { ErrorResponseSchema, makeErrorResponse } from './errors.ts';

describe('makeErrorResponse', () => {
  it('builds a body that matches the shared error schema', () => {
    const body = makeErrorResponse('NOT_FOUND', 'No such API route.');

    expect(ErrorResponseSchema.parse(body)).toEqual({
      error: { code: 'NOT_FOUND', message: 'No such API route.' },
    });
  });
});

describe('ErrorResponseSchema', () => {
  it('rejects unknown error codes', () => {
    const result = ErrorResponseSchema.safeParse({ error: { code: 'TEAPOT', message: 'x' } });

    expect(result.success).toBe(false);
  });
});
