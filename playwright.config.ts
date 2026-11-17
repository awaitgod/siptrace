import { defineConfig } from '@playwright/test';

const preview = process.env.SIPTRACE_E2E_PREVIEW === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: `npx vite ${preview ? 'preview ' : ''}--host 127.0.0.1 --port ${preview ? '4174' : '4173'} --strictPort`,
    url: preview ? 'http://127.0.0.1:4174' : 'http://127.0.0.1:4173',
    reuseExistingServer: true
  },
  use: {
    baseURL: preview ? 'http://127.0.0.1:4174' : 'http://127.0.0.1:4173',
    channel: 'msedge',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure'
  }
});
