import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiReady } from './readiness';
afterEach(() => vi.unstubAllGlobals());
describe('operational dependency probes', () => {
  it('does not mistake an HTTP error or unrelated JSON for readiness', async () => {
    for (const response of [
      new Response('private details', { status: 503 }),
      Response.json({ status: 'starting' }),
      new Response('<html>'),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect(await apiReady('http://api:4000')).toBe(false);
    }
  });
  it('fails closed on missing config and timeouts, succeeds on healthy API', async () => {
    expect(await apiReady(undefined)).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private network address')),
    );
    expect(await apiReady('http://api:4000')).toBe(false);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetcher);
    expect(await apiReady('http://api:4000')).toBe(true);
    expect(fetcher.mock.calls[0]?.[0].pathname).toBe('/readyz');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      redirect: 'error',
    });
  });
});
