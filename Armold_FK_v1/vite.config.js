import { defineConfig } from 'vite';

// Relative base so the built site works from any subdirectory on the host,
// e.g. https://example.org/sims/armold/ — no absolute paths baked in.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
