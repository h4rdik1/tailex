import type { ErrorRequestHandler, RequestHandler } from 'express';
import { makeErrorResponse } from '@tailex/shared';

/** Any `/api/*` path that no router handled. Keeps API 404s as JSON, never the SPA's HTML. */
export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json(makeErrorResponse('NOT_FOUND', 'No such API route.'));
};

/**
 * Last-resort error handler. It sends only a code and a fixed, generic message.
 * It never sends err.message or the stack, because those can contain user data or secrets.
 * Express recognises error handlers by their 4 parameters, so `_next` must stay.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = readStatus(err);
  if (status >= 400 && status < 500) {
    res.status(400).json(makeErrorResponse('BAD_REQUEST', 'The request could not be processed.'));
    return;
  }
  res.status(500).json(makeErrorResponse('INTERNAL', 'Something went wrong on our side.'));
};

/** Express and body-parser attach an HTTP `status` to the errors they throw. */
function readStatus(err: unknown): number {
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number'
  ) {
    return err.status;
  }
  return 500;
}
