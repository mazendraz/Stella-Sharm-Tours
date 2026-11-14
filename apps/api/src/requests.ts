import { createHmac, randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import type { Config } from './config';
import { bookingSchema, cairoDate, stayDays } from '@stella/shared/booking';
import { estimateTrip } from '@stella/shared/price';
import { planDays } from '@stella/shared/days';
import { isCoreLocale } from '@stella/shared';
import { bookingGuests, bookingArea } from '@stella/shared/i18n/guests';
import { loadCatalog } from './catalog';
import { consume } from './rate';
import { fail } from './errors';
export const hashPrivate = (value: string, salt: string) =>
  createHmac('sha256', salt).update(value).digest('hex');
export function requestRef() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  return 'STL-' + [...randomBytes(10)].map((n) => alphabet[n & 31]).join('');
}
export async function createRequest(
  db: Database,
  cfg: Config,
  body: unknown,
  ip: string,
  userAgent: string,
) {
  const ipHash = hashPrivate(ip, cfg.IP_HASH_SALT);
  if (!(await consume(db, 'request-ip:' + ipHash, 5, 600)))
    fail(429, 'RATE_LIMITED');
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) fail(422, 'INVALID_REQUEST');
  const b = parsed.data;
  if (
    Date.now() - b.t < 3000 ||
    Date.now() - b.t > 86400000 ||
    (b.mode === 'single' && b.items.length !== 1) ||
    new Set(b.items.map((i) => i.trip_slug)).size !== b.items.length
  )
    fail(422, 'INVALID_REQUEST');
  if (
    !(await consume(
      db,
      'request-phone:' + hashPrivate(b.phone, cfg.IP_HASH_SALT),
      20,
      86400,
    ))
  )
    fail(429, 'RATE_LIMITED');
  return db.transaction(
    async (tx) => {
      const catalog = await loadCatalog(tx, b.locale, cfg.MEDIA_PUBLIC_URL, {
        pricingDate: b.start_date,
        sequential: true,
      });
      if (!catalog.site.locales.some((l) => l.code === b.locale))
        fail(422, 'INVALID_LOCALE');
      const rules = catalog.settings.request_rules as
        | {
            min_days_ahead?: number;
            max_adults?: number;
            max_children?: number;
          }
        | undefined;
      const minimum = new Date(cairoDate() + 'T12:00:00Z');
      minimum.setUTCDate(minimum.getUTCDate() + (rules?.min_days_ahead ?? 0));
      if (
        b.adults > (rules?.max_adults ?? 60) ||
        b.children > (rules?.max_children ?? 40) ||
        b.start_date < minimum.toISOString().slice(0, 10) ||
        !catalog.site.pickup_areas.includes(b.pickup_area)
      )
        fail(422, 'REQUEST_RULES');
      const selected = b.items.map((item) => {
        const trip = catalog.trips.find((t) => t.slug === item.trip_slug);
        if (!trip) fail(422, 'TRIP_UNAVAILABLE');
        if (
          item.price_id &&
          !trip.prices.some((p) => p.id === item.price_id && p.unit !== 'child')
        )
          fail(422, 'INVALID_PRICE');
        if (b.format === 'group' && trip.format === 'private')
          fail(422, 'PRIVATE_ONLY');
        return {
          trip,
          item,
          estimate: estimateTrip(
            trip,
            b.adults,
            b.children,
            b.format,
            item.price_id,
            item.hours ?? 1,
          ),
        };
      });
      const amount = selected.reduce((sum, s) => sum + s.estimate.amount, 0),
        onRequest = selected.some((s) => s.estimate.onRequest),
        estimate = onRequest ? null : amount;
      const days = planDays(
        selected.map((s) => s.trip),
        b.rest_days ?? true,
      );
      const planned = new Map(
        days.flatMap((d) => (d.trip ? [[d.trip.slug, d.day] as const] : [])),
      );
      const scheduleReview = selected.some(({ trip }) => {
        if (!trip.run_days?.length) return false;
        const date = new Date(b.start_date + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + (planned.get(trip.slug) ?? 1) - 1);
        return !trip.run_days.includes(date.getUTCDay());
      });
      if (estimate !== null && estimate > 99999999.99)
        fail(422, 'ESTIMATE_EXCEEDS_RANGE');
      const contacts = catalog.site.contacts;
      if (
        !contacts.whatsapp_primary ||
        !/^\+[1-9]\d{6,14}$/.test(contacts.whatsapp_primary)
      )
        fail(503, 'CONTACT_UNAVAILABLE');
      const prefix: Record<string, string> = {
        en: 'Booking request',
        it: 'Richiesta di prenotazione',
        es: 'Solicitud de reserva',
        fr: 'Demande de réservation',
        de: 'Buchungsanfrage',
        ru: 'Запрос на бронирование',
        tr: 'Rezervasyon talebi',
      };
      const ref = requestRef();
      // e.g. "2026-11-14 → 2026-11-17 (4 days / 3 nights)"
      const stay = b.end_date
        ? `${b.start_date} → ${b.end_date} (${stayDays(b.start_date, b.end_date)} days / ${stayDays(b.start_date, b.end_date) - 1} nights)`
        : b.start_date;
      const staffTitles = isCoreLocale(b.locale)
        ? null
        : await tx
            .select({ slug: s.trips.slug, title: s.trips.title })
            .from(s.trips)
            .where(
              inArray(
                s.trips.slug,
                b.items.map((i) => i.trip_slug),
              ),
            );
      const message = [
        prefix[b.locale] ?? prefix.en,
        ref,
        b.name,
        stay,
        bookingGuests(b.adults, b.children, b.locale),
        ...selected.map(
          (s) =>
            staffTitles?.find((t) => t.slug === s.trip.slug)?.title.en ??
            s.trip.title.text,
        ),
        bookingArea(b.pickup_area, b.locale),
        b.hotel ?? '',
      ]
        .filter(Boolean)
        .join('\n');
      // A repeatable-read snapshot keeps prices, status, packages and settings from
      // one database version. Locks also prevent selected trips disappearing mid-save.
      const locked = await tx
        .select()
        .from(s.trips)
        .where(
          inArray(
            s.trips.slug,
            b.items.map((i) => i.trip_slug),
          ),
        )
        .for('share');
      if (
        locked.length !== selected.length ||
        locked.some((t) => t.status !== 'published' || t.archivedAt)
      )
        fail(409, 'CATALOG_CHANGED');
      const [request] = await tx
        .insert(s.bookingRequests)
        .values({
          ref,
          mode: b.mode,
          locale: b.locale,
          startDate: b.start_date,
          adults: b.adults,
          children: b.children,
          childAges: b.child_ages ?? null,
          format: b.format,
          pickupArea: b.pickup_area,
          hotel: b.hotel ?? null,
          name: b.name,
          phone: b.phone,
          email: b.email || null,
          notes:
            [b.end_date ? 'Stay: ' + stay : '', b.notes ?? '']
              .filter(Boolean)
              .join('\n') || null,
          estimateEur: estimate === null ? null : String(estimate),
          ipHash,
          userAgent: userAgent.slice(0, 300),
          internalNote: scheduleReview
            ? 'Schedule needs staff review: requested weekday differs from published run days.'
            : null,
        })
        .returning();
      await tx.insert(s.bookingRequestItems).values(
        selected.map(({ trip, item, estimate }) => ({
          requestId: request!.id,
          tripId: locked.find((t) => t.slug === trip.slug)!.id,
          dayIndex: planned.get(trip.slug) ?? 1,
          priceSnapshot: {
            prices: trip.prices,
            format: b.format,
            private_surcharge_pct: trip.private_surcharge_pct,
            selected_price_id: item.price_id ?? null,
            hours: item.hours ?? 1,
            amount: estimate.amount,
            on_request: estimate.onRequest,
          },
        })),
      );
      await tx.insert(s.outbox).values({
        name: 'notify.request.created',
        data: { requestId: request!.id },
      });
      if (cfg.VAPID_PUBLIC_KEY)
        await tx.insert(s.outbox).values({
          name: 'notify.request.push',
          data: { requestId: request!.id },
        });
      return {
        ref,
        estimate_eur: estimate,
        whatsapp_url:
          'https://wa.me/' +
          contacts.whatsapp_primary.replace(/\D/g, '') +
          '?text=' +
          encodeURIComponent(message),
        message,
      };
    },
    { isolationLevel: 'repeatable read' },
  );
}
