/**
 * Verification Center: which business facts the owner has confirmed. These
 * answers are internal working notes. Nothing here is published; a confirmed
 * fact reaches the site only when staff enter it in the trip editor.
 */
import { z } from 'zod';

/** Asked for every tour (scripts/seo-tour-checklist.mjs asks the same). */
export const tripTopics = [
  'includes',
  'excludes',
  'fees',
  'pickup',
  'guideLanguages',
  'age',
  'accessibility',
  'safety',
  'documents',
  'bring',
  'cancellation',
] as const;
/** Site-wide approvals that block whole areas of content. */
export const siteTopics = [
  'legal',
  'cancellation',
  'guideLanguages',
  'pickup',
  'fees',
  'faq',
  'aiTraining',
  'licence',
] as const;
export const factStatuses = ['missing', 'to_confirm', 'verified'] as const;
export type FactStatus = (typeof factStatuses)[number];
export type TripTopic = (typeof tripTopics)[number];
export type SiteTopic = (typeof siteTopics)[number];

export const verificationInput = z
  .strictObject({
    tripId: z.uuid().nullable(),
    topic: z.string().regex(/^[a-zA-Z]{2,40}$/),
    status: z.enum(factStatuses),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.tripId === null
        ? (siteTopics as readonly string[]).includes(v.topic)
        : (tripTopics as readonly string[]).includes(v.topic),
    { path: ['topic'], message: 'Unknown topic' },
  );
export type VerificationInput = z.infer<typeof verificationInput>;

export type StoredFact = {
  tripId: string | null;
  topic: string;
  status: FactStatus;
  note: string | null;
  updatedAt: string;
};

/** Counts per status for one scope; unknown topics count as missing. */
export function factCounts(
  facts: StoredFact[],
  tripId: string | null,
  topics: readonly string[],
) {
  const byTopic = new Map(
    facts.filter((f) => f.tripId === tripId).map((f) => [f.topic, f.status]),
  );
  const counts: Record<FactStatus, number> = {
    missing: 0,
    to_confirm: 0,
    verified: 0,
  };
  for (const topic of topics) counts[byTopic.get(topic) ?? 'missing']++;
  return counts;
}
