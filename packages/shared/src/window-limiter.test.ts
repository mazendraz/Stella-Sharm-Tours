import { describe, expect, it } from 'vitest';
import { createWindowLimiter } from './window-limiter';

describe('public read limiter', () => {
  it('limits each key within its window and resets afterwards', () => {
    const limiter = createWindowLimiter({ windowMs: 1000 });
    expect(limiter.hit('a', 2, 0).allowed).toBe(true);
    expect(limiter.hit('a', 2, 10).allowed).toBe(true);
    const third = limiter.hit('a', 2, 20);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBe(1);
    expect(limiter.hit('b', 2, 30).allowed).toBe(true);
    expect(limiter.hit('a', 2, 1000).allowed).toBe(true);
  });

  it('keeps serving new callers and pinned readers when the key map is full', () => {
    const limiter = createWindowLimiter({
      maxKeys: 100,
      windowMs: 60000,
      pinned: ['catalog-reader'],
    });
    expect(limiter.hit('catalog-reader', 2400, 0).allowed).toBe(true);
    // A flood of distinct addresses inside one window.
    for (let i = 0; i < 1000; i++) limiter.hit('attacker-' + i, 600, 1);
    expect(limiter.size).toBeLessThanOrEqual(100);
    expect(limiter.hit('new-visitor', 600, 2).allowed).toBe(true);
    // The trusted reader's window rolls over while the map is still full.
    expect(limiter.hit('catalog-reader', 2400, 60001).allowed).toBe(true);
    expect(limiter.hit('catalog-reader', 2400, 60002).allowed).toBe(true);
  });
});
