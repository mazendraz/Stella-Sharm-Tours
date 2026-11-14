import { expect, it } from 'vitest';
import { requestRetentionCutoff } from './retention';
it('keeps the time and clamps leap/non-leap month ends for the 18-month retention period', () => {
  expect(
    requestRetentionCutoff(new Date('2026-08-31T10:11:12Z')).toISOString(),
  ).toBe('2025-02-28T10:11:12.000Z');
  expect(
    requestRetentionCutoff(new Date('2025-08-31T10:11:12Z')).toISOString(),
  ).toBe('2024-02-29T10:11:12.000Z');
  expect(
    requestRetentionCutoff(new Date('2026-11-12T10:11:12Z')).toISOString(),
  ).toBe('2025-05-12T10:11:12.000Z');
});
