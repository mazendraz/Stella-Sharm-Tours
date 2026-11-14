import type { Trip } from './public-contract';
export type DayRow = { day: number; trip: Trip | null };
// `rest`: add a free (beach) day after each flight or overnight trip, so the
// guest isn't sent on the next excursion straight after a night on the bus.
export function planDays(trips: Trip[], rest = true): DayRow[] {
  const rank: Record<string, number> = {
    sea: 0,
    desert: 1,
    relax: 2,
    history: 3,
    beyond: 3,
    all: 4,
  };
  const sorted = [...trips].sort(
    (a, b) => (rank[a.collection] ?? 4) - (rank[b.collection] ?? 4),
  );
  const rows: DayRow[] = [];
  let day = 1;
  sorted.forEach((trip, i) => {
    rows.push({ day, trip });
    day += trip.days_count;
    if (rest && (trip.flight || trip.overnight) && i < sorted.length - 1)
      rows.push({ day: day++, trip: null });
  });
  return rows;
}
