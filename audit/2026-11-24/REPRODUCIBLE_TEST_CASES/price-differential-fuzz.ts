/**
 * AUDIT-T02 — Differential fuzz of the shared price calculator.
 *
 * Reference = an independent implementation written from the spec in
 * docs/02-backend-database-plan.md §"Price calculator" (not from the code).
 * Subject   = packages/shared/src/price.ts estimateTrip().
 *
 * Seeded PRNG (mulberry32) — every failure prints its seed + case index and
 * the full input so it can be replayed exactly.
 *
 * Run: node_modules/.bin/tsx audit/2026-11-24/REPRODUCIBLE_TEST_CASES/price-differential-fuzz.ts [seed] [cases]
 */
import { estimateTrip } from '../../../packages/shared/src/price';

const seed = Number(process.argv[2] ?? 20261124);
const cases = Number(process.argv[3] ?? 20000);
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(seed);
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;

type Unit =
  'person' | 'child' | 'hour' | 'quad' | 'buggy' | 'car' | 'boat' | 'group';
type P = {
  id: string;
  amount_eur: number | null;
  unit: Unit;
  max_qty: number | null;
  min_qty: number | null;
  is_primary: boolean;
  label: null;
};
const units: Unit[] = [
  'person',
  'child',
  'hour',
  'quad',
  'buggy',
  'car',
  'boat',
  'group',
];
function genPrices(): P[] {
  const n = int(0, 4);
  const out: P[] = [];
  for (let i = 0; i < n; i++)
    out.push({
      id: 'p' + i,
      amount_eur: rnd() < 0.12 ? null : int(0, 50000) / 100,
      unit: pick(units),
      max_qty: rnd() < 0.5 ? null : int(1, 12),
      min_qty: null,
      is_primary: rnd() < 0.4,
      label: null,
    });
  return out;
}

// ---------- Reference implementation from the written spec ----------
type Est = { amount: number; onRequest: boolean };
function refPrimary(prices: P[]) {
  return (
    prices.find((p) => p.is_primary && p.unit !== 'child') ??
    prices.find((p) => p.unit !== 'child')
  );
}
function refLine(
  prices: P[],
  tripFormat: 'group' | 'private' | 'both',
  surcharge: number | null,
  adults: number,
  children: number,
  format: 'group' | 'private',
  hours: number,
): Est {
  const row = refPrimary(prices);
  if (!row || row.amount_eur === null) return { amount: 0, onRequest: true };
  const people = adults + children;
  let cents: number;
  if (row.unit === 'person') {
    const child = prices.find((p) => p.unit === 'child');
    if (children > 0 && child && child.amount_eur === null)
      return { amount: 0, onRequest: true };
    const childAmount = child ? child.amount_eur! : row.amount_eur;
    cents =
      Math.round(row.amount_eur * 100) * adults +
      Math.round(childAmount * 100) * children;
  } else if (row.unit === 'hour')
    cents = Math.round(row.amount_eur * 100) * hours;
  else
    cents =
      Math.round(row.amount_eur * 100) *
      (row.max_qty ? Math.ceil(people / row.max_qty) : 1);
  if (format === 'private' && tripFormat !== 'private') {
    if (surcharge === null) return { amount: 0, onRequest: true };
    cents = Math.round(cents * (1 + surcharge / 100));
  }
  return { amount: cents / 100, onRequest: false };
}

let failures = 0;
let executed = 0;
const failuresOut: unknown[] = [];
for (let i = 0; i < cases; i++) {
  const isPackage = rnd() < 0.25;
  const prices = genPrices();
  const tripFormat = pick(['group', 'private', 'both'] as const);
  const surcharge = rnd() < 0.5 ? null : int(0, 150);
  const adults = int(1, 60);
  const children = int(0, 40);
  const format = pick(['group', 'private'] as const);
  const hours = int(1, 24);
  const parts = isPackage
    ? Array.from({ length: int(1, 4) }, () => ({
        prices: genPrices(),
        format: pick(['group', 'private', 'both'] as const),
        private_surcharge_pct: rnd() < 0.5 ? null : int(0, 150),
      }))
    : undefined;
  const trip = {
    prices,
    format: tripFormat,
    private_surcharge_pct: surcharge,
    kind: isPackage ? ('package' as const) : ('trip' as const),
    parts,
  };
  // Spec: "Package: use the package's own price if set, else sum of items."
  let expected: Est;
  const own = refPrimary(prices);
  if (isPackage && (!own || own.amount_eur === null) && parts!.length) {
    expected = parts!.reduce<Est>(
      (sum, part) => {
        const e = refLine(
          part.prices,
          part.format,
          part.private_surcharge_pct,
          adults,
          children,
          part.format === 'private' ? 'private' : format,
          1,
        );
        return {
          amount: sum.amount + e.amount,
          onRequest: sum.onRequest || e.onRequest,
        };
      },
      { amount: 0, onRequest: false },
    );
  } else
    expected = refLine(
      prices,
      tripFormat,
      surcharge,
      adults,
      children,
      format,
      own?.unit === 'hour' ? hours : 1,
    );

  const actual = estimateTrip(
    trip as never,
    adults,
    children,
    format,
    undefined,
    own?.unit === 'hour' ? hours : 1,
  );
  executed++;
  const same =
    actual.onRequest === expected.onRequest &&
    (expected.onRequest || Math.abs(actual.amount - expected.amount) < 1e-9);
  // Invariants that must always hold.
  const invariant =
    Number.isFinite(actual.amount) &&
    actual.amount >= 0 &&
    Number.isInteger(Math.round(actual.amount * 100));
  if (!same || !invariant) {
    failures++;
    if (failuresOut.length < 10)
      failuresOut.push({
        seed,
        index: i,
        trip,
        adults,
        children,
        format,
        hours,
        expected,
        actual,
      });
  }
}
console.log(JSON.stringify({ seed, executed, failures }, null, 0));
for (const f of failuresOut) console.log('FAIL', JSON.stringify(f));
process.exitCode = failures ? 1 : 0;
