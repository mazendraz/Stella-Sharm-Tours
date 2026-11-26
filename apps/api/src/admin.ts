import { randomUUID } from 'node:crypto';
import {
  and,
  eq,
  inArray,
  isNull,
  isNotNull,
  ilike,
  or,
  desc,
  sql,
  getTableColumns,
} from 'drizzle-orm';
import { z } from 'zod';
import type { Hono, Context } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  basicsSchema,
  createTripSchema,
  scheduleSchema,
  seoSchema,
  pricesSchema,
  itinerarySchema,
  itemsSchema,
  requestPatchSchema,
  reorderSchema,
  heroSchema,
  collectionEditSchema,
  mediaPatchSchema,
  localizedSchema,
  internalPath,
  can,
  privacyRequestSchema,
  eraseRequestSchema,
} from '@stella/shared/admin';
import { csvCell } from '@stella/shared/csv';
import { eraseRequests, erasureHash } from './privacy';
import type { ApiEnv } from './types';
import type { Config } from './config';
import { authService, clientIp, signPurpose } from './auth';
import { requestExportQuery } from './admin-contracts';
import { requireCoreCopy } from './publication-languages';
import { hashPrivate } from './requests';
import { fail } from './errors';
import { storyPatch } from '@stella/shared/story';
import { upload } from './media';
import { readSettings } from './catalog';
import { registerMore } from './admin-more';
import { registerArchive } from './admin-archive';
import { recordHumanFields } from './translation-records';
import { serveProcessed } from './serve-media';
import { inside } from './media';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** List extras for admin tables: cover thumbnail, main price, package parts. */
export const tripListExtras = {
  coverMediaId: sql<
    string | null
  >`(select tm.media_id from trip_media tm where tm.trip_id=trips.id and tm.role='cover' order by tm.sort limit 1)`,
  // Images (not videos) attached to the trip in any role.
  photoCount: sql<number>`(select count(*)::int from trip_media tm join media m on m.id=tm.media_id where tm.trip_id=trips.id and m.kind='image')`,
  primaryAmountEur: sql<
    string | null
  >`(select tp.amount_eur from trip_prices tp where tp.trip_id=trips.id and tp.is_primary limit 1)`,
  primaryUnit: sql<
    string | null
  >`(select tp.unit from trip_prices tp where tp.trip_id=trips.id and tp.is_primary limit 1)`,
  partsCount: sql<number>`(select count(*)::int from package_items pi where pi.package_id=trips.id)`,
  partsSum: sql<
    string | null
  >`(select sum(p.amount_eur) from package_items pi join trip_prices p on p.trip_id=pi.trip_id and p.is_primary where pi.package_id=trips.id)`,
  machineLocales: sql<
    string[]
  >`(select coalesce(jsonb_agg(distinct ct.locale), '[]'::jsonb) from content_translations ct where ct.entity='trip' and ct.entity_id=trips.id::text and ct.field in ('title','summary','description'))`,
  partsOnRequest: sql<boolean>`exists(select 1 from package_items pi left join trip_prices p on p.trip_id=pi.trip_id and p.is_primary where pi.package_id=trips.id and p.amount_eur is null)`,
};
type Auth = ReturnType<typeof authService>;
const uuid = (value: string | undefined) => {
  if (!z.uuid().safeParse(value).success) fail(422, 'INVALID_ID');
  return value!;
};
const serialize = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
function pick(schema: z.ZodObject, source: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(schema.shape)
      .filter((k) => k in source)
      .map((k) => [k, source[k]]),
  );
}
const dataObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function tripChanges(
  section: string,
  value: unknown,
): {
  [K in keyof typeof s.trips.$inferInsert]?:
    (typeof s.trips.$inferInsert)[K] | undefined;
} {
  if (section === 'schedule') return scheduleSchema.parse(value);
  if (section === 'seo') return seoSchema.parse(value);
  const b = basicsSchema.parse(value);
  return {
    ...b,
    privateSurchargePct:
      b.privateSurchargePct === null
        ? null
        : b.privateSurchargePct === undefined
          ? undefined
          : String(b.privateSurchargePct),
  };
}
export async function recordChange(
  tx: Transaction,
  c: Context<ApiEnv>,
  cfg: Config,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
  action = 'update',
  tags: string[] = ['site', 'collections'],
) {
  // A save that changes nothing must not create revisions or audit rows.
  const prior = dataObject(before),
    comparable =
      prior.section && prior.values && dataObject(after)
        ? Object.fromEntries(
            Object.keys(dataObject(after)).map((key) => [
              key,
              dataObject(prior.values)[key],
            ]),
          )
        : before;
  const norm = (v: unknown) =>
    JSON.stringify(serialize(v), (_, x) =>
      typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x,
    );
  if (action === 'update' && norm(comparable) === norm(after)) return;
  const [revision] = await tx
    .insert(s.revisions)
    .values({
      entity,
      entityId,
      snapshot: before === null ? sql`'null'::jsonb` : serialize(before),
      createdBy: c.get('principal').id,
    })
    .returning({ id: s.revisions.id });
  c.set('revisionIds', [...(c.get('revisionIds') ?? []), String(revision!.id)]);
  await tx.insert(s.auditLog).values({
    userId: c.get('principal').id,
    action,
    entity,
    entityId,
    before: serialize(before),
    after: serialize(after),
    ipHash: hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
  });
  if (tags.length)
    await tx
      .insert(s.outbox)
      .values({ name: 'revalidate.web', data: { tags } });
  if (action === 'bulk_prices') return;
  let current: unknown = after,
    previous: unknown = before,
    translationId = entityId;
  if (entity === 'trip') {
    current = (
      await tx.select().from(s.trips).where(eq(s.trips.id, entityId))
    )[0];
    previous = dataObject(before).values ?? dataObject(before).trip ?? before;
    if (dataObject(before).values) {
      const values = dataObject(dataObject(before).values);
      current = Object.fromEntries(
        Object.keys(values).map((key) => [key, dataObject(current)[key]]),
      );
    }
  } else if (entity === 'collection')
    current = (
      await tx
        .select()
        .from(s.collections)
        .where(eq(s.collections.id, entityId))
    )[0];
  else if (entity === 'hero_slide')
    current = (
      await tx.select().from(s.heroSlides).where(eq(s.heroSlides.id, entityId))
    )[0];
  else if (entity === 'faq')
    current = (
      await tx.select().from(s.faqs).where(eq(s.faqs.id, entityId))
    )[0];
  else if (entity === 'media') {
    current = { alt: dataObject(after).alt };
    previous = { alt: dataObject(before).alt };
  } else if (entity === 'settings') {
    translationId = String(dataObject(after).key ?? dataObject(before).key);
    current = dataObject(after).value;
    previous = dataObject(before).value;
  }
  if (
    ['trip', 'collection', 'hero_slide', 'faq', 'media', 'settings'].includes(
      entity,
    )
  ) {
    await recordHumanFields(
      tx,
      entity,
      translationId,
      current,
      previous,
      entity === 'settings' &&
        ['address', 'hours', 'legal_entity'].includes(translationId)
        ? 'value'
        : '',
    );
    if (entity === 'trip' && dataObject(before).section === 'publication') {
      for (const [table, childEntity, key] of [
        [s.tripPrices, 'trip_price', 'prices'],
        [s.tripItinerary, 'itinerary', 'itinerary'],
        [s.tripItems, 'trip_item', 'items'],
      ] as const) {
        const rows = await tx
            .select()
            .from(table)
            .where(eq(table.tripId, entityId)),
          old = dataObject(before)[key];
        for (const row of rows)
          await recordHumanFields(
            tx,
            childEntity,
            row.id,
            row,
            Array.isArray(old)
              ? old.find((r) => dataObject(r).id === row.id)
              : undefined,
          );
      }
      await tx
        .insert(s.outbox)
        .values({ name: 'i18n.refresh_stale', data: {} });
    }
    await tx.insert(s.outbox).values({
      name: 'i18n.translate_entity',
      data: { entity, id: translationId },
    });
  } else if (['trip_prices', 'trip_items', 'trip_itinerary'].includes(entity)) {
    const table =
      entity === 'trip_prices'
        ? s.tripPrices
        : entity === 'trip_items'
          ? s.tripItems
          : s.tripItinerary;
    const rows = await tx
      .select()
      .from(table)
      .where(eq(table.tripId, entityId));
    for (const row of rows)
      await recordHumanFields(
        tx,
        entity === 'trip_prices'
          ? 'trip_price'
          : entity === 'trip_items'
            ? 'trip_item'
            : 'itinerary',
        row.id,
        row,
        Array.isArray(before)
          ? before.find((r) => dataObject(r).id === row.id)
          : undefined,
      );
    await tx.insert(s.outbox).values({ name: 'i18n.refresh_stale', data: {} });
  } else if (entity === 'page_blocks')
    await tx.insert(s.outbox).values({ name: 'i18n.refresh_stale', data: {} });
}
export async function usableMedia(
  db: Pick<Database, 'select'>,
  ids: (string | null | undefined)[],
) {
  for (const id of ids) {
    if (!id) continue;
    const [m] = await db.select().from(s.media).where(eq(s.media.id, id));
    // Name the file and the reason so the admin can say exactly what to fix.
    const reason = !m
      ? 'missing'
      : m.archivedAt
        ? 'archived'
        : m.status !== 'ready'
          ? 'not_ready'
          : m.rightsStatus === 'unknown'
            ? 'unknown_rights'
            : null;
    if (reason) fail(422, 'MEDIA_NOT_PUBLISHABLE', { mediaId: id, reason });
  }
}
async function validateLiveHero(
  tx: Transaction,
  slide: typeof s.heroSlides.$inferSelect,
) {
  if (!slide.videoMediaId && !slide.imageMediaId) fail(422, 'MEDIA_REQUIRED');
  await usableMedia(tx, [slide.videoMediaId, slide.imageMediaId]);
  const [collection] = slide.collectionId
    ? await tx
        .select()
        .from(s.collections)
        .where(
          and(
            eq(s.collections.id, slide.collectionId),
            eq(s.collections.status, 'published'),
            isNull(s.collections.archivedAt),
          ),
        )
    : [];
  if (!(slide.headline ?? collection?.headline ?? collection?.name)?.en?.trim())
    fail(422, 'HEADLINE_REQUIRED');
  await requireCoreCopy(tx, [
    {
      entity: 'hero_slide',
      id: slide.id,
      copy: {
        headline: slide.headline,
        kicker: slide.kicker,
        subline: slide.subline,
        ctaLabel: slide.ctaLabel,
      },
    },
  ]);
  if (slide.startsAt && slide.endsAt && slide.endsAt <= slide.startsAt)
    fail(422, 'INVALID_INPUT');
  const target = slide.ctaTarget?.trim();
  if (slide.ctaType === 'collection' && !target && !collection)
    fail(422, 'INVALID_INPUT');
  if (slide.ctaType === 'collection' && target && target !== collection?.slug) {
    const [linked] = await tx
      .select({ id: s.collections.id })
      .from(s.collections)
      .where(
        and(
          eq(s.collections.slug, target),
          eq(s.collections.status, 'published'),
          isNull(s.collections.archivedAt),
        ),
      );
    if (!linked) fail(422, 'INVALID_INPUT');
  }
  if (slide.ctaType === 'trip' || slide.ctaType === 'package') {
    const [linked] = target
      ? await tx
          .select({ id: s.trips.id })
          .from(s.trips)
          .where(
            and(
              eq(s.trips.slug, target),
              eq(s.trips.kind, slide.ctaType),
              eq(s.trips.status, 'published'),
              isNull(s.trips.archivedAt),
            ),
          )
      : [];
    if (!linked) fail(422, 'INVALID_INPUT');
  }
  if (
    slide.ctaType === 'page' &&
    ![
      '/contact',
      '/faq',
      '/legal/terms',
      '/legal/privacy',
      '/legal/cancellation',
    ].includes(target ?? '')
  )
    fail(422, 'INVALID_INPUT');
}
export async function canPublishTrip(tx: Transaction, id: string) {
  const [trip] = await tx.select().from(s.trips).where(eq(s.trips.id, id));
  if (!trip || trip.archivedAt || !trip.title.en.trim())
    fail(422, 'TRIP_NOT_PUBLISHABLE');
  if (trip.story) {
    const empty = trip.story.scenes.find((scene) => !scene.mediaId);
    if (empty)
      fail(422, 'MEDIA_NOT_PUBLISHABLE', {
        mediaId: null,
        reason: 'no_media',
        sceneId: empty.id,
      });
    await usableMedia(tx, [
      ...new Set(trip.story.scenes.map((scene) => scene.mediaId)),
    ]);
    await requireCoreCopy(tx, [
      { entity: 'trip', id, copy: { story: trip.story } },
    ]);
  }
  const items = await tx
    .select()
    .from(s.tripItems)
    .where(eq(s.tripItems.tripId, id));
  const stops = await tx
    .select()
    .from(s.tripItinerary)
    .where(eq(s.tripItinerary.tripId, id));
  const prices = await tx
    .select()
    .from(s.tripPrices)
    .where(eq(s.tripPrices.tripId, id));
  await requireCoreCopy(tx, [
    {
      entity: 'trip',
      id,
      copy: {
        title: trip.title,
        summary: trip.summary,
        description: trip.description,
        daysLabel: trip.daysLabel,
        durationLabel: trip.durationLabel,
        departureLabel: trip.departureLabel
          ? { en: trip.departureLabel }
          : null,
        returnLabel: trip.returnLabel ? { en: trip.returnLabel } : null,
        notes: trip.notes,
        seoTitle: trip.seoTitle,
        seoDescription: trip.seoDescription,
      },
    },
    ...items.map((row) => ({
      entity: 'trip_item',
      id: row.id,
      copy: { text: row.text },
    })),
    ...stops.map((row) => ({
      entity: 'itinerary',
      id: row.id,
      copy: {
        text: row.text,
        timeLabel: row.timeLabel ? { en: row.timeLabel } : null,
      },
    })),
    ...prices.map((row) => ({
      entity: 'trip_price',
      id: row.id,
      copy: { label: row.label },
    })),
  ]);
  const ms = await tx
    .select()
    .from(s.tripMedia)
    .where(eq(s.tripMedia.tripId, id));
  await usableMedia(
    tx,
    ms.map((m) => m.mediaId),
  );
  if (trip.kind === 'package') {
    const parts = await tx
      .select({ part: s.trips })
      .from(s.packageItems)
      .innerJoin(s.trips, eq(s.packageItems.tripId, s.trips.id))
      .where(eq(s.packageItems.packageId, id));
    if (
      !parts.length ||
      parts.some(
        (p) =>
          p.part.status !== 'published' ||
          p.part.archivedAt ||
          p.part.kind !== 'trip',
      )
    )
      fail(422, 'PACKAGE_NOT_PUBLISHABLE');
  }
}
export async function tripSnapshot(tx: Transaction, id: string) {
  const [trip] = await tx.select().from(s.trips).where(eq(s.trips.id, id));
  if (!trip) fail(404, 'NOT_FOUND');
  const prices = await tx
    .select()
    .from(s.tripPrices)
    .where(eq(s.tripPrices.tripId, id));
  const itinerary = await tx
    .select()
    .from(s.tripItinerary)
    .where(eq(s.tripItinerary.tripId, id));
  const items = await tx
    .select()
    .from(s.tripItems)
    .where(eq(s.tripItems.tripId, id));
  const media = await tx
    .select()
    .from(s.tripMedia)
    .where(eq(s.tripMedia.tripId, id));
  const drafts = await tx
    .select()
    .from(s.contentDrafts)
    .where(
      and(eq(s.contentDrafts.entity, 'trip'), eq(s.contentDrafts.entityId, id)),
    );
  return {
    section: 'publication',
    trip,
    prices,
    itinerary,
    items,
    media,
    drafts,
  };
}
/**
 * A LIKE pattern matching the text literally anywhere. Escapes the default
 * escape character (backslash) and the % and _ wildcards (audit SEC-09).
 */
export const containsPattern = (text: string) =>
  '%' + text.replace(/[\\%_]/g, (match) => '\\' + match) + '%';
export function registerAdmin(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: Auth,
) {
  const parse = auth.parse;
  app.use('/v1/admin/*', auth.guard());
  const paging = (c: Context<ApiEnv>) => {
    const parsed = z
      .strictObject({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        q: z.string().max(80).optional(),
        status: z
          .enum([
            'new',
            'contacted',
            'confirmed',
            'completed',
            'cancelled',
            'spam',
          ])
          .optional(),
        collection: z
          .string()
          .regex(/^[a-z0-9-]{1,120}$/)
          .optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        tripFrom: z.iso.date().optional(),
        tripTo: z.iso.date().optional(),
        assigned: z.union([z.uuid(), z.literal('none')]).optional(),
        archived: z.enum(['0', '1']).optional(),
      })
      .safeParse(c.req.query());
    if (!parsed.success) fail(422, 'INVALID_QUERY');
    return parsed.data;
  };
  const requestFields = {
    id: s.bookingRequests.id,
    ref: s.bookingRequests.ref,
    mode: s.bookingRequests.mode,
    locale: s.bookingRequests.locale,
    startDate: s.bookingRequests.startDate,
    adults: s.bookingRequests.adults,
    children: s.bookingRequests.children,
    childAges: s.bookingRequests.childAges,
    format: s.bookingRequests.format,
    pickupArea: s.bookingRequests.pickupArea,
    hotel: s.bookingRequests.hotel,
    name: s.bookingRequests.name,
    phone: s.bookingRequests.phone,
    email: s.bookingRequests.email,
    notes: s.bookingRequests.notes,
    estimateEur: s.bookingRequests.estimateEur,
    status: s.bookingRequests.status,
    assignedTo: s.bookingRequests.assignedTo,
    internalNote: s.bookingRequests.internalNote,
    createdAt: s.bookingRequests.createdAt,
    updatedAt: s.bookingRequests.updatedAt,
    anonymizedAt: s.bookingRequests.anonymizedAt,
  };
  app.post(
    '/v1/admin/privacy/requests/export',
    auth.guard('export'),
    async (c) => {
      auth.recent(c);
      const { phone } = await parse(c, privacyRequestSchema);
      const rows = await db.transaction(
        async (tx) => {
          const requests = await tx
            .select(requestFields)
            .from(s.bookingRequests)
            .where(eq(s.bookingRequests.phone, phone))
            .orderBy(desc(s.bookingRequests.createdAt))
            .limit(10001);
          if (requests.length > 10000) fail(413, 'EXPORT_TOO_LARGE');
          const items = requests.length
            ? await tx
                .select()
                .from(s.bookingRequestItems)
                .where(
                  inArray(
                    s.bookingRequestItems.requestId,
                    requests.map((r) => r.id),
                  ),
                )
            : [];
          const grouped = new Map<string, typeof items>();
          for (const item of items)
            grouped.set(item.requestId, [
              ...(grouped.get(item.requestId) ?? []),
              item,
            ]);
          return requests.map((r) => ({
            ...r,
            items: grouped.get(r.id) ?? [],
          }));
        },
        { isolationLevel: 'repeatable read' },
      );
      await db.insert(s.auditLog).values({
        userId: c.get('principal').id,
        action: 'privacy_export',
        entity: 'privacy',
        after: { count: rows.length },
      });
      c.header(
        'Content-Disposition',
        'attachment; filename="stella-customer-requests.json"',
      );
      return c.json({ exported_at: new Date().toISOString(), requests: rows });
    },
  );
  app.post(
    '/v1/admin/privacy/requests/erase',
    auth.guard('export'),
    async (c) => {
      auth.recent(c);
      const { phone } = await parse(c, eraseRequestSchema);
      const erased = await db.transaction(
        async (tx) => {
          const rows = await eraseRequests(
            tx,
            eq(s.bookingRequests.phone, phone),
          );
          // Record the erasure (keyed hash only) so it is re-applied if an
          // older backup is ever restored (audit SEC-10).
          const now = new Date();
          await tx
            .insert(s.privacyErasures)
            .values({
              phoneHash: erasureHash(phone, cfg.IP_HASH_SALT),
              erasedAt: now,
            })
            .onConflictDoUpdate({
              target: s.privacyErasures.phoneHash,
              set: { erasedAt: now },
            });
          await tx
            .delete(s.rateBuckets)
            .where(
              eq(
                s.rateBuckets.key,
                'request-phone:' + hashPrivate(phone, cfg.IP_HASH_SALT),
              ),
            );
          await tx.insert(s.auditLog).values({
            userId: c.get('principal').id,
            action: 'privacy_erase',
            entity: 'privacy',
            after: { count: rows.length },
          });
          return rows.length;
        },
        { isolationLevel: 'repeatable read' },
      );
      return c.json({ erased });
    },
  );
  // Trip dates are startDate + (dayIndex - 1): day_index is 1-based (public "My trip" builder).
  const requestFilters = (p: ReturnType<typeof paging>) => {
    const like = p.q ? containsPattern(p.q) : null;
    return and(
      p.status ? eq(s.bookingRequests.status, p.status) : undefined,
      like
        ? or(
            ilike(s.bookingRequests.name, like),
            ilike(s.bookingRequests.phone, like),
            ilike(s.bookingRequests.email, like),
            ilike(s.bookingRequests.ref, like),
            sql`exists(select 1 from booking_request_items i join trips t on t.id=i.trip_id where i.request_id=booking_requests.id and exists(select 1 from jsonb_each_text(t.title) v where v.value ilike ${like}))`,
          )
        : undefined,
      p.from
        ? sql`${s.bookingRequests.createdAt}>=(${p.from}::date::timestamp at time zone 'Africa/Cairo')`
        : undefined,
      p.to
        ? sql`${s.bookingRequests.createdAt}<((${p.to}::date+1)::timestamp at time zone 'Africa/Cairo')`
        : undefined,
      p.tripFrom || p.tripTo
        ? sql`exists(select 1 from booking_request_items i where ${and(
            sql`i.request_id=${s.bookingRequests.id}`,
            p.tripFrom
              ? sql`${s.bookingRequests.startDate}+(coalesce(i.day_index,1)-1)>=${p.tripFrom}::date`
              : undefined,
            p.tripTo
              ? sql`${s.bookingRequests.startDate}+(coalesce(i.day_index,1)-1)<=${p.tripTo}::date`
              : undefined,
          )})`
        : undefined,
      p.assigned === 'none'
        ? isNull(s.bookingRequests.assignedTo)
        : p.assigned
          ? eq(s.bookingRequests.assignedTo, p.assigned)
          : undefined,
    );
  };
  app.get('/v1/admin/requests/export.csv', auth.guard('export'), async (c) => {
    auth.recent(c);
    const parsed = requestExportQuery.safeParse(c.req.query());
    if (!parsed.success) fail(422, 'INVALID_QUERY');
    const { scope, ...filters } = parsed.data;
    if (scope === 'all' && Object.values(filters).some(Boolean))
      fail(422, 'INVALID_QUERY');
    const filter = requestFilters({ page: 1, ...filters });
    const userId = c.get('principal').id;
    const fields = {
      ref: s.bookingRequests.ref,
      name: s.bookingRequests.name,
      phone: s.bookingRequests.phone,
      email: s.bookingRequests.email,
      start_date: s.bookingRequests.startDate,
      adults: s.bookingRequests.adults,
      children: s.bookingRequests.children,
      status: s.bookingRequests.status,
    };
    const columns = Object.keys(fields) as (keyof typeof fields)[];
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    async function exportRows() {
      let count = 0;
      let complete = false;
      try {
        await db.transaction(
          async (tx) => {
            const batch = 500;
            let cursor: { id: string; timestamp: string } | undefined;
            await writer.write(
              encoder.encode('\uFEFF' + columns.join(',') + '\r\n'),
            );
            while (true) {
              const rows = await tx
                .select({
                  ...fields,
                  id: s.bookingRequests.id,
                  // Preserve PostgreSQL's sub-millisecond precision in the cursor.
                  timestamp: sql<string>`${s.bookingRequests.createdAt}::text`,
                })
                .from(s.bookingRequests)
                .where(
                  and(
                    filter,
                    cursor
                      ? sql`(${s.bookingRequests.createdAt}, ${s.bookingRequests.id}) < (${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)`
                      : undefined,
                  ),
                )
                .orderBy(
                  desc(s.bookingRequests.createdAt),
                  desc(s.bookingRequests.id),
                )
                .limit(batch);
              if (rows.length) {
                const chunk = rows
                  .map((row) =>
                    columns.map((column) => csvCell(row[column])).join(','),
                  )
                  .join('\r\n');
                await writer.write(encoder.encode(chunk + '\r\n'));
                count += rows.length;
              }
              if (rows.length < batch) break;
              cursor = rows.at(-1);
            }
          },
          { isolationLevel: 'repeatable read', accessMode: 'read only' },
        );
        complete = true;
      } finally {
        await db.insert(s.auditLog).values({
          userId,
          action: 'export',
          entity: 'request',
          after: { scope, count, complete },
        });
      }
    }
    void exportRows()
      .then(
        () => writer.close(),
        () => writer.abort(),
      )
      .catch(() => {});
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header(
      'Content-Disposition',
      'attachment; filename="stella-requests.csv"',
    );
    return c.body(readable);
  });
  app.get('/v1/admin/requests/counts', auth.guard('requests'), async (c) => {
    const p = paging(c);
    const rows = await db
      .select({
        status: s.bookingRequests.status,
        n: sql<number>`count(*)::int`,
      })
      .from(s.bookingRequests)
      .where(requestFilters(p))
      .groupBy(s.bookingRequests.status);
    const counts: Record<string, number> = {
      new: 0,
      contacted: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      spam: 0,
    };
    for (const row of rows) counts[row.status] = Number(row.n);
    counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
    return c.json(counts);
  });
  app.get('/v1/admin/requests', auth.guard('requests'), async (c) => {
    const p = paging(c);
    return c.json(
      await db
        .select({
          ...requestFields,
          tripTitles: sql<
            unknown[]
          >`coalesce((select jsonb_agg(t.title order by i.day_index) from booking_request_items i join trips t on t.id=i.trip_id where i.request_id=booking_requests.id), '[]'::jsonb)`,
          tripItems: sql<
            unknown[]
          >`coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'dayIndex', i.day_index) order by i.day_index) from booking_request_items i join trips t on t.id=i.trip_id where i.request_id=booking_requests.id), '[]'::jsonb)`,
        })
        .from(s.bookingRequests)
        .where(requestFilters(p))
        .orderBy(desc(s.bookingRequests.createdAt), desc(s.bookingRequests.id))
        .limit(50)
        .offset((p.page - 1) * 50),
    );
  });
  app.get('/v1/admin/requests/:id', auth.guard('requests'), async (c) => {
    const id = uuid(c.req.param('id')),
      [row] = await db
        .select(requestFields)
        .from(s.bookingRequests)
        .where(eq(s.bookingRequests.id, id));
    if (!row) fail(404, 'NOT_FOUND');
    return c.json({
      ...row,
      items: await db
        .select({
          requestId: s.bookingRequestItems.requestId,
          tripId: s.bookingRequestItems.tripId,
          dayIndex: s.bookingRequestItems.dayIndex,
          priceSnapshot: s.bookingRequestItems.priceSnapshot,
          title: s.trips.title,
        })
        .from(s.bookingRequestItems)
        .innerJoin(s.trips, eq(s.bookingRequestItems.tripId, s.trips.id))
        .where(eq(s.bookingRequestItems.requestId, id))
        .orderBy(s.bookingRequestItems.dayIndex),
    });
  });
  app.patch('/v1/admin/requests/:id', auth.guard('requests'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(c, requestPatchSchema);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.bookingRequests)
        .where(eq(s.bookingRequests.id, id))
        .for('update');
      if (!before) fail(404, 'NOT_FOUND');
      if (before.anonymizedAt) fail(409, 'REQUEST_ANONYMIZED');
      if (b.assignedTo) {
        const [user] = await tx
          .select()
          .from(s.adminUsers)
          .where(
            and(
              eq(s.adminUsers.id, b.assignedTo),
              isNull(s.adminUsers.disabledAt),
            ),
          );
        if (!user || !can(user.role, 'requests')) fail(422, 'INVALID_ASSIGNEE');
      }
      await tx
        .update(s.bookingRequests)
        .set({ ...b, updatedAt: new Date() })
        .where(eq(s.bookingRequests.id, id));
      const [revision] = await tx
        .insert(s.revisions)
        .values({
          entity: 'request',
          entityId: id,
          snapshot: pick(requestPatchSchema, before),
          createdBy: c.get('principal').id,
        })
        .returning({ id: s.revisions.id });
      c.set('revisionIds', [
        ...(c.get('revisionIds') ?? []),
        String(revision!.id),
      ]);
      await tx.insert(s.auditLog).values({
        userId: c.get('principal').id,
        action: 'update',
        entity: 'request',
        entityId: id,
        before: { status: before.status, assignedTo: before.assignedTo },
        after: {
          status: b.status ?? before.status,
          assignedTo: b.assignedTo ?? before.assignedTo,
        },
      });
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/trips', auth.guard('content'), async (c) => {
    const p = paging(c);
    return c.json(
      await db
        .select({
          ...getTableColumns(s.trips),
          ...tripListExtras,
        })
        .from(s.trips)
        .where(
          and(
            p.archived === '1'
              ? isNotNull(s.trips.archivedAt)
              : isNull(s.trips.archivedAt),
            p.q
              ? sql`${s.trips.title}->>'en' ilike ${containsPattern(p.q)}`
              : undefined,
            p.collection
              ? sql`${s.trips.collectionId} in (select id from collections where slug=${p.collection})`
              : undefined,
          ),
        )
        .orderBy(s.trips.sort, sql`${s.trips.title}->>'en'`)
        .limit(200)
        .offset((p.page - 1) * 200),
    );
  });
  app.post('/v1/admin/trips', auth.guard('content'), async (c) => {
    const b = await parse(c, createTripSchema);
    if (
      b.privateSurchargePct !== undefined &&
      !can(c.get('principal').role, 'prices')
    )
      fail(403, 'FORBIDDEN');
    const row = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.trips)
        .values({
          ...b,
          privateSurchargePct:
            b.privateSurchargePct === null
              ? null
              : b.privateSurchargePct === undefined
                ? undefined
                : String(b.privateSurchargePct),
          status: 'draft',
        })
        .returning();
      await recordChange(
        tx,
        c,
        cfg,
        'trip',
        row!.id,
        { section: 'archive', values: { archivedAt: new Date() } },
        row,
        'create',
      );
      return row!;
    });
    return c.json({ id: row!.id }, 201);
  });
  app.get('/v1/admin/trips/:id', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      [trip] = await db.select().from(s.trips).where(eq(s.trips.id, id));
    if (!trip) fail(404, 'NOT_FOUND');
    const [prices, itinerary, items, media, drafts] = await Promise.all([
      db.select().from(s.tripPrices).where(eq(s.tripPrices.tripId, id)),
      db.select().from(s.tripItinerary).where(eq(s.tripItinerary.tripId, id)),
      db.select().from(s.tripItems).where(eq(s.tripItems.tripId, id)),
      db.select().from(s.tripMedia).where(eq(s.tripMedia.tripId, id)),
      db
        .select()
        .from(s.contentDrafts)
        .where(
          and(
            eq(s.contentDrafts.entity, 'trip'),
            eq(s.contentDrafts.entityId, id),
          ),
        ),
    ]);
    return c.json({ trip, prices, itinerary, items, media, drafts });
  });
  app.patch('/v1/admin/trips/:id/story', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      data = await parse(c, storyPatch);
    await db.transaction(async (tx) => {
      const [trip] = await tx
        .select({ id: s.trips.id })
        .from(s.trips)
        .where(eq(s.trips.id, id))
        .for('update');
      if (!trip) fail(404, 'NOT_FOUND');
      await tx
        .insert(s.contentDrafts)
        .values({
          entity: 'trip',
          entityId: id,
          section: 'story',
          data,
          createdBy: c.get('principal').id,
        })
        .onConflictDoUpdate({
          target: [
            s.contentDrafts.entity,
            s.contentDrafts.entityId,
            s.contentDrafts.section,
          ],
          set: {
            data,
            createdBy: c.get('principal').id,
            updatedAt: new Date(),
          },
        });
    });
    return c.json({ ok: true, draft: true });
  });
  for (const [section, schema] of [
    ['basics', basicsSchema],
    ['schedule', scheduleSchema],
    ['seo', seoSchema],
  ] as const)
    app.patch(
      '/v1/admin/trips/:id/' + section,
      auth.guard('content'),
      async (c) => {
        const id = uuid(c.req.param('id')),
          b = await parse(c, schema);
        if (
          'privateSurchargePct' in b &&
          !can(c.get('principal').role, 'prices')
        )
          fail(403, 'FORBIDDEN');
        return c.json(
          await db.transaction(async (tx) => {
            const [before] = await tx
              .select()
              .from(s.trips)
              .where(eq(s.trips.id, id))
              .for('update');
            if (!before) fail(404, 'NOT_FOUND');
            if (
              c.get('principal').role === 'editor' &&
              before.status === 'published'
            ) {
              await tx
                .insert(s.contentDrafts)
                .values({
                  entity: 'trip',
                  entityId: id,
                  section,
                  data: b,
                  createdBy: c.get('principal').id,
                })
                .onConflictDoUpdate({
                  target: [
                    s.contentDrafts.entity,
                    s.contentDrafts.entityId,
                    s.contentDrafts.section,
                  ],
                  set: {
                    data: b,
                    createdBy: c.get('principal').id,
                    updatedAt: new Date(),
                  },
                });
              return { ok: true, draft: true };
            }
            const changes = tripChanges(section, b);
            if (before.status === 'published' && section !== 'schedule')
              await requireCoreCopy(tx, [{ entity: 'trip', id, copy: b }]);
            await tx
              .update(s.trips)
              .set({ ...changes, updatedAt: new Date() })
              .where(eq(s.trips.id, id));
            await recordChange(
              tx,
              c,
              cfg,
              'trip',
              id,
              { section, values: pick(schema, before) },
              b,
              'update',
              [
                'site',
                'collections',
                'trip:' + before.slug,
                'collection:' +
                  (
                    await tx
                      .select()
                      .from(s.collections)
                      .where(eq(s.collections.id, before.collectionId))
                  )[0]!.slug,
              ],
            );
            return { ok: true, draft: false };
          }),
        );
      },
    );
  app.put('/v1/admin/trips/:id/prices', auth.guard('prices'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(c, pricesSchema);
    await db.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(s.trips)
        .where(eq(s.trips.id, id))
        .for('update');
      if (!trip) fail(404, 'NOT_FOUND');
      const before = await tx
        .select()
        .from(s.tripPrices)
        .where(eq(s.tripPrices.tripId, id));
      for (const row of b.rows) {
        const existing = row.id ? before.find((p) => p.id === row.id) : null;
        if (row.id && !existing) fail(422, 'INVALID_PRICE_ID');
        const old =
          existing ??
          (row.isPrimary ? before.find((price) => price.isPrimary) : null);
        if (
          old?.amountEur !== null &&
          old?.amountEur !== undefined &&
          row.amountEur !== null &&
          (Number(old.amountEur) === 0
            ? row.amountEur !== 0
            : Math.abs(row.amountEur - Number(old.amountEur)) /
                Number(old.amountEur) >
              0.4) &&
          !b.confirmLargeChange
        )
          fail(409, 'PRICE_CONFIRMATION_REQUIRED');
      }
      await tx.delete(s.tripPrices).where(eq(s.tripPrices.tripId, id));
      await tx.insert(s.tripPrices).values(
        b.rows.map((row, sort) => ({
          ...row,
          tripId: id,
          sort,
          amountEur: row.amountEur === null ? null : String(row.amountEur),
        })),
      );
      await recordChange(
        tx,
        c,
        cfg,
        'trip_prices',
        id,
        before,
        b.rows,
        'prices',
        ['site', 'collections', 'trip:' + trip.slug],
      );
    });
    return c.json({ ok: true });
  });
  for (const section of ['itinerary', 'items'] as const)
    app.put(
      '/v1/admin/trips/:id/' + section,
      auth.guard('content'),
      async (c) => {
        const id = uuid(c.req.param('id'));
        const rows =
          section === 'itinerary'
            ? (await parse(c, itinerarySchema)).rows
            : (await parse(c, itemsSchema)).rows;
        await db.transaction(async (tx) => {
          const [trip] = await tx
            .select()
            .from(s.trips)
            .where(eq(s.trips.id, id))
            .for('update');
          if (!trip) fail(404, 'NOT_FOUND');
          const childTable =
            section === 'itinerary' ? s.tripItinerary : s.tripItems;
          const childRows = await tx
            .select()
            .from(childTable)
            .where(eq(childTable.tripId, id));
          if (
            rows.some(
              (r) => r.id && !childRows.some((old) => old.id === r.id),
            ) ||
            new Set(rows.filter((r) => r.id).map((r) => r.id)).size !==
              rows.filter((r) => r.id).length
          )
            fail(422, 'INVALID_CHILD_ID');
          rows.forEach((row, index) => {
            row.id ??=
              childRows.find((old) => old.sort === index)?.id ?? randomUUID();
          });
          if (
            c.get('principal').role === 'editor' &&
            trip.status === 'published'
          ) {
            await tx
              .insert(s.contentDrafts)
              .values({
                entity: 'trip',
                entityId: id,
                section,
                data: { rows },
                createdBy: c.get('principal').id,
              })
              .onConflictDoUpdate({
                target: [
                  s.contentDrafts.entity,
                  s.contentDrafts.entityId,
                  s.contentDrafts.section,
                ],
                set: { data: { rows }, updatedAt: new Date() },
              });
            return;
          }
          if (section === 'itinerary') {
            const data = itinerarySchema.parse({ rows }),
              before = await tx
                .select()
                .from(s.tripItinerary)
                .where(eq(s.tripItinerary.tripId, id));
            await tx
              .delete(s.tripItinerary)
              .where(eq(s.tripItinerary.tripId, id));
            if (data.rows.length)
              await tx
                .insert(s.tripItinerary)
                .values(
                  data.rows.map((r, sort) => ({ ...r, tripId: id, sort })),
                );
            await recordChange(
              tx,
              c,
              cfg,
              'trip_itinerary',
              id,
              before,
              data.rows,
              'update',
              ['trip:' + trip.slug],
            );
          } else {
            const data = itemsSchema.parse({ rows }),
              before = await tx
                .select()
                .from(s.tripItems)
                .where(eq(s.tripItems.tripId, id));
            await tx.delete(s.tripItems).where(eq(s.tripItems.tripId, id));
            if (data.rows.length)
              await tx.insert(s.tripItems).values(
                data.rows.map((r, sort) => ({
                  ...r,
                  extraPriceEur:
                    r.extraPriceEur === null
                      ? null
                      : r.extraPriceEur === undefined
                        ? undefined
                        : String(r.extraPriceEur),
                  tripId: id,
                  sort,
                })),
              );
            await recordChange(
              tx,
              c,
              cfg,
              'trip_items',
              id,
              before,
              data.rows,
              'update',
              ['trip:' + trip.slug],
            );
          }
        });
        return c.json({ ok: true });
      },
    );
  app.put('/v1/admin/trips/:id/media', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(
        c,
        z.strictObject({
          rows: z
            .array(
              z.strictObject({
                mediaId: z.uuid(),
                role: z.enum(['cover', 'gallery', 'video']),
              }),
            )
            .max(30),
        }),
      );
    await db.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(s.trips)
        .where(eq(s.trips.id, id))
        .for('update');
      if (!trip) fail(404, 'NOT_FOUND');
      if (trip.status === 'published')
        await usableMedia(
          tx,
          b.rows.map((r) => r.mediaId),
        );
      if (c.get('principal').role === 'editor' && trip.status === 'published') {
        await tx
          .insert(s.contentDrafts)
          .values({
            entity: 'trip',
            entityId: id,
            section: 'media',
            data: b,
            createdBy: c.get('principal').id,
          })
          .onConflictDoUpdate({
            target: [
              s.contentDrafts.entity,
              s.contentDrafts.entityId,
              s.contentDrafts.section,
            ],
            set: { data: b, updatedAt: new Date() },
          });
        return;
      }
      const before = await tx
        .select()
        .from(s.tripMedia)
        .where(eq(s.tripMedia.tripId, id));
      await tx.delete(s.tripMedia).where(eq(s.tripMedia.tripId, id));
      if (b.rows.length)
        await tx
          .insert(s.tripMedia)
          .values(b.rows.map((r, sort) => ({ ...r, tripId: id, sort })));
      await recordChange(
        tx,
        c,
        cfg,
        'trip_media',
        id,
        before,
        b.rows,
        'update',
        ['trip:' + trip.slug],
      );
    });
    return c.json({ ok: true });
  });
  for (const action of ['publish', 'unpublish'] as const)
    app.post(
      '/v1/admin/trips/:id/' + action,
      auth.guard('publish'),
      async (c) => {
        const id = uuid(c.req.param('id'));
        await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(s.trips)
            .where(eq(s.trips.id, id))
            .for('update');
          if (!before) fail(404, 'NOT_FOUND');
          const snapshot = await tripSnapshot(tx, id);
          if (action === 'publish') {
            const drafts = await tx
              .select()
              .from(s.contentDrafts)
              .where(
                and(
                  eq(s.contentDrafts.entity, 'trip'),
                  eq(s.contentDrafts.entityId, id),
                ),
              );
            for (const d of drafts) {
              if (
                d.section === 'basics' ||
                d.section === 'schedule' ||
                d.section === 'seo'
              ) {
                const schema =
                  d.section === 'basics'
                    ? basicsSchema
                    : d.section === 'schedule'
                      ? scheduleSchema
                      : seoSchema;
                const changes = schema.parse(d.data);
                await tx
                  .update(s.trips)
                  .set(tripChanges(d.section, changes))
                  .where(eq(s.trips.id, id));
              } else if (d.section === 'story') {
                await tx
                  .update(s.trips)
                  .set(storyPatch.parse(d.data))
                  .where(eq(s.trips.id, id));
              } else if (d.section === 'itinerary') {
                const data = itinerarySchema.parse(d.data);
                await tx
                  .delete(s.tripItinerary)
                  .where(eq(s.tripItinerary.tripId, id));
                if (data.rows.length)
                  await tx
                    .insert(s.tripItinerary)
                    .values(
                      data.rows.map((r, sort) => ({ ...r, tripId: id, sort })),
                    );
              } else if (d.section === 'items') {
                const data = itemsSchema.parse(d.data);
                await tx.delete(s.tripItems).where(eq(s.tripItems.tripId, id));
                if (data.rows.length)
                  await tx.insert(s.tripItems).values(
                    data.rows.map((r, sort) => ({
                      ...r,
                      tripId: id,
                      sort,
                      extraPriceEur:
                        r.extraPriceEur === undefined ||
                        r.extraPriceEur === null
                          ? null
                          : String(r.extraPriceEur),
                    })),
                  );
              } else if (d.section === 'media') {
                const data = z
                  .object({
                    rows: z.array(
                      z.object({
                        mediaId: z.uuid(),
                        role: z.enum(['cover', 'gallery', 'video']),
                      }),
                    ),
                  })
                  .parse(d.data);
                await tx.delete(s.tripMedia).where(eq(s.tripMedia.tripId, id));
                if (data.rows.length)
                  await tx
                    .insert(s.tripMedia)
                    .values(
                      data.rows.map((r, sort) => ({ ...r, tripId: id, sort })),
                    );
              }
            }
            await canPublishTrip(tx, id);
            await tx
              .delete(s.contentDrafts)
              .where(
                and(
                  eq(s.contentDrafts.entity, 'trip'),
                  eq(s.contentDrafts.entityId, id),
                ),
              );
          }
          await tx
            .update(s.trips)
            .set({
              status: action === 'publish' ? 'published' : 'hidden',
              updatedAt: new Date(),
            })
            .where(eq(s.trips.id, id));
          await recordChange(
            tx,
            c,
            cfg,
            'trip',
            id,
            snapshot,
            { status: action },
            action,
            ['site', 'collections', 'trip:' + before.slug],
          );
        });
        return c.json({ ok: true });
      },
    );
  app.post('/v1/admin/trips/reorder', auth.guard('content'), async (c) => {
    const b = await parse(c, reorderSchema);
    await db.transaction(async (tx) => {
      const before = await tx
        .select({ id: s.trips.id, sort: s.trips.sort })
        .from(s.trips)
        .where(inArray(s.trips.id, b.ids))
        .for('update');
      if (before.length !== b.ids.length) fail(422, 'INVALID_ORDER');
      for (const [sort, id] of b.ids.entries())
        await tx.update(s.trips).set({ sort }).where(eq(s.trips.id, id));
      await recordChange(
        tx,
        c,
        cfg,
        'trip_order',
        randomUUID(),
        before,
        b.ids,
        'reorder',
      );
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/collections', auth.guard('content'), async (c) =>
    c.json(
      await db
        .select()
        .from(s.collections)
        .where(
          c.req.query('archived') === '1'
            ? isNotNull(s.collections.archivedAt)
            : isNull(s.collections.archivedAt),
        )
        .orderBy(s.collections.sort),
    ),
  );
  app.patch('/v1/admin/collections/:id', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(c, collectionEditSchema);
    return c.json(
      await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(s.collections)
          .where(eq(s.collections.id, id))
          .for('update');
        if (!before) fail(404, 'NOT_FOUND');
        if (
          c.get('principal').role === 'editor' &&
          before.status === 'published'
        ) {
          await tx
            .insert(s.contentDrafts)
            .values({
              entity: 'collection',
              entityId: id,
              section: 'basics',
              data: b,
              createdBy: c.get('principal').id,
            })
            .onConflictDoUpdate({
              target: [
                s.contentDrafts.entity,
                s.contentDrafts.entityId,
                s.contentDrafts.section,
              ],
              set: { data: b, updatedAt: new Date() },
            });
          return { ok: true, draft: true };
        }
        if (before.status === 'published') {
          await usableMedia(tx, [b.coverMediaId, b.heroVideoId]);
          await requireCoreCopy(tx, [{ entity: 'collection', id, copy: b }]);
        }
        await tx
          .update(s.collections)
          .set({ ...b, updatedAt: new Date() })
          .where(eq(s.collections.id, id));
        await recordChange(tx, c, cfg, 'collection', id, before, b, 'update', [
          'collection:' + before.slug,
        ]);
        return { ok: true, draft: false };
      }),
    );
  });
  app.post(
    '/v1/admin/collections/reorder',
    auth.guard('publish'),
    async (c) => {
      const b = await parse(c, reorderSchema);
      await db.transaction(async (tx) => {
        const before = await tx.select().from(s.collections).for('update');
        if (
          before.length !== b.ids.length ||
          before.some((r) => !b.ids.includes(r.id))
        )
          fail(422, 'INVALID_ORDER');
        for (const [sort, id] of b.ids.entries())
          await tx
            .update(s.collections)
            .set({ sort })
            .where(eq(s.collections.id, id));
        await recordChange(
          tx,
          c,
          cfg,
          'collection_order',
          randomUUID(),
          before.map((r) => ({ id: r.id, sort: r.sort })),
          b.ids,
          'reorder',
        );
      });
      return c.json({ ok: true });
    },
  );
  app.get('/v1/admin/hero-slides', auth.guard('heroDraft'), async (c) =>
    c.json(
      await db
        .select()
        .from(s.heroSlides)
        .where(isNull(s.heroSlides.archivedAt))
        .orderBy(s.heroSlides.sort),
    ),
  );
  app.post('/v1/admin/hero-slides', auth.guard('heroDraft'), async (c) => {
    const b = await parse(c, heroSchema);
    if (!b.videoMediaId && !b.imageMediaId) fail(422, 'MEDIA_REQUIRED');
    const row = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.heroSlides)
        .values({
          ...b,
          startsAt: b.startsAt ? new Date(b.startsAt) : null,
          endsAt: b.endsAt ? new Date(b.endsAt) : null,
          status: 'draft',
        })
        .returning();
      await recordChange(
        tx,
        c,
        cfg,
        'hero_slide',
        row!.id,
        { ...row, archivedAt: new Date() },
        row,
        'create',
      );
      return row!;
    });
    return c.json({ id: row!.id }, 201);
  });
  app.patch('/v1/admin/hero-slides/:id', auth.guard('heroDraft'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(c, heroSchema);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.heroSlides)
        .where(eq(s.heroSlides.id, id))
        .for('update');
      if (!before) fail(404, 'NOT_FOUND');
      if (
        before.status === 'published' &&
        !can(c.get('principal').role, 'heroLive')
      )
        fail(403, 'DRAFT_ONLY');
      const changes = {
        ...b,
        startsAt:
          b.startsAt === undefined
            ? before.startsAt
            : b.startsAt === null
              ? null
              : new Date(b.startsAt),
        endsAt:
          b.endsAt === undefined
            ? before.endsAt
            : b.endsAt === null
              ? null
              : new Date(b.endsAt),
      };
      if (before.status === 'published') {
        const definedChanges = Object.fromEntries(
          Object.entries(changes).filter(([, value]) => value !== undefined),
        );
        await validateLiveHero(tx, { ...before, ...definedChanges });
      }
      await tx
        .update(s.heroSlides)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(s.heroSlides.id, id));
      await recordChange(tx, c, cfg, 'hero_slide', id, before, b);
    });
    return c.json({ ok: true });
  });
  for (const action of ['publish', 'unpublish'] as const)
    app.post(
      '/v1/admin/hero-slides/:id/' + action,
      auth.guard('heroLive'),
      async (c) => {
        const id = uuid(c.req.param('id'));
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext('hero-publish'))`,
          );
          const [before] = await tx
            .select()
            .from(s.heroSlides)
            .where(eq(s.heroSlides.id, id))
            .for('update');
          if (!before || before.archivedAt) fail(404, 'NOT_FOUND');
          if (action === 'publish') {
            const live = await tx
              .select()
              .from(s.heroSlides)
              .where(
                and(
                  eq(s.heroSlides.status, 'published'),
                  isNull(s.heroSlides.archivedAt),
                ),
              );
            if (before.status !== 'published' && live.length >= 10)
              fail(409, 'HERO_LIMIT');
            await validateLiveHero(tx, before);
          }
          await tx
            .update(s.heroSlides)
            .set({
              status: action === 'publish' ? 'published' : 'draft',
              updatedAt: new Date(),
            })
            .where(eq(s.heroSlides.id, id));
          await recordChange(
            tx,
            c,
            cfg,
            'hero_slide',
            id,
            before,
            { status: action },
            action,
          );
        });
        return c.json({ ok: true });
      },
    );
  app.post(
    '/v1/admin/hero-slides/reorder',
    auth.guard('heroLive'),
    async (c) => {
      const b = await parse(c, reorderSchema);
      await db.transaction(async (tx) => {
        const before = await tx
          .select()
          .from(s.heroSlides)
          .where(isNull(s.heroSlides.archivedAt))
          .for('update');
        if (
          before.length !== b.ids.length ||
          before.some((r) => !b.ids.includes(r.id))
        )
          fail(422, 'INVALID_ORDER');
        for (const [sort, id] of b.ids.entries())
          await tx
            .update(s.heroSlides)
            .set({ sort })
            .where(eq(s.heroSlides.id, id));
        await recordChange(
          tx,
          c,
          cfg,
          'hero_order',
          randomUUID(),
          before.map((r) => ({ id: r.id, sort: r.sort })),
          b.ids,
          'reorder',
        );
      });
      return c.json({ ok: true });
    },
  );
  app.delete('/v1/admin/hero-slides/:id', auth.guard('heroLive'), async (c) => {
    const id = uuid(c.req.param('id'));
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.heroSlides)
        .where(eq(s.heroSlides.id, id));
      if (!before) fail(404, 'NOT_FOUND');
      await tx
        .update(s.heroSlides)
        .set({ archivedAt: new Date(), status: 'draft' })
        .where(eq(s.heroSlides.id, id));
      await recordChange(tx, c, cfg, 'hero_slide', id, before, null, 'archive');
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/media', auth.guard('content'), async (c) => {
    const p = z
      .strictObject({
        filter: z.enum(['unused', 'unknown', 'image', 'video']).optional(),
        collection: z.uuid().optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .safeParse(c.req.query());
    if (!p.success) fail(422, 'INVALID_QUERY');
    return c.json(
      await db
        .select({
          id: s.media.id,
          kind: s.media.kind,
          variants: s.media.variants,
          width: s.media.width,
          height: s.media.height,
          durationS: s.media.durationS,
          alt: s.media.alt,
          credit: s.media.credit,
          license: s.media.license,
          rightsStatus: s.media.rightsStatus,
          status: s.media.status,
          createdAt: s.media.createdAt,
          used: sql<boolean>`(exists(select 1 from trips where story->'scenes' @> jsonb_build_array(jsonb_build_object('mediaId',media.id::text))) or exists(select 1 from trip_media tm where tm.media_id=media.id) or exists(select 1 from collections c where c.cover_media_id=media.id or c.hero_video_id=media.id) or exists(select 1 from hero_slides h where (h.image_media_id=media.id or h.video_media_id=media.id) and h.archived_at is null))`,
        })
        .from(s.media)
        .where(
          and(
            isNull(s.media.archivedAt),
            p.data.collection
              ? sql`(exists(select 1 from trip_media tm join trips t on t.id=tm.trip_id where tm.media_id=${s.media.id} and t.collection_id=${p.data.collection}) or exists(select 1 from collections c where c.id=${p.data.collection} and (c.cover_media_id=${s.media.id} or c.hero_video_id=${s.media.id})))`
              : undefined,
            p.data.filter === 'unknown'
              ? eq(s.media.rightsStatus, 'unknown')
              : p.data.filter === 'image' || p.data.filter === 'video'
                ? eq(s.media.kind, p.data.filter)
                : p.data.filter === 'unused'
                  ? sql`not exists(select 1 from trips where story->'scenes' @> jsonb_build_array(jsonb_build_object('mediaId',media.id::text))) and not exists(select 1 from trip_media where media_id=${s.media.id}) and not exists(select 1 from collections where cover_media_id=${s.media.id} or hero_video_id=${s.media.id}) and not exists(select 1 from hero_slides where image_media_id=${s.media.id} or video_media_id=${s.media.id})`
                  : undefined,
          ),
        )
        .orderBy(desc(s.media.createdAt))
        .limit(60)
        .offset((p.data.page - 1) * 60),
    );
  });
  app.post('/v1/admin/media', auth.guard('content'), async (c) =>
    c.json(await upload(c, db, cfg), 202),
  );
  app.get('/v1/admin/media/:id/preview', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      input = z
        .strictObject({
          variant: z
            .enum([
              '480.jpg',
              '768.jpg',
              '1200.jpg',
              '1920.jpg',
              'poster',
              'mp4_v',
              'mp4_h',
            ])
            .default('480.jpg'),
        })
        .safeParse(c.req.query());
    if (!input.success) fail(422, 'INVALID_QUERY');
    const [row] = await db.select().from(s.media).where(eq(s.media.id, id));
    if (!row || row.archivedAt || row.status !== 'ready')
      fail(404, 'NOT_FOUND');
    const variants = dataObject(row.variants),
      variant = input.data.variant,
      path = variant.endsWith('.jpg')
        ? dataObject(variants.jpg)[variant.split('.')[0]!]
        : variants[variant];
    if (typeof path !== 'string') fail(404, 'NOT_FOUND');
    return serveProcessed(
      row.rightsStatus === 'unknown'
        ? inside(cfg.ORIGINALS_ROOT, 'previews')
        : cfg.MEDIA_ROOT,
      path,
      c.req.header('range'),
      c.req.header('accept') ?? '',
      false,
    );
  });
  app.get('/v1/admin/media/:id', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      [row] = await db.select().from(s.media).where(eq(s.media.id, id));
    if (!row) fail(404, 'NOT_FOUND');
    const trips = await db
      .select({ id: s.trips.id, title: s.trips.title })
      .from(s.tripMedia)
      .innerJoin(s.trips, eq(s.tripMedia.tripId, s.trips.id))
      .where(eq(s.tripMedia.mediaId, id));
    const collections = await db
      .select({ id: s.collections.id, name: s.collections.name })
      .from(s.collections)
      .where(
        or(
          eq(s.collections.coverMediaId, id),
          eq(s.collections.heroVideoId, id),
        ),
      );
    const slides = await db
      .select({
        id: s.heroSlides.id,
        headline: s.heroSlides.headline,
        name: sql<unknown>`coalesce(hero_slides.headline, (select c.name from collections c where c.id=hero_slides.collection_id))`,
      })
      .from(s.heroSlides)
      .where(
        and(
          isNull(s.heroSlides.archivedAt),
          or(
            eq(s.heroSlides.imageMediaId, id),
            eq(s.heroSlides.videoMediaId, id),
          ),
        ),
      );
    return c.json({
      id: row.id,
      kind: row.kind,
      alt: row.alt,
      credit: row.credit,
      license: row.license,
      rightsStatus: row.rightsStatus,
      status: row.status,
      width: row.width,
      height: row.height,
      durationS: row.durationS,
      autoEnhance: row.autoEnhance,
      focalX: row.focalX,
      focalY: row.focalY,
      trimStart: row.trimStart,
      trimEnd: row.trimEnd,
      posterTime: row.posterTime,
      where_used: { trips, collections, slides },
    });
  });
  app.patch('/v1/admin/media/:id', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(c, mediaPatchSchema);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.media)
        .where(eq(s.media.id, id))
        .for('update');
      if (!before) fail(404, 'NOT_FOUND');
      if (b.rightsStatus === 'unknown') {
        const used = await tx.execute(
          sql`select 1 from trip_media tm join trips t on t.id=tm.trip_id where tm.media_id=${id} and t.status='published' union all select 1 from trips where status='published' and story->'scenes' @> jsonb_build_array(jsonb_build_object('mediaId',${id}::text)) union all select 1 from collections where (cover_media_id=${id} or hero_video_id=${id}) and status='published' union all select 1 from hero_slides where (image_media_id=${id} or video_media_id=${id}) and status='published' limit 1`,
        );
        if (used.rows.length) fail(409, 'MEDIA_IN_USE');
      }
      await tx
        .update(s.media)
        .set({
          ...b,
          focalX: b.focalX === undefined ? undefined : String(b.focalX),
          focalY: b.focalY === undefined ? undefined : String(b.focalY),
          status:
            b.rightsStatus ||
            b.focalX !== undefined ||
            b.focalY !== undefined ||
            b.autoEnhance !== undefined
              ? 'processing'
              : before.status,
        })
        .where(eq(s.media.id, id));
      await tx
        .insert(s.outbox)
        .values({ name: 'media.process', data: { mediaId: id } });
      await recordChange(
        tx,
        c,
        cfg,
        'media',
        id,
        pick(mediaPatchSchema, before),
        b,
      );
    });
    return c.json({ ok: true });
  });
  app.post('/v1/admin/media/:id/trim', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(
        c,
        z
          .strictObject({
            start: z.number().min(0).max(3600),
            end: z.number().positive().max(3600),
            poster: z.number().min(0).max(3600).optional(),
          })
          .refine(
            (b) =>
              b.end > b.start &&
              b.end - b.start <= 20 &&
              (b.poster === undefined ||
                (b.poster >= b.start && b.poster <= b.end)),
          ),
      );
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.media)
        .where(eq(s.media.id, id))
        .for('update');
      if (
        !before ||
        before.kind !== 'video' ||
        (before.durationS && b.end > Number(before.durationS))
      )
        fail(422, 'INVALID_TRIM');
      await tx
        .update(s.media)
        .set({
          trimStart: String(b.start),
          trimEnd: String(b.end),
          posterTime: String(b.poster ?? b.start),
          status: 'processing',
        })
        .where(eq(s.media.id, id));
      await tx
        .insert(s.outbox)
        .values({ name: 'media.process', data: { mediaId: id } });
      await recordChange(
        tx,
        c,
        cfg,
        'media',
        id,
        { trimStart: before.trimStart, trimEnd: before.trimEnd },
        b,
      );
    });
    return c.json({ ok: true });
  });
  app.delete('/v1/admin/media/:id', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id'));
    const used = await db.execute(
      sql`select 1 from trip_media where media_id=${id} union all select 1 from trips where status='published' and story->'scenes' @> jsonb_build_array(jsonb_build_object('mediaId',${id}::text)) union all select 1 from collections where cover_media_id=${id} or hero_video_id=${id} union all select 1 from hero_slides where image_media_id=${id} or video_media_id=${id} limit 1`,
    );
    if (used.rows.length) fail(409, 'MEDIA_IN_USE');
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.media)
        .where(eq(s.media.id, id));
      if (!before) fail(404, 'NOT_FOUND');
      await tx
        .update(s.media)
        .set({ archivedAt: new Date() })
        .where(eq(s.media.id, id));
      await recordChange(
        tx,
        c,
        cfg,
        'media',
        id,
        { archivedAt: null },
        { archivedAt: new Date() },
        'archive',
      );
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/settings', auth.guard('settings'), async (c) =>
    c.json(await readSettings(db)),
  );
  app.put('/v1/admin/settings', auth.guard('settings'), async (c) => {
    auth.recent(c);
    const contact = z.strictObject({
      whatsapp_primary: z.string().regex(/^\+[1-9]\d{6,14}$/),
      whatsapp_secondary: z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/)
        .nullable(),
      phone: z.string().max(40).nullable(),
      email: z.email().nullable(),
    });
    const schema = z.strictObject({
      contacts: contact.optional(),
      address: localizedSchema.optional(),
      hours: localizedSchema.nullable().optional(),
      legal_entity: localizedSchema.optional(),
      pickup_areas: z.array(z.string().min(1).max(100)).max(30).optional(),
      social: z
        .array(
          z.strictObject({
            label: z.string().max(100),
            url: z.url().refine((v) => new URL(v).protocol === 'https:'),
          }),
        )
        .max(10)
        .optional(),
      request_rules: z
        .strictObject({
          min_days_ahead: z.number().int().min(1).max(30),
          max_adults: z.number().int().min(1).max(60),
          max_children: z.number().int().min(0).max(40),
        })
        .optional(),
    });
    const b = await parse(c, schema);
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(b)) {
        const [before] = await tx
          .select()
          .from(s.settings)
          .where(eq(s.settings.key, key))
          .for('update');
        await tx
          .insert(s.settings)
          .values({
            key,
            value: value === null ? sql`'null'::jsonb` : value,
            updatedBy: c.get('principal').id,
          })
          .onConflictDoUpdate({
            target: s.settings.key,
            set: {
              value: value === null ? sql`'null'::jsonb` : value,
              updatedAt: new Date(),
              updatedBy: c.get('principal').id,
            },
          });
        await recordChange(
          tx,
          c,
          cfg,
          'settings',
          randomUUID(),
          { key, value: before?.value ?? null },
          { key, value },
        );
      }
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/audit', auth.guard('audit'), async (c) => {
    const p = z
      .strictObject({
        entity: z.string().max(80).optional(),
        entityId: z.string().max(120).optional(),
        user: z.uuid().optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .safeParse(c.req.query());
    if (!p.success) fail(422, 'INVALID_QUERY');
    return c.json(
      await db
        .select({
          id: s.auditLog.id,
          at: s.auditLog.at,
          userId: s.auditLog.userId,
          userName: sql<
            string | null
          >`(select name from admin_users where id=${s.auditLog.userId})`,
          entityTitle: sql<unknown>`case when ${s.auditLog.entity} in ('trip','trip_prices','trip_itinerary','trip_items','trip_media','package') then (select title from trips where id::text=${s.auditLog.entityId}) when ${s.auditLog.entity}='collection' then (select name from collections where id::text=${s.auditLog.entityId}) when ${s.auditLog.entity}='hero_slide' then (select headline from hero_slides where id::text=${s.auditLog.entityId}) when ${s.auditLog.entity}='media' then (select alt from media where id::text=${s.auditLog.entityId}) when ${s.auditLog.entity}='faq' then (select q from faqs where id::text=${s.auditLog.entityId}) when ${s.auditLog.entity}='request' then (select to_jsonb(ref) from booking_requests where id::text=${s.auditLog.entityId}) when ${s.auditLog.entity}='user' then (select to_jsonb(name) from admin_users where id::text=${s.auditLog.entityId}) when ${s.auditLog.entity}='settings' then ${s.auditLog.after}->'key' when ${s.auditLog.entity}='page_blocks' then ${s.auditLog.after}->'key' else null end`,
          action: s.auditLog.action,
          entity: s.auditLog.entity,
          entityId: s.auditLog.entityId,
          before: s.auditLog.before,
          after: s.auditLog.after,
        })
        .from(s.auditLog)
        .where(
          and(
            p.data.entity
              ? p.data.entity === 'trip'
                ? inArray(s.auditLog.entity, [
                    'trip',
                    'trip_prices',
                    'trip_itinerary',
                    'trip_items',
                    'trip_media',
                  ])
                : eq(s.auditLog.entity, p.data.entity)
              : undefined,
            p.data.entityId
              ? eq(s.auditLog.entityId, p.data.entityId)
              : undefined,
            p.data.user ? eq(s.auditLog.userId, p.data.user) : undefined,
            p.data.from
              ? sql`${s.auditLog.at}>=(${p.data.from}::date::timestamp at time zone 'Africa/Cairo')`
              : undefined,
            p.data.to
              ? sql`${s.auditLog.at}<((${p.data.to}::date+1)::timestamp at time zone 'Africa/Cairo')`
              : undefined,
          ),
        )
        .orderBy(desc(s.auditLog.at))
        .limit(50)
        .offset((p.data.page - 1) * 50),
    );
  });
  app.get('/v1/admin/revisions', auth.guard('audit'), async (c) => {
    const p = z
      .strictObject({ entity: z.string().max(80), id: z.uuid() })
      .safeParse(c.req.query());
    if (!p.success) fail(422, 'INVALID_QUERY');
    return c.json(
      await db
        .select()
        .from(s.revisions)
        .where(
          and(
            eq(s.revisions.entity, p.data.entity),
            eq(s.revisions.entityId, p.data.id),
          ),
        )
        .orderBy(desc(s.revisions.createdAt))
        .limit(100),
    );
  });
  app.post('/v1/admin/preview-link', auth.guard('content'), async (c) => {
    const b = await parse(c, z.strictObject({ path: internalPath }));
    const expires = Date.now() + 3600000,
      payload = Buffer.from(JSON.stringify({ path: b.path, expires })).toString(
        'base64url',
      ),
      signature = signPurpose('preview', payload, cfg.SESSION_SECRET);
    const token = payload + '.' + signature;
    return c.json({
      path: b.path,
      token,
      expires,
      url: new URL(
        '/' +
          b.path.split('/')[1] +
          '/preview?token=' +
          encodeURIComponent(token),
        cfg.WEB_ORIGIN,
      ).href,
    });
  });
  registerMore(app, db, cfg, auth);
  registerArchive(app, db, cfg, auth);
}
