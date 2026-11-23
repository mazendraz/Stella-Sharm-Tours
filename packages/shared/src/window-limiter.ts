/**
 * Fixed one-window-per-key limiter for public reads, held in process memory.
 *
 * The key map is bounded. When it is full, expired windows go first and then
 * the oldest windows (a Map iterates in insertion order). It never refuses a
 * caller just because the map is full: that would let anyone with many source
 * addresses lock out every visitor and the web server (audit SEC-02).
 * Pinned keys (the web server's trusted readers) are never evicted.
 */
export function createWindowLimiter(
  options: {
    maxKeys?: number;
    windowMs?: number;
    pinned?: Iterable<string>;
  } = {},
) {
  const maxKeys = options.maxKeys ?? 10000,
    windowMs = options.windowMs ?? 60000,
    pinned = new Set(options.pinned ?? []);
  const buckets = new Map<string, { count: number; until: number }>();
  return {
    hit(key: string, limit: number, now = Date.now()) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.until <= now) {
        if (bucket) buckets.delete(key);
        if (buckets.size >= maxKeys) {
          for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
          for (const k of buckets.keys()) {
            if (buckets.size < maxKeys) break;
            if (!pinned.has(k)) buckets.delete(k);
          }
        }
        bucket = { count: 0, until: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count++;
      return {
        allowed: bucket.count <= limit,
        retryAfter: Math.max(1, Math.ceil((bucket.until - now) / 1000)),
      };
    },
    get size() {
      return buckets.size;
    },
  };
}
