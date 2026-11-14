import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/**/*.integration.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 600000,
    testTimeout: 120000,
  },
});
