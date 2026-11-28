import { displayCurrencies } from './display-currency';
import { z } from 'zod';
import { priceSchema } from './public-contract';
export { requiresPrivateRequest } from './days';

export function cairoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function maxBookingDate(now = new Date()) {
  const date = new Date(cairoDate(now) + 'T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + 18);
  return date.toISOString().slice(0, 10);
}
export function addCalendarDays(date: string, days: number) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function minBookingDate(now = new Date(), daysAhead = 1) {
  return addCalendarDays(cairoDate(now), Math.max(1, daysAhead));
}
// Inclusive number of days between two ISO dates (14 → 17 Nov = 4 days).
export function stayDays(start: string, end: string) {
  return (
    Math.round(
      (Date.parse(end + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) /
        86400000,
    ) + 1
  );
}
const quoteId = z.string().regex(/^[a-f0-9]{64}$/);
const submissionId = z.string().regex(/^[a-f0-9]{64}$/);
export function bookingStartDateIsValid(date: string) {
  const now = new Date();
  return date >= minBookingDate(now) && date <= maxBookingDate(now);
}
const quoteFields = z
  .object({
    items: z
      .array(
        z
          .object({
            trip_slug: z
              .string()
              .regex(/^[a-z0-9-]+$/)
              .max(120),
            day_index: z.number().int().min(1).max(120).optional(),
            price_id: z.string().max(100).optional(),
            hours: z.number().int().min(1).max(24).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(38),
    start_date: z.iso.date(),
    // false = the guest removed the automatic rest day after overnight trips.
    rest_days: z.boolean().optional(),
    preserve_order: z.boolean().optional(),
    adults: z.number().int().min(1).max(60),
    children: z.number().int().min(0).max(40),
    format: z.enum(['group', 'private']),
    locale: z.string().min(2).max(16),
  })
  .strict();
export const quoteInputSchema = quoteFields.extend({
  start_date: z.iso.date().refine(bookingStartDateIsValid, 'date'),
});

export const quoteSchema = z.object({
  quote_id: quoteId,
  estimate_eur: z.number().int().nonnegative().nullable(),
  known_eur: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        trip_slug: z.string(),
        day_index: z.number().int().positive(),
        service_date: z.iso.date(),
        service_end_date: z.iso.date(),
        amount_eur: z.number().int().nonnegative().nullable(),
        selected_price_id: z.string().nullable(),
        price_options: z.array(priceSchema),
      }),
    )
    .min(1)
    .max(38),
});
export const quoteChangedSchema = z.object({
  error: z.object({ code: z.literal('QUOTE_CHANGED') }),
  quote: quoteSchema,
});
export type Quote = z.infer<typeof quoteSchema>;
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const bookingPayloadSchema = quoteFields
  .extend({
    mode: z.enum(['single', 'multi']),
    quote_id: quoteId.optional(),
    submission_id: submissionId.optional(),
    // Optional last day of the guest's stay (inclusive), from the calendar.
    end_date: z.iso.date().optional(),
    child_ages: z.array(z.number().int().min(0).max(17)).max(40).optional(),
    pickup_area: z.string().trim().min(1).max(100),
    hotel: z.string().trim().max(150).optional(),
    name: z.string().trim().min(1).max(80),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
    email: z.union([z.email().max(254), z.literal('')]).optional(),
    notes: z.string().trim().max(1000).optional(),
    // The sign the customer saw next to the prices (display only; amounts are
    // the same number in every currency).
    currency: z.enum(displayCurrencies).optional(),
    hp: z.literal(''),
    t: z.number().int().positive(),
  })
  .superRefine((v, ctx) => {
    if (v.end_date) {
      const days = stayDays(v.start_date, v.end_date);
      if (days < 1 || days > 90)
        ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'date' });
    }
    if (v.child_ages && v.child_ages.length > v.children)
      ctx.addIssue({
        code: 'custom',
        path: ['child_ages'],
        message: 'children',
      });
  });
export const bookingSchema = bookingPayloadSchema.refine(
  (value) => bookingStartDateIsValid(value.start_date),
  { path: ['start_date'], message: 'date' },
);
export type Booking = z.infer<typeof bookingSchema>;
export function submissionDetails({
  t: _openedAt,
  submission_id: _id,
  ...details
}: Booking) {
  return details;
}
export const confirmationSchema = z.object({
  ref: z.string().regex(/^STL-[A-Z0-9]+$/),
  estimate_eur: z.number().nullable(),
  whatsapp_url: z.url().refine((v) => {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === 'wa.me';
  }),
  message: z.string(),
});
export type Confirmation = z.infer<typeof confirmationSchema>;
