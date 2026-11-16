import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure'
  }
});
