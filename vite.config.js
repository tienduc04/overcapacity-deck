import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 }, // three is ~600 kB minified; es2022 for top-level await
  test: { include: ['tests/**/*.test.js'] },
});
