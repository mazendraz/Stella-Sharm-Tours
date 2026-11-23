import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/**/*.integration.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    // The catalog seed imports every media file through the production codec
    // image; on CI runners it takes close to 10 minutes.
    hookTimeout: 1500000,
    testTimeout: 120000,
  },
});
