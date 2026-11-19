import path from 'node:path';
import express, { type Express } from 'express';
import { healthRouter } from './routes/health.ts';
import { createRenderRouter } from './routes/render.ts';
import { apiNotFound, errorHandler } from './middleware/error-handler.ts';
import { compileTex as realCompileTex, type CompileTex } from './services/latex/compile.ts';
import { createSlotLimiter } from './services/latex/slot-limiter.ts';

/** How many pdflatex processes may run at once (docs/SECURITY.md T9). */
const DEFAULT_MAX_CONCURRENT_COMPILES = 2;

/** Big enough for a resume at the RESUME_LIMITS maximum, small enough to block abuse. */
const JSON_BODY_LIMIT = '256kb';

export interface AppOptions {
  /** Folder with the built web app. When set, the server also hosts the SPA (same origin). */
  staticDir?: string;
  /** Replaced by a fake in tests that run without pdflatex. */
  compileTex?: CompileTex;
  maxConcurrentCompiles?: number;
}

/**
 * Builds the Express app without starting it, so tests can call it with supertest
 * and no real port is opened.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', healthRouter);
  app.use(
    '/api',
    createRenderRouter({
      compileTex: options.compileTex ?? realCompileTex,
      limiter: createSlotLimiter(options.maxConcurrentCompiles ?? DEFAULT_MAX_CONCURRENT_COMPILES),
    }),
  );
  app.use('/api', apiNotFound);

  if (options.staticDir !== undefined) {
    serveSpa(app, options.staticDir);
  }

  app.use(errorHandler);
  return app;
}

/** Serves static files, and falls back to index.html for any other path (client-side app). */
function serveSpa(app: Express, staticDir: string): void {
  app.use(express.static(staticDir));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}
