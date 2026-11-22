import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import type { Config } from './config';
import {
  bookingPayloadSchema,
  bookingStartDateIsValid,
  submissionDetails,
  type Booking,
} from '@stella/shared/booking';
import { normalizeBookingPhone } from '@stella/shared/phone';
import {
  bookingStay,
  scheduleNotice,
  staffBookingCopy,
  storedScheduleNotice,
} from '@stella/shared/i18n/booking-messages';
import { isCoreLocale } from '@stella/shared';
import {
  bookingGuests,
  bookingArea,
  bookingEstimate,
} from '@stella/shared/i18n/guests';
import { calculateBookingQuote } from './booking-quote';
import { consume } from './rate';
import { fail } from './errors';
export const hashPrivate = (value: string, salt: string) =>
  createHmac('sha256', salt).update(value).digest('hex');
export function requestRef() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  return 'STL-' + [...randomBytes(10)].map((n) => alphabet[n & 31]).join('');
}
type Submission = { id: string; hash: string };

async function replayRequest(
  db: Database,
  submission: Submission,
  ipHash: string,
) {
  const [receipt] = await db
    .select()
    .from(s.bookingRequestReceipts)
    .where(eq(s.bookingRequestReceipts.submissionId, submission.id));
  if (!receipt) return;
  if (!(await consume(db, 'request-replay:' + ipHash, 40, 60)))
    fail(429, 'RATE_LIMITED');
  if (
    !/^[a-f0-9]{64}$/.test(receipt.payloadHash) ||
    !timingSafeEqual(
      Buffer.from(receipt.payloadHash, 'hex'),
      Buffer.from(submission.hash, 'hex'),
    )
  )
    fail(409, 'SUBMISSION_CONFLICT');
  if (!receipt.confirmation || receipt.expiresAt.getTime() <= Date.now())
    fail(409, 'SUBMISSION_EXPIRED');
  return receipt.confirmation;
}

export async function createRequest(
  db: Database,
  cfg: Config,
  body: unknown,
  ip: string,
  userAgent: string,
) {
  const ipHash = hashPrivate(ip, cfg.IP_HASH_SALT);
  const parsed = bookingPayloadSchema.safeParse(body);
  const submission =
    parsed.success && parsed.data.submission_id
      ? {
          id: parsed.data.submission_id,
          hash: hashPrivate(
            'booking:' + JSON.stringify(submissionDetails(parsed.data)),
            cfg.IP_HASH_SALT,
          ),
        }
      : null;
  if (submission) {
    const replay = await replayRequest(db, submission, ipHash);
    if (replay) return replay;
  }
  if (!(await consume(db, 'request-ip:' + ipHash, 5, 600)))
    fail(429, 'RATE_LIMITED');
  if (!parsed.success) fail(422, 'INVALID_REQUEST');
  const b = parsed.data;
  if (
    !bookingStartDateIsValid(b.start_date) ||
    Date.now() - b.t < 3000 ||
    Date.now() - b.t > 86400000 ||
    normalizeBookingPhone(b.phone) !== b.phone ||
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
  try {
    return await persistRequest(db, cfg, b, ipHash, userAgent, submission);
  } catch (error) {
    const cause =
      error instanceof Error
        ? (error.cause as { code?: string; constraint?: string } | undefined)
        : undefined;
    if (
      submission &&
      cause?.code === '23505' &&
      cause.constraint === 'booking_request_receipts_pkey'
    ) {
      // A concurrent attempt committed first. The failed transaction rolled
      // back its request and outbox rows before this fresh read.
      const replay = await replayRequest(db, submission, ipHash);
      if (replay) return replay;
    }
    throw error;
  }
}

function persistRequest(
  db: Database,
  cfg: Config,
  b: Booking,
  ipHash: string,
  userAgent: string,
  submission: Submission | null,
) {
  return db.transaction(
    async (tx) => {
      const { quote, selected, settings, bookedTripIds } =
        await calculateBookingQuote(tx, b);
      if (
        !Array.isArray(settings.pickup_areas) ||
        !settings.pickup_areas.includes(b.pickup_area)
      )
        fail(422, 'REQUEST_RULES');
      if (b.quote_id && b.quote_id !== quote.quote_id) return { quote };
      if (selected.some(({ invalidPrice }) => invalidPrice))
        fail(422, 'INVALID_PRICE');
      const estimate = quote.estimate_eur;
      const scheduleReview = selected.some(({ trip, details }) => {
        if (!trip.runDays?.length) return false;
        const date = new Date(details.service_date + 'T12:00:00Z');
        return !trip.runDays.includes(date.getUTCDay());
      });
      const contacts = settings.contacts as
        { whatsapp_primary?: string } | undefined;
      if (
        !contacts?.whatsapp_primary ||
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
      const messageLocale = isCoreLocale(b.locale) ? b.locale : 'en';
      const message = [
        prefix[b.locale] ?? prefix.en,
        ref,
        b.name,
        bookingStay(b.start_date, b.end_date, messageLocale),
        bookingGuests(b.adults, b.children, b.locale),
        ...selected.map(({ staffTitle, details }) => {
          const { service_date: start, service_end_date: end } = details;
          return (
            staffTitle + ' · ' + (start === end ? start : start + ' → ' + end)
          );
        }),
        bookingEstimate(quote.estimate_eur, quote.known_eur, messageLocale),
        bookingArea(b.pickup_area, b.locale),
        b.hotel ?? '',
        scheduleReview ? scheduleNotice[messageLocale] : '',
      ]
        .filter(Boolean)
        .join('\n');
      // A repeatable-read snapshot keeps prices, status, packages and settings from
      // one database version. Locks also prevent selected trips disappearing mid-save.
      const locked = await tx
        .select()
        .from(s.trips)
        .where(inArray(s.trips.id, bookedTripIds))
        .for('share');
      if (
        locked.length !== bookedTripIds.length ||
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
            [
              b.end_date
                ? staffBookingCopy(cfg.OWNER_REPORT_LOCALE).stay +
                  ': ' +
                  bookingStay(b.start_date, b.end_date, cfg.OWNER_REPORT_LOCALE)
                : '',
              b.notes ?? '',
            ]
              .filter(Boolean)
              .join('\n') || null,
          estimateEur: estimate === null ? null : String(estimate),
          ipHash,
          userAgent: userAgent.slice(0, 300),
          internalNote: scheduleReview ? storedScheduleNotice : null,
        })
        .returning();
      await tx.insert(s.bookingRequestItems).values(
        selected.map(({ trip, details, snapshot }) => ({
          requestId: request!.id,
          tripId: trip.id,
          dayIndex: details.day_index,
          priceSnapshot: snapshot,
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
      const confirmation = {
        ref,
        estimate_eur: estimate,
        whatsapp_url:
          'https://wa.me/' +
          contacts.whatsapp_primary.replace(/\D/g, '') +
          '?text=' +
          encodeURIComponent(message),
        message,
      };
      if (submission)
        await tx.insert(s.bookingRequestReceipts).values({
          submissionId: submission.id,
          payloadHash: submission.hash,
          requestId: request!.id,
          confirmation,
        });
      return confirmation;
    },
    { isolationLevel: 'repeatable read' },
  );
}
