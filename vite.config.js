import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative URLs so the build also works under a GitHub Pages subpath
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 }, // three is ~600 kB minified; es2022 for top-level await
  test: { include: ['tests/**/*.test.js'] },
});
