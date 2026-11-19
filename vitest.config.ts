import { defineConfig } from 'vitest/config';

/**
 * Coverage gates (docs/TESTING.md) are enforced only where pdflatex exists (Docker and CI).
 * On Windows the compile tests are skipped, so compile.ts would look "uncovered" there.
 */
const enforceGates = process.env.REQUIRE_PDFLATEX === '1';

// Each workspace is a Vitest "project". The web app joins in Phase 4.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/server/src/**/*.ts'],
      thresholds: enforceGates
        ? {
            'apps/server/src/services/latex/**': { lines: 80, branches: 80, functions: 80 },
          }
        : {},
    },
  },
});
