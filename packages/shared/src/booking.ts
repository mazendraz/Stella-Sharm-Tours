import { z } from 'zod';
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
// Inclusive number of days between two ISO dates (14 → 17 Nov = 4 days).
export function stayDays(start: string, end: string) {
  return (
    Math.round(
      (Date.parse(end + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) /
        86400000,
    ) + 1
  );
}
export const bookingSchema = z
  .object({
    mode: z.enum(['single', 'multi']),
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
    start_date: z.iso
      .date()
      .refine((v) => v >= cairoDate() && v <= maxBookingDate(), 'date'),
    // Optional last day of the guest's stay (inclusive), from the calendar.
    end_date: z.iso.date().optional(),
    // false = the guest removed the automatic rest day after overnight trips.
    rest_days: z.boolean().optional(),
    adults: z.number().int().min(1).max(60),
    children: z.number().int().min(0).max(40),
    child_ages: z.array(z.number().int().min(0).max(17)).max(40).optional(),
    format: z.enum(['group', 'private']),
    pickup_area: z.string().trim().min(1).max(100),
    hotel: z.string().trim().max(150).optional(),
    name: z.string().trim().min(1).max(80),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
    email: z.union([z.email().max(254), z.literal('')]).optional(),
    notes: z.string().trim().max(1000).optional(),
    locale: z.string().min(2).max(16),
    hp: z.literal(''),
    t: z.number().int().positive(),
  })
  .strict()
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
export type Booking = z.infer<typeof bookingSchema>;
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
