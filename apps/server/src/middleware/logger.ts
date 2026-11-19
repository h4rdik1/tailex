import type { RequestHandler } from 'express';

/**
 * A tiny structured logger (JSON lines on stdout, which Cloud Run collects). No dependency.
 *
 * Privacy by construction (docs/SECURITY.md, Logging): a log entry can only hold short scalar
 * fields that WE choose. There is no way to pass a request, its headers or its body to it, so
 * the key, resume text and JD can't end up in the logs by accident.
 */
export type LogFields = Record<string, string | number | boolean>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export type LogWriter = (line: string) => void;

export function createLogger(
  write: LogWriter = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const log = (level: 'info' | 'error', event: string, fields: LogFields = {}): void => {
    write(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
  };
  return {
    info: (event, fields) => {
      log('info', event, fields);
    },
    error: (event, fields) => {
      log('error', event, fields);
    },
  };
}

/** Logs method, path (no query string), status and duration. Never headers or bodies. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(performance.now() - started),
      });
    });
    next();
  };
}
