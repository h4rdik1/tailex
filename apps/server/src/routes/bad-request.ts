import type { ZodError } from 'zod';

/** Field problems for a 400 response: where it went wrong and a readable message (no values). */
export function badRequestDetails(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
