import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/real-api',
  globalSetup: './tests/real-api/setup.ts',
  globalTeardown: './tests/real-api/teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
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
    {
      name: 'tablet',
      testMatch: '**/booking.spec.ts',
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      testMatch: '**/booking.spec.ts',
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
});
