import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchIndex } from '@stella/shared/search';
import { loadSearch, resetSearchCache } from './search-client';

const index: SearchIndex = {
  version: 'v1',
  locale: 'en',
  suggested: ['tiran-island-boat', 'gone'],
  entries: [
    {
      type: 'trip',
      slug: 'tiran-island-boat',
      collection: 'sea',
      title: { text: 'Tiran Island by Boat', lang: 'en' },
      collection_name: null,
      thumb: null,
      from_price_eur: 35,
      duration: null,
      fields: {
        title: ['tiran island by boat'],
        keywords: [],
        places: [],
        collection: [],
      },
    },
  ],
};
const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

afterEach(() => {
  vi.unstubAllGlobals();
  resetSearchCache();
});

describe('loadSearch', () => {
  it('fetches the index for the locale once and reuses it', async () => {
    const fetch = vi.fn(() => ok(index));
    vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([loadSearch('en'), loadSearch('en')]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/search-index?locale=en');
    expect(a.search('tiren')[0]?.slug).toBe('tiran-island-boat');
    expect(a.suggested.map((e) => e.slug)).toEqual(['tiran-island-boat']);
  });
  it('keeps a separate index per locale', async () => {
    const fetch = vi.fn(() => ok(index));
    vi.stubGlobal('fetch', fetch);
    await loadSearch('en');
    await loadSearch('it');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('fetches again after a failed load (retry)', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => ok(index));
    vi.stubGlobal('fetch', fetch);
    await expect(loadSearch('en')).rejects.toThrow();
    expect((await loadSearch('en')).search).toBeTypeOf('function');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects a server error and an invalid body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 503 }))),
    );
    await expect(loadSearch('en')).rejects.toThrow();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => ok({ entries: 'nope' })),
    );
    await expect(loadSearch('en')).rejects.toThrow();
  });
});
