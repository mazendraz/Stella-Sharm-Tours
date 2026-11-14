import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/admin',
  globalSetup: './tests/admin/setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90000,
  reporter: 'list',
  use: {
    baseURL:
      process.env.STELLA_INTEGRATION_VERIFY === '1'
        ? 'http://localhost:4986'
        : 'http://localhost:3001',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
