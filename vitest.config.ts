import { defineConfig } from 'vitest/config';

// Each workspace is a Vitest "project". The web app joins in Phase 4.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/server/src/**'],
    },
  },
});
