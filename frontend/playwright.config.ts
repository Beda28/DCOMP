import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  workers: 1,
  timeout: 120000,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'off',
  },
});
