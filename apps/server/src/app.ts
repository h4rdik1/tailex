import path from 'node:path';
import express, { type Express } from 'express';
import { healthRouter } from './routes/health.ts';
import { createKeyTestRouter } from './routes/key-test.ts';
import { createParseRouter } from './routes/parse.ts';
import { createRenderRouter } from './routes/render.ts';
import { apiNotFound, createErrorHandler } from './middleware/error-handler.ts';
import { createLogger, requestLogger, type Logger } from './middleware/logger.ts';
import { compileTex as realCompileTex, type CompileTex } from './services/latex/compile.ts';
import { createSlotLimiter } from './services/latex/slot-limiter.ts';
import { unavailableExtractor, type TextExtractor } from './services/extract/extractor.ts';
import { createGeminiProvider } from './services/llm/gemini.ts';
import { createMockProvider } from './services/llm/mock.ts';
import { createProviderRegistry, type ProviderRegistry } from './services/llm/registry.ts';

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
  /** LLM providers by name. Default: real Gemini, plus the mock outside production. */
  registry?: ProviderRegistry;
  /** PDF/DOCX → text. Default: not configured yet (answers 501). */
  extractText?: TextExtractor;
  logger?: Logger;
}

/**
 * Builds the Express app without starting it, so tests can call it with supertest
 * and no real port is opened.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  // Vitest sets NODE_ENV=test: keep test output readable unless a test passes its own logger.
  const logger =
    options.logger ??
    (process.env.NODE_ENV === 'test' ? createLogger(() => undefined) : createLogger());
  const registry = options.registry ?? defaultRegistry();

  app.disable('x-powered-by');
  app.use(requestLogger(logger));

  // Upload route first: it reads the raw file body itself (not JSON).
  app.use(
    '/api',
    createParseRouter({ registry, extractText: options.extractText ?? unavailableExtractor }),
  );

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', healthRouter);
  app.use('/api', createKeyTestRouter(registry));
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

  app.use(createErrorHandler(logger));
  return app;
}

function defaultRegistry(): ProviderRegistry {
  return createProviderRegistry(
    { gemini: createGeminiProvider(), mock: createMockProvider() },
    { allowMock: process.env.NODE_ENV !== 'production' },
  );
}

/** Serves static files, and falls back to index.html for any other path (client-side app). */
function serveSpa(app: Express, staticDir: string): void {
  app.use(express.static(staticDir));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}
