import { it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('apps/web/package.json'));
const FileSystemCache =
  require('next/dist/server/lib/incremental-cache/file-system-cache.js')
    .default as new (context: Record<string, unknown>) => {
    revalidateTag: (tags: string[]) => Promise<void>;
  };
const { isStale, tagsManifest } =
  require('next/dist/server/lib/incremental-cache/tags-manifest.external.js') as {
    isStale: (tags: string[], timestamp: number) => boolean;
    tagsManifest: Map<string, number>;
  };
it('expires data populated between two invalidations of the same Next.js tag', async () => {
  const tag = 'trip:repeated-invalidation-regression',
    clock = vi.spyOn(Date, 'now');
  const cache = new FileSystemCache({
    fs: {},
    flushToDisk: false,
    serverDistDir: '/unused',
    revalidatedTags: [],
    maxMemoryCacheSize: 0,
  });
  try {
    clock.mockReturnValue(1000);
    await cache.revalidateTag([tag]);
    expect(isStale([tag], 500)).toBe(true);
    expect(isStale([tag], 1500)).toBe(false);
    clock.mockReturnValue(2000);
    await cache.revalidateTag([tag]);
    expect(isStale([tag], 1500)).toBe(true);
  } finally {
    tagsManifest.delete(tag);
    clock.mockRestore();
  }
});
