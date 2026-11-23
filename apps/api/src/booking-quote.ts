import { createHash } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { isCoreLocale } from '@stella/shared';
import {
  addCalendarDays,
  minBookingDate,
  quoteInputSchema,
  type Quote,
  type QuoteInput,
} from '@stella/shared/booking';
import { planDays } from '@stella/shared/days';
import { estimateTrip, primaryPrice } from '@stella/shared/price';
import type { Price } from '@stella/shared/public-contract';
import { resolveText } from '@stella/shared/i18n/resolve';
import { liveLocales } from './catalog';
import { fail } from './errors';

type Reader = Pick<Database, 'select'>;

function publishedTrips(db: Reader) {
  return db
    .select({
      id: s.trips.id,
      slug: s.trips.slug,
      title: s.trips.title,
      collection: s.collections.slug,
      kind: s.trips.kind,
      days_count: s.trips.daysCount,
      flight: s.trips.flight,
      overnight: s.trips.overnight,
      format: s.trips.format,
      surcharge: s.trips.privateSurchargePct,
      runDays: s.trips.runDays,
    })
    .from(s.trips)
    .innerJoin(
      s.collections,
      and(
        eq(s.trips.collectionId, s.collections.id),
        eq(s.collections.status, 'published'),
        isNull(s.collections.archivedAt),
      ),
    );
}
const published = and(
  eq(s.trips.status, 'published'),
  isNull(s.trips.archivedAt),
);

export function parseQuoteInput(body: unknown) {
  const parsed = quoteInputSchema.safeParse(body);
  if (!parsed.success) fail(422, 'INVALID_REQUEST');
  return parsed.data;
}

export async function calculateBookingQuote(db: Reader, input: QuoteInput) {
  const bySlug = new Map(input.items.map((item) => [item.trip_slug, item]));
  if (bySlug.size !== input.items.length) fail(422, 'INVALID_REQUEST');
  const settings = Object.fromEntries(
    (
      await db
        .select()
        .from(s.settings)
        .where(
          inArray(s.settings.key, [
            'i18n',
            'i18n_runtime',
            'request_rules',
            'pickup_areas',
            'contacts',
          ]),
        )
    ).map((row) => [row.key, row.value]),
  );
  if (!liveLocales(settings).some((locale) => locale.code === input.locale))
    fail(422, 'INVALID_LOCALE');
  const rules = settings.request_rules as
    | {
        min_days_ahead?: number;
        max_adults?: number;
        max_children?: number;
      }
    | undefined;
  if (
    input.adults > (rules?.max_adults ?? 60) ||
    input.children > (rules?.max_children ?? 40) ||
    input.start_date < minBookingDate(undefined, rules?.min_days_ahead)
  )
    fail(422, 'REQUEST_RULES');

  const trips = await publishedTrips(db).where(
    and(published, inArray(s.trips.slug, [...bySlug.keys()])),
  );
  if (trips.length !== bySlug.size) fail(422, 'TRIP_UNAVAILABLE');
  if (
    input.format === 'group' &&
    trips.some((trip) => trip.format === 'private')
  )
    fail(422, 'PRIVATE_ONLY');
  const tripBySlug = new Map(trips.map((trip) => [trip.slug, trip]));
  const plan = planDays(
    input.items.map(({ trip_slug }) => tripBySlug.get(trip_slug)!),
    input.rest_days ?? true,
    input.preserve_order,
  ).flatMap(({ day, trip }) =>
    trip
      ? [
          {
            day,
            trip,
            date: addCalendarDays(input.start_date, day - 1),
            end: addCalendarDays(input.start_date, day + trip.days_count - 2),
          },
        ]
      : [],
  );
  const packageIds = trips
    .filter((trip) => trip.kind === 'package')
    .map((trip) => trip.id);
  const parts = packageIds.length
    ? await db
        .select()
        .from(s.packageItems)
        .where(inArray(s.packageItems.packageId, packageIds))
        .orderBy(asc(s.packageItems.sort), asc(s.packageItems.tripId))
    : [];
  const partIds = [...new Set(parts.map((part) => part.tripId))];
  const partTrips = partIds.length
    ? await publishedTrips(db).where(
        and(published, eq(s.trips.kind, 'trip'), inArray(s.trips.id, partIds)),
      )
    : [];
  if (partTrips.length !== partIds.length) fail(422, 'TRIP_UNAVAILABLE');
  const partById = new Map(partTrips.map((trip) => [trip.id, trip]));
  const bookedTripIds = [
    ...new Set([...trips.map((trip) => trip.id), ...partIds]),
  ];
  const datedPlan = plan.map((entry) => {
    let next = 1;
    const datedParts = parts
      .filter((part) => part.packageId === entry.trip.id)
      .map((part) => {
        const trip = partById.get(part.tripId)!;
        const day = part.dayIndex ?? next;
        next = Math.max(next, day + trip.days_count);
        return { trip, date: addCalendarDays(entry.date, day - 1) };
      });
    return { ...entry, parts: datedParts };
  });
  const lastDate = [
    input.start_date,
    ...datedPlan.flatMap((item) => [
      item.date,
      ...item.parts.map((part) => part.date),
    ]),
  ]
    .sort()
    .at(-1)!;
  const prices = await db
    .select()
    .from(s.tripPrices)
    .where(
      and(
        inArray(s.tripPrices.tripId, bookedTripIds),
        or(
          isNull(s.tripPrices.validFrom),
          lte(s.tripPrices.validFrom, lastDate),
        ),
        or(
          isNull(s.tripPrices.validTo),
          gte(s.tripPrices.validTo, input.start_date),
        ),
      ),
    )
    .orderBy(asc(s.tripPrices.sort), asc(s.tripPrices.id));
  const translations = await db
    .select()
    .from(s.contentTranslations)
    .where(
      and(
        eq(s.contentTranslations.locale, input.locale),
        or(
          and(
            eq(s.contentTranslations.entity, 'trip_price'),
            eq(s.contentTranslations.field, 'label'),
            inArray(
              s.contentTranslations.entityId,
              prices.map((price) => price.id),
            ),
          ),
          and(
            eq(s.contentTranslations.entity, 'trip'),
            eq(s.contentTranslations.field, 'title'),
            inArray(
              s.contentTranslations.entityId,
              trips.map((trip) => trip.id),
            ),
          ),
        ),
      ),
    );
  const textByEntity = new Map(
    translations.map((row) => [row.entity + ':' + row.entityId, row]),
  );
  function localized(entity: string, id: string, value: s.Localized | null) {
    const row = textByEntity.get(entity + ':' + id);
    const resolved = resolveText(value, input.locale, row ? [row] : []);
    return resolved ? { text: resolved.text, lang: resolved.lang } : null;
  }
  const pricesFor = (id: string, date: string): Price[] =>
    prices
      .filter(
        (row) =>
          row.tripId === id &&
          (!row.validFrom || row.validFrom <= date) &&
          (!row.validTo || row.validTo >= date),
      )
      .map((row) => ({
        id: row.id,
        label: localized('trip_price', row.id, row.label),
        amount_eur: row.amountEur === null ? null : Number(row.amountEur),
        unit: row.unit,
        min_qty: row.minQty,
        max_qty: row.maxQty,
        is_primary: row.isPrimary,
      }));

  const selected = datedPlan.map(({ trip, day, date, end, parts }) => {
    const item = bySlug.get(trip.slug)!;
    const active = pricesFor(trip.id, date);
    const options = active.filter((row) => row.unit !== 'child');
    const explicit = options.find((row) => row.id === item.price_id);
    const row = explicit ?? primaryPrice({ prices: active });
    const partRates = parts.map(({ trip, date }) => ({
      date,
      slug: trip.slug,
      format: trip.format,
      private_surcharge_pct:
        trip.surcharge === null ? null : Number(trip.surcharge),
      prices: pricesFor(trip.id, date),
    }));
    const pricing = {
      prices: active,
      kind: trip.kind,
      format: trip.format,
      private_surcharge_pct:
        trip.surcharge === null ? null : Number(trip.surcharge),
      parts: partRates,
    };
    const hours = row?.unit === 'hour' ? (item.hours ?? 1) : 1;
    const estimate = estimateTrip(
      pricing,
      input.adults,
      input.children,
      input.format,
      explicit?.id,
      hours,
    );
    const amount = Math.round(estimate.amount);
    const details = {
      trip_slug: trip.slug,
      day_index: day,
      service_date: date,
      service_end_date: end,
      amount_eur: estimate.onRequest ? null : amount,
      selected_price_id: row?.id ?? null,
      price_options: options,
    };
    return {
      trip,
      staffTitle: isCoreLocale(input.locale)
        ? (localized('trip', trip.id, trip.title)?.text ?? trip.title.en)
        : trip.title.en,
      details,
      invalidPrice: !!item.price_id && !explicit,
      snapshot: {
        prices: active,
        format: input.format,
        private_surcharge_pct: pricing.private_surcharge_pct,
        selected_price_id: row?.id ?? null,
        hours,
        amount: details.amount_eur,
        on_request: estimate.onRequest,
        service_date: date,
        service_end_date: end,
        ...(partRates.length ? { parts: partRates } : {}),
      },
    };
  });
  const known = selected.reduce(
    (sum, { details }) => sum + (details.amount_eur ?? 0),
    0,
  );
  if (known > 99999999) fail(422, 'ESTIMATE_EXCEEDS_RANGE');
  const quote: Quote = {
    quote_id: createHash('sha256')
      .update(
        JSON.stringify({
          adults: input.adults,
          children: input.children,
          rates: selected.map(({ details, snapshot }) => [
            details.trip_slug,
            details.day_index,
            snapshot,
          ]),
        }),
      )
      .digest('hex'),
    estimate_eur: selected.some(({ snapshot }) => snapshot.on_request)
      ? null
      : known,
    known_eur: known,
    items: selected.map(({ details }) => details),
  };
  return { quote, selected, settings, bookedTripIds };
}
