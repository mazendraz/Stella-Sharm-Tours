import { expect, it } from 'vitest';
import { eligibleSlides } from './hero';
import type { Slide } from './public-contract';
it('preserves admin order while applying schedules and device visibility', () => {
  const base = {
    duration_s: 6,
    starts_at: null,
    ends_at: null,
    device: 'all',
  } as Slide;
  const slides = [
    { ...base, id: 'third' },
    { ...base, id: 'first', device: 'desktop' as const },
    { ...base, id: 'future', starts_at: '2030-01-01T00:00:00Z' },
    { ...base, id: 'expired', ends_at: '2020-01-01T00:00:00Z' },
  ];
  expect(
    eligibleSlides(slides, 'mobile', Date.parse('2026-11-11')).map((s) => s.id),
  ).toEqual(['third']);
  expect(
    eligibleSlides(slides, 'desktop', Date.parse('2026-11-11')).map(
      (s) => s.id,
    ),
  ).toEqual(['third', 'first']);
});
