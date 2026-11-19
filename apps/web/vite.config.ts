import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev, Vite serves the UI and forwards API calls to Express, so the app sees one origin.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
