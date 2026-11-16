import { defineConfig } from '@playwright/test';

// Smoke tests against the production build. Uses the installed Chrome (channel 'chrome'), so no
// browser download outside this folder. E2E_HEADED=1 opens a window.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 12_000 }, // a cold start loads and pre-renders three 3D worlds: about 8 s on the RTX 3050
  workers: 1,
  use: {
    baseURL: 'http://localhost:4174',
    channel: 'chrome',
    headless: !process.env.E2E_HEADED,
    viewport: { width: 1920, height: 1080 },
    launchOptions: { args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] },
  },
  webServer: { command: 'npx vite build && npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174', reuseExistingServer: false, timeout: 120_000 },
});
