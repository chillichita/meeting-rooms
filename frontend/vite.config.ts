import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // esbuild's minifier collapses `backdrop-filter` + `-webkit-backdrop-filter`
    // into one declaration (keeping only the last, -webkit-) — Chromium ignores
    // the -webkit- prefix, so every glass element loses its blur in the built
    // app. Keep the CSS as-authored; both prefixes survive for every browser.
    // No css minification; switch to lightningcss (cssMinify) when
    // the ~30KB raw CSS ever matters.
    cssMinify: false,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
