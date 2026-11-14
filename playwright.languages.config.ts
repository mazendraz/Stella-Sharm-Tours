import { defineConfig } from '@playwright/test';
import base from './playwright.api.config';
export default defineConfig({
  ...base,
  testMatch: '**/languages.spec.ts',
  projects: base.projects!.map((project) => ({
    ...project,
    testMatch: '**/languages.spec.ts',
  })),
});
