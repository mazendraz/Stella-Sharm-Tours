import { storyPatch } from '@stella/shared/story';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  basicsSchema,
  scheduleSchema,
  seoSchema,
  itinerarySchema,
  itemsSchema,
  collectionEditSchema,
} from '@stella/shared/admin';
export async function applyPreviewDrafts(
  db: Pick<Database, 'select'>,
  options: { previewTrip?: string; previewCollection?: string },
  data: {
    collections: (typeof s.collections.$inferSelect)[];
    trips: (typeof s.trips.$inferSelect)[];
    itinerary: (typeof s.tripItinerary.$inferSelect)[];
    items: (typeof s.tripItems.$inferSelect)[];
    media: (typeof s.tripMedia.$inferSelect)[];
  },
) {
  if (!options.previewTrip && !options.previewCollection) return;
  const collection = data.collections.find(
      (c) => c.slug === options.previewCollection,
    ),
    ids = data.trips
      .filter(
        (t) =>
          t.slug === options.previewTrip || t.collectionId === collection?.id,
      )
      .map((t) => t.id);
  if (collection) {
    const [draft] = await db
      .select()
      .from(s.contentDrafts)
      .where(
        and(
          eq(s.contentDrafts.entity, 'collection'),
          eq(s.contentDrafts.entityId, collection.id),
        ),
      );
    if (draft)
      Object.assign(collection, collectionEditSchema.parse(draft.data));
  }
  if (!ids.length) return;
  const rows = await db
    .select()
    .from(s.contentDrafts)
    .where(
      and(
        eq(s.contentDrafts.entity, 'trip'),
        inArray(s.contentDrafts.entityId, ids),
      ),
    );
  for (const row of rows) {
    const trip = data.trips.find((t) => t.id === row.entityId);
    if (!trip) continue;
    if (row.section === 'basics') {
      const b = basicsSchema.parse(row.data);
      Object.assign(trip, {
        ...b,
        ...(b.privateSurchargePct !== undefined
          ? {
              privateSurchargePct:
                b.privateSurchargePct === null
                  ? null
                  : String(b.privateSurchargePct),
            }
          : {}),
      });
    } else if (row.section === 'story')
      Object.assign(trip, storyPatch.parse(row.data));
    else if (row.section === 'schedule')
      Object.assign(trip, scheduleSchema.parse(row.data));
    else if (row.section === 'seo')
      Object.assign(trip, seoSchema.parse(row.data));
    else if (row.section === 'itinerary') {
      const rows = itinerarySchema.parse(row.data).rows;
      data.itinerary.splice(
        0,
        data.itinerary.length,
        ...data.itinerary.filter((r) => r.tripId !== trip.id),
        ...rows.map((r, sort) => ({
          id: randomUUID(),
          tripId: trip.id,
          timeLabel: r.timeLabel,
          text: r.text,
          sort,
        })),
      );
    } else if (row.section === 'items') {
      const rows = itemsSchema.parse(row.data).rows;
      data.items.splice(
        0,
        data.items.length,
        ...data.items.filter((r) => r.tripId !== trip.id),
        ...rows.map((r, sort) => ({
          id: randomUUID(),
          tripId: trip.id,
          type: r.type,
          text: r.text,
          extraPriceEur:
            r.extraPriceEur === undefined || r.extraPriceEur === null
              ? null
              : String(r.extraPriceEur),
          sort,
        })),
      );
    } else if (row.section === 'media') {
      const rows = z
        .strictObject({
          rows: z
            .array(
              z.strictObject({
                mediaId: z.uuid(),
                role: z.enum(['cover', 'gallery', 'video']),
              }),
            )
            .max(30),
        })
        .parse(row.data).rows;
      data.media.splice(
        0,
        data.media.length,
        ...data.media.filter((r) => r.tripId !== trip.id),
        ...rows.map((r, sort) => ({ ...r, tripId: trip.id, sort })),
      );
    }
  }
}
