import { z } from 'zod';

/** Every error the API can return. New codes are added here as features land. */
export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'NOT_FOUND',
  'INTERNAL',
  'BUSY',
  'COMPILE_FAILED',
  'COMPILE_TIMEOUT',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** The one error shape the API uses: `{ error: { code, message, details? } }`. */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function makeErrorResponse(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ErrorResponse {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
