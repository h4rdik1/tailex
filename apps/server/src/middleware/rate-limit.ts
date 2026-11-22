import type { Express, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { makeErrorResponse } from '@tailex/shared';

/**
 * Per-visitor limits (docs/SECURITY.md T10). A visitor is the client address the platform reports
 * (`trust proxy`); nothing else is stored, and counts live in memory and are forgotten on restart.
 * With 1-2 instances each instance counts on its own, which is fine for abuse protection.
 *
 * The expensive routes are stricter: a render may run pdflatex up to four times, a parse reads
 * a file, and tailoring calls the user's AI provider.
 */
export interface RateLimitSettings {
  windowMs: number;
  /** Requests per window for every /api route together. */
  general: number;
  parse: number;
  tailor: number;
  render: number;
  keyTest: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  windowMs: 60_000,
  general: 120,
  parse: 10,
  tailor: 10,
  render: 20,
  keyTest: 10,
};

const TOO_MANY = 'Too many requests. Please wait a minute and try again.';

function limiter(limit: number, windowMs: number, skipHealth = false) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7', // RateLimit-* headers and Retry-After
    legacyHeaders: false,
    skip: (req: Request) => skipHealth && req.path === '/health',
    handler: (_req: Request, res: Response) => {
      res.status(429).json(makeErrorResponse('RATE_LIMITED', TOO_MANY));
    },
  });
}

/** Mounts the limits. Call it before the API routers so a rejected request does no work. */
export function mountRateLimits(app: Express, overrides: Partial<RateLimitSettings> = {}): void {
  const settings = { ...DEFAULT_RATE_LIMITS, ...overrides };
  const { windowMs } = settings;

  app.use('/api', limiter(settings.general, windowMs, true));
  app.use('/api/parse', limiter(settings.parse, windowMs));
  app.use('/api/tailor', limiter(settings.tailor, windowMs));
  app.use('/api/render', limiter(settings.render, windowMs));
  app.use('/api/key/test', limiter(settings.keyTest, windowMs));
}
