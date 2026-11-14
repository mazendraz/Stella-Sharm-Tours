import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { analyticsConfig } from './analytics';
it('only enables a configured self-hosted stats script and actual website ID', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  expect(analyticsConfig('https://example.test')).toBeNull();
  expect(
    analyticsConfig(
      'https://example.test',
      'https://untrusted.test/script.js',
      id,
    ),
  ).toBeNull();
  expect(
    analyticsConfig(
      'https://example.test',
      'https://stats.example.test/script.js?secret=no',
      id,
    ),
  ).toBeNull();
  expect(
    analyticsConfig(
      'https://staging.example.test',
      'https://stats.example.test/script.js',
      id,
    )?.origin,
  ).toBe('https://stats.example.test');
});
it('drops previews/confirmation refs and strips URL queries, external referrers and arbitrary event data', () => {
  const window = {
    location: { origin: 'https://example.test', hostname: 'example.test' },
    stellaAnalytics: undefined as unknown as (
      type: string,
      data: unknown,
    ) => Record<string, unknown> | null,
  };
  runInNewContext(
    readFileSync(
      new URL('../../../apps/web/public/analytics-guard.js', import.meta.url),
      'utf8',
    ),
    { window, URL },
  );
  for (const url of [
    '/en/preview?token=private',
    '/en/request/done/PRIVATE',
    '/en/my-trip',
    'https://other.test/en',
  ])
    expect(window.stellaAnalytics('event', { url })).toBeNull();
  const result = window.stellaAnalytics('event', {
    website: 'id',
    url: '/fr/t/quad-bike-safari?phone=private',
    referrer: 'https://referrer.test/?token=private',
    data: { slug: 'quad-bike-safari', phone: 'private', notes: 'private' },
    user: { name: 'private' },
    title: 'private',
  });
  expect(result?.url).toBe('/fr/t/quad-bike-safari');
  expect(result?.referrer).toBe('https://referrer.test');
  expect(result?.data).toEqual({ slug: 'quad-bike-safari' });
  expect(JSON.stringify(result)).not.toContain('private');
});
