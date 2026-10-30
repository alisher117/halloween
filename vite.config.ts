import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so the build works from any sub-folder / static host
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
