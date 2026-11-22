import { storyPatch } from '@stella/shared/story';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  basicsSchema,
  scheduleSchema,
  seoSchema,
  priceRowSchema,
  localizedSchema,
} from '@stella/shared/admin';
import { fail } from './errors';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const obj = (v: unknown) => z.record(z.string(), z.unknown()).parse(v);
const pick = (schema: z.ZodObject, row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(schema.shape)
      .filter((k) => k in row)
      .map((k) => [k, row[k]]),
  );
export async function restorePublication(
  tx: Transaction,
  id: string,
  value: Record<string, unknown>,
  confirmLargeChange: boolean,
) {
  const row = obj(value.trip),
    basics = basicsSchema.parse({
      ...pick(basicsSchema, row),
      privateSurchargePct:
        row.privateSurchargePct === null
          ? null
          : Number(row.privateSurchargePct),
    }),
    schedule = scheduleSchema.parse(pick(scheduleSchema, row)),
    seo = seoSchema.parse(pick(seoSchema, row));
  const prices = z
    .array(priceRowSchema.extend({ sort: z.number().int() }))
    .parse(
      z
        .array(z.unknown())
        .parse(value.prices)
        .map((v) => {
          const p = obj(v);
          return {
            ...pick(priceRowSchema, p),
            sort: p.sort,
            amountEur: p.amountEur === null ? null : Number(p.amountEur),
          };
        }),
    );
  const current = await tx
    .select()
    .from(s.tripPrices)
    .where(eq(s.tripPrices.tripId, id));
  if (
    !confirmLargeChange &&
    prices.some((p) => {
      if (p.amountEur === null) return false;
      const old =
        current.find((c) => c.id === p.id) ??
        current.find((c) => c.isPrimary === p.isPrimary && c.unit === p.unit);
      return !old || old.amountEur === null
        ? true
        : Number(old.amountEur) === 0
          ? p.amountEur !== 0
          : Math.abs(p.amountEur - Number(old.amountEur)) /
              Number(old.amountEur) >
            0.4;
    })
  )
    fail(409, 'PRICE_CONFIRMATION_REQUIRED');
  await tx
    .update(s.trips)
    .set({
      ...basics,
      ...storyPatch.parse({ story: row.story ?? null }),
      ...schedule,
      ...seo,
      privateSurchargePct:
        basics.privateSurchargePct === null
          ? null
          : String(basics.privateSurchargePct),
      status: z.enum(['draft', 'published', 'hidden']).parse(row.status),
      updatedAt: new Date(),
    })
    .where(eq(s.trips.id, id));
  await tx.delete(s.tripPrices).where(eq(s.tripPrices.tripId, id));
  if (prices.length)
    await tx.insert(s.tripPrices).values(
      prices.map((p) => ({
        ...p,
        tripId: id,
        amountEur: p.amountEur === null ? null : String(p.amountEur),
      })),
    );
  await tx.delete(s.tripItinerary).where(eq(s.tripItinerary.tripId, id));
  for (const v of z.array(z.unknown()).parse(value.itinerary)) {
    const p = obj(v);
    await tx.insert(s.tripItinerary).values({
      id: z.uuid().parse(p.id),
      tripId: id,
      text: localizedSchema.parse(p.text),
      timeLabel: z.string().nullable().parse(p.timeLabel),
      sort: z.number().int().parse(p.sort),
    });
  }
  await tx.delete(s.tripItems).where(eq(s.tripItems.tripId, id));
  for (const v of z.array(z.unknown()).parse(value.items)) {
    const p = obj(v);
    await tx.insert(s.tripItems).values({
      id: z.uuid().parse(p.id),
      tripId: id,
      text: localizedSchema.parse(p.text),
      type: z
        .enum(['include', 'exclude', 'optional', 'bring', 'highlight'])
        .parse(p.type),
      extraPriceEur: p.extraPriceEur === null ? null : String(p.extraPriceEur),
      sort: z.number().int().parse(p.sort),
    });
  }
  await tx.delete(s.tripMedia).where(eq(s.tripMedia.tripId, id));
  for (const v of z.array(z.unknown()).parse(value.media)) {
    const p = obj(v);
    await tx.insert(s.tripMedia).values({
      tripId: id,
      mediaId: z.uuid().parse(p.mediaId),
      role: z.enum(['cover', 'gallery', 'video']).parse(p.role),
      sort: z.number().int().parse(p.sort),
    });
  }
  await tx
    .delete(s.contentDrafts)
    .where(
      and(eq(s.contentDrafts.entity, 'trip'), eq(s.contentDrafts.entityId, id)),
    );
  for (const v of z.array(z.unknown()).parse(value.drafts)) {
    const p = obj(v);
    await tx.insert(s.contentDrafts).values({
      entity: 'trip',
      entityId: id,
      section: z.string().max(80).parse(p.section),
      data: p.data,
      createdBy: z.uuid().parse(p.createdBy),
    });
  }
}
