import { describe, it, expect } from 'vitest';
import { estimateTrip, estimateTrips } from './price';
import { planDays } from './days';
import { bookingSchema, cairoDate, confirmationSchema } from './booking';
import type { Trip } from './public-contract';
const make = (
  unit: Trip['prices'][number]['unit'] = 'person',
  amount: number | null = 10,
  capacity: number | null = null,
) =>
  ({
    slug: 'sample',
    collection: 'sea',
    days_count: 1,
    flight: false,
    overnight: false,
    format: 'both',
    private_surcharge_pct: null,
    prices: [
      {
        id: 'base',
        unit,
        amount_eur: amount,
        max_qty: capacity,
        min_qty: null,
        label: null,
        is_primary: true,
      },
    ],
  }) as Trip;
describe('estimates', () => {
  it('counts children at the adult price until rules exist', () =>
    expect(estimateTrip(make(), 2, 1).amount).toBe(30));
  it.each(['quad', 'buggy', 'car', 'boat', 'group'] as const)(
    'applies %s capacity',
    (unit) => expect(estimateTrip(make(unit, 20, 2), 3).amount).toBe(40),
  );
  it('counts a vehicle once when no capacity is supplied', () =>
    expect(estimateTrip(make('car', 20), 5).amount).toBe(20));
  it('prices hourly bookings', () =>
    expect(
      estimateTrip(make('hour', 100), 2, 0, 'group', undefined, 3).amount,
    ).toBe(300));
  it('does not invent a private surcharge', () =>
    expect(estimateTrip(make(), 2, 0, 'private')).toEqual({
      amount: 0,
      onRequest: true,
    }));
  it('applies a supplied private surcharge', () =>
    expect(
      estimateTrip({ ...make(), private_surcharge_pct: 50 }, 2, 0, 'private')
        .amount,
    ).toBe(30));
  it('preserves an unknown amount alongside priced items', () =>
    expect(estimateTrips([make(), make('person', null)], 2)).toEqual({
      amount: 20,
      onRequest: true,
    }));
  it('uses a selected price row', () =>
    expect(
      estimateTrip(
        {
          ...make(),
          prices: [
            ...make().prices,
            {
              ...make().prices[0]!,
              id: 'double',
              amount_eur: 20,
              unit: 'quad',
              max_qty: 2,
            },
          ],
        },
        3,
        0,
        'group',
        'double',
      ).amount,
    ).toBe(40));
  it('never treats an unknown selected row as free', () =>
    expect(estimateTrip(make(), 1, 0, 'group', 'missing').onRequest).toBe(
      true,
    ));
  it('uses a package price, or sums its DB-supplied parts', () => {
    const item = make();
    const pkg = {
      ...item,
      kind: 'package' as const,
      parts: [
        {
          slug: 'a',
          title: { text: 'A', lang: 'en' },
          cover: null,
          days_count: 1,
          prices: item.prices,
          format: 'both' as const,
          private_surcharge_pct: null,
        },
      ],
    };
    expect(estimateTrip(pkg, 2).amount).toBe(20);
    expect(estimateTrip({ ...pkg, prices: [] }, 2).amount).toBe(20);
    expect(
      estimateTrip(
        { ...pkg, prices: [], parts: [{ ...pkg.parts[0]!, prices: [] }] },
        2,
      ).onRequest,
    ).toBe(true);
  });
});
describe('day planning', () => {
  it('orders sea, desert, relax, long days with rest after flights', () => {
    const sea = make(),
      desert = { ...make(), slug: 'desert', collection: 'desert' },
      relax = { ...make(), slug: 'relax', collection: 'relax' },
      flight = {
        ...make(),
        slug: 'cairo',
        collection: 'history',
        flight: true,
        days_count: 2,
      },
      beyond = { ...make(), slug: 'petra', collection: 'beyond' };
    const rows = planDays([beyond, flight, relax, desert, sea]);
    expect(rows.map((r) => [r.day, r.trip?.slug ?? 'rest'])).toEqual([
      [1, 'sample'],
      [2, 'desert'],
      [3, 'relax'],
      [4, 'petra'],
      [5, 'cairo'],
    ]);
    const other = planDays([flight, beyond]);
    expect(other.map((r) => [r.day, r.trip?.slug ?? 'rest'])).toEqual([
      [1, 'cairo'],
      [3, 'rest'],
      [4, 'petra'],
    ]);
  });
  it('does not add rest after the last trip', () =>
    expect(planDays([{ ...make(), flight: true }])).toHaveLength(1));
});
describe('booking validation', () => {
  const valid = () => ({
    mode: 'single',
    items: [{ trip_slug: 'tiran-island-boat' }],
    start_date: cairoDate(),
    adults: 1,
    children: 0,
    format: 'private',
    pickup_area: 'Nabq Bay',
    name: 'Test visitor',
    phone: '+391234567890',
    locale: 'it',
    hp: '',
    t: Date.now(),
  });
  it('accepts a well formed request', () =>
    expect(bookingSchema.safeParse(valid()).success).toBe(true));
  it('rejects injected estimates and unknown fields', () =>
    expect(
      bookingSchema.safeParse({ ...valid(), estimate_eur: 1 }).success,
    ).toBe(false));
  it('rejects invalid dates, phones, guests and honeypots', () => {
    for (const bad of [
      { start_date: '2020-01-01' },
      { phone: 'abc' },
      { adults: 0 },
      { hp: 'bot' },
      { name: 'x'.repeat(81) },
    ])
      expect(bookingSchema.safeParse({ ...valid(), ...bad }).success).toBe(
        false,
      );
  });
  it('rejects arbitrary confirmation links', () =>
    expect(
      confirmationSchema.safeParse({
        ref: 'STL-TEST',
        estimate_eur: null,
        whatsapp_url: 'https://attacker.test',
        message: 'test',
      }).success,
    ).toBe(false));
});
