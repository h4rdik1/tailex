import path from 'node:path';
import express, { type Express } from 'express';
import { healthRouter } from './routes/health.ts';
import { apiNotFound, errorHandler } from './middleware/error-handler.ts';

export interface AppOptions {
  /** Folder with the built web app. When set, the server also hosts the SPA (same origin). */
  staticDir?: string;
}

/**
 * Builds the Express app without starting it, so tests can call it with supertest
 * and no real port is opened.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', healthRouter);
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
