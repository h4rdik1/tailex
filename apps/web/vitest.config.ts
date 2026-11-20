import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Web tests run in jsdom (a simulated browser). Tailwind isn't needed to test behaviour. */
export default defineConfig({
  plugins: [react()],
  test: {
    name: '@tailex/web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
