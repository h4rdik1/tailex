import type { ZodType } from 'zod';
import { z } from 'zod';

/**
 * Size limits that we enforce ourselves with Zod, but must NOT send to the provider.
 * Found in the first real Gemini call (docs/DECISIONS.md ADR-031): Gemini turns every
 * maxLength/maxItems into states of an output-constraint machine, and our nested limits
 * produced "a constraint that has too many states for serving" (HTTP 400).
 */
const LIMIT_KEYWORDS = new Set(['maxLength', 'minLength', 'maxItems', 'minItems', 'pattern']);

/**
 * JSON Schema for a provider's structured-output mode: the SHAPE only (fields, types, required,
 * no extra properties). The limits stay in the Zod schema, which validates every answer anyway.
 */
export function toProviderJsonSchema(schema: ZodType): Record<string, unknown> {
  const generated = stripKeys(z.toJSONSchema(schema));
  if (!isPlainObject(generated)) throw new Error('Expected an object schema');
  return generated;
}

function stripKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripKeys);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema' && !LIMIT_KEYWORDS.has(key))
      .map(([key, child]) => [key, stripKeys(child)]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
