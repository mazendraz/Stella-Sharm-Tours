import type { Price, Trip } from './public-contract';
export type Estimate = { amount: number; onRequest: boolean };
export function primaryPrice(trip: Pick<Trip, 'prices'>): Price | undefined {
  return (
    trip.prices.find((p) => p.is_primary) ??
    trip.prices.find((p) => p.unit !== 'child')
  );
}
export function estimateTrip(
  trip: Pick<Trip, 'prices' | 'format' | 'private_surcharge_pct'> &
    Partial<Pick<Trip, 'kind' | 'parts'>>,
  adults: number,
  children = 0,
  format: 'group' | 'private' = 'group',
  priceId?: string,
  hours = 1,
): Estimate {
  const row = priceId
    ? trip.prices.find((p) => p.id === priceId)
    : primaryPrice(trip);
  if (
    trip.kind === 'package' &&
    (!row || row.amount_eur === null) &&
    !priceId &&
    trip.parts?.length
  )
    return trip.parts.reduce<Estimate>(
      (sum, part) => {
        const partFormat = part.format ?? 'both';
        const next = estimateTrip(
          {
            prices: part.prices ?? [],
            format: partFormat,
            private_surcharge_pct: part.private_surcharge_pct ?? null,
          },
          adults,
          children,
          partFormat === 'private' ? 'private' : format,
        );
        return {
          amount: sum.amount + next.amount,
          onRequest: sum.onRequest || next.onRequest,
        };
      },
      { amount: 0, onRequest: false },
    );
  if (!row || row.amount_eur === null) return { amount: 0, onRequest: true };
  if (
    format === 'private' &&
    trip.format !== 'private' &&
    trip.private_surcharge_pct === null
  )
    return { amount: 0, onRequest: true };
  const cents = Math.round(row.amount_eur * 100),
    people = adults + children;
  let total = 0;
  if (row.unit === 'person') {
    const child = trip.prices.find((p) => p.unit === 'child');
    if (children > 0 && child?.amount_eur === null)
      return { amount: 0, onRequest: true };
    total =
      cents * adults +
      Math.round((child?.amount_eur ?? row.amount_eur) * 100) * children;
  } else if (row.unit === 'hour') total = cents * hours;
  else total = cents * (row.max_qty ? Math.ceil(people / row.max_qty) : 1);
  if (format === 'private' && trip.format !== 'private')
    total = Math.round(total * (1 + (trip.private_surcharge_pct ?? 0) / 100));
  return { amount: total / 100, onRequest: false };
}
export function estimateTrips(
  trips: Trip[],
  adults: number,
  children = 0,
  format: 'group' | 'private' = 'group',
): Estimate {
  return trips.reduce<Estimate>(
    (sum, t) => {
      const next = estimateTrip(
        t,
        adults,
        children,
        t.format === 'private' ? 'private' : format,
      );
      return {
        amount: sum.amount + next.amount,
        onRequest: sum.onRequest || next.onRequest,
      };
    },
    { amount: 0, onRequest: false },
  );
}
