import { describe, expect, it } from 'vitest';
import { factCounts, verificationInput } from './verification';

const trip = '7f2c4d1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f';

describe('verification answers', () => {
  it('accepts per-tour topics for a tour and site topics for the site', () => {
    expect(
      verificationInput.safeParse({
        tripId: trip,
        topic: 'pickup',
        status: 'verified',
        note: 'Naama Bay and Hadaba, 07:00–07:30',
      }).success,
    ).toBe(true);
    expect(
      verificationInput.safeParse({
        tripId: null,
        topic: 'aiTraining',
        status: 'to_confirm',
      }).success,
    ).toBe(true);
  });

  it('rejects topics outside the scope, unknown statuses and long notes', () => {
    for (const bad of [
      { tripId: null, topic: 'pickupWindow', status: 'verified' },
      { tripId: trip, topic: 'aiTraining', status: 'verified' },
      { tripId: trip, topic: 'pickup', status: 'published' },
      {
        tripId: trip,
        topic: 'pickup',
        status: 'verified',
        note: 'x'.repeat(2001),
      },
      { tripId: 'not-a-uuid', topic: 'pickup', status: 'verified' },
      { tripId: trip, topic: 'pickup', status: 'verified', extra: true },
    ])
      expect(verificationInput.safeParse(bad).success).toBe(false);
  });

  it('counts unanswered topics as missing, never as verified', () => {
    const facts = [
      {
        tripId: trip,
        topic: 'pickup',
        status: 'verified' as const,
        note: null,
        updatedAt: '2026-11-28T00:00:00Z',
      },
      {
        tripId: trip,
        topic: 'fees',
        status: 'to_confirm' as const,
        note: null,
        updatedAt: '2026-11-28T00:00:00Z',
      },
      {
        tripId: null,
        topic: 'pickup',
        status: 'verified' as const,
        note: null,
        updatedAt: '2026-11-28T00:00:00Z',
      },
    ];
    expect(factCounts(facts, trip, ['pickup', 'fees', 'age'])).toEqual({
      missing: 1,
      to_confirm: 1,
      verified: 1,
    });
  });
});
