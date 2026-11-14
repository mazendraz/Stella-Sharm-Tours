import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: [
    '**/languages.spec.ts',
    '**/runtime.spec.ts',
    '**/handoff.spec.ts',
    '**/private-booking.spec.ts',
    '**/real-api/admin.spec.ts',
  ],
  globalSetup: './tests/integration/setup.ts',
  globalTeardown: './tests/integration/teardown.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4983',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 390, height: 844 },
        browserName: 'chromium',
      },
    },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
