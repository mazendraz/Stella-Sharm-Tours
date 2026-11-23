import type { Trip } from './public-contract';
export function requiresPrivateRequest(trips: readonly Pick<Trip, 'format'>[]) {
  return trips.some((trip) => trip.format === 'private');
}
type SchedulableTrip = Pick<
  Trip,
  'collection' | 'days_count' | 'flight' | 'overnight'
>;
export type DayRow<T = Trip> = { day: number; trip: T | null };
// `rest`: add a free (beach) day after each flight or overnight trip, so the
// guest isn't sent on the next excursion straight after a night on the bus.
export function planDays<T extends SchedulableTrip>(
  trips: T[],
  rest = true,
  preserveOrder = false,
): DayRow<T>[] {
  const rank: Record<string, number> = {
    sea: 0,
    desert: 1,
    relax: 2,
    history: 3,
    beyond: 3,
    all: 4,
  };
  const ordered = preserveOrder
    ? trips
    : [...trips].sort(
        (a, b) => (rank[a.collection] ?? 4) - (rank[b.collection] ?? 4),
      );
  const rows: DayRow<T>[] = [];
  let day = 1;
  ordered.forEach((trip, i) => {
    rows.push({ day, trip });
    day += trip.days_count;
    if (rest && (trip.flight || trip.overnight) && i < ordered.length - 1)
      rows.push({ day: day++, trip: null });
  });
  return rows;
}

export function lastPlannedDay(rows: readonly DayRow<SchedulableTrip>[]) {
  const last = rows.at(-1);
  return last ? last.day + (last.trip?.days_count ?? 1) - 1 : 0;
}
