import { z } from 'zod';

const isoDate = z.iso.date();
/** What the guest sent, kept with the confirmation so the summary can be
 * shown again on the confirmation page. Text only, never re-sent. */
export const requestSummarySchema = z.object({
  name: z.string().max(80),
  start: isoDate,
  end: isoDate,
  adults: z.number().int().min(1).max(60),
  children: z.number().int().min(0).max(40),
  format: z.enum(['group', 'private']),
  area: z.string().max(100),
  hotel: z.string().max(150),
  items: z
    .array(
      z.object({
        title: z.string().max(200),
        start: isoDate,
        end: isoDate,
        amount: z.number().int().nonnegative().nullable(),
      }),
    )
    .min(1)
    .max(38),
  known: z.number().int().nonnegative(),
  estimate: z.number().int().nonnegative().nullable(),
});
export type RequestSummary = z.infer<typeof requestSummarySchema>;
