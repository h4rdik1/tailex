import { defineConfig, devices } from '@playwright/test';

/**
 * One end-to-end test of the whole app in sample mode: no key, no AI, no network.
 * It runs against an already-running server (CI starts the production image; locally use
 * `npm run image:run`). Set E2E_BASE_URL to point somewhere else.
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8081',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
