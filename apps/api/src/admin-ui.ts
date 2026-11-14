import type { Hono } from 'hono';
import { and, eq, inArray, isNull, desc, sql } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { can, type Permission } from '@stella/shared/admin';
import type { ApiEnv } from './types';
import type { authService } from './auth';
import { fail } from './errors';
import type { Config } from './config';
import { publicTranslationFields } from './translate';
import {
  translationReviewSchema,
  translationTarget,
  updateTranslationValue,
  revalidateTranslations,
  translationDraftId,
  jsonPathSql,
} from './translation-review';
import { recordChange } from './admin';
export function registerAdminUi(
  app: Hono<ApiEnv>,
  db: Database,
  auth: ReturnType<typeof authService>,
  cfg: Config,
) {
  app.get('/v1/admin/audit-actors', auth.guard('audit'), async (c) =>
    c.json(
      await db
        .select({ id: s.adminUsers.id, name: s.adminUsers.name })
        .from(s.adminUsers),
    ),
  );
  app.delete(
    '/v1/admin/packages/:id/prices',
    auth.guard('prices'),
    async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      if (!id.success) fail(422, 'INVALID_ID');
      await db.transaction(async (tx) => {
        const [trip] = await tx
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, id.data))
          .for('update');
        if (!trip || trip.kind !== 'package') fail(404, 'NOT_FOUND');
        const before = await tx
          .select()
          .from(s.tripPrices)
          .where(eq(s.tripPrices.tripId, id.data));
        await tx.delete(s.tripPrices).where(eq(s.tripPrices.tripId, id.data));
        await recordChange(
          tx,
          c,
          cfg,
          'trip_prices',
          id.data,
          before,
          [],
          'prices',
          ['site', 'collections', 'trip:' + trip.slug],
        );
      });
      return c.json({ ok: true });
    },
  );
  app.get('/v1/admin/users/:id/sessions', auth.guard('users'), async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) fail(422, 'INVALID_ID');
    return c.json(
      await db
        .select({
          id: s.sessions.id,
          createdAt: s.sessions.createdAt,
          lastSeenAt: s.sessions.lastSeenAt,
          expiresAt: s.sessions.expiresAt,
          userAgent: s.sessions.userAgent,
        })
        .from(s.sessions)
        .where(eq(s.sessions.userId, id.data)),
    );
  });
  app.delete('/v1/admin/users/:id/sessions', auth.guard('users'), async (c) => {
    auth.recent(c);
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) fail(422, 'INVALID_ID');
    await db.transaction(async (tx) => {
      await tx
        .select({ id: s.adminUsers.id })
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, id.data))
        .for('update');
      await tx.delete(s.sessions).where(eq(s.sessions.userId, id.data));
      await tx.delete(s.adminDevices).where(eq(s.adminDevices.userId, id.data));
      await tx
        .delete(s.pushSubscriptions)
        .where(eq(s.pushSubscriptions.userId, id.data));
      await tx.insert(s.auditLog).values({
        userId: c.get('principal').id,
        entity: 'user',
        entityId: id.data,
        action: 'logout_all',
      });
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/package-parts', auth.guard('content'), async (c) => {
    const id = z.uuid().safeParse(c.req.query('id'));
    if (!id.success) fail(422, 'INVALID_ID');
    return c.json(
      await db
        .select({
          packageId: s.packageItems.packageId,
          tripId: s.packageItems.tripId,
          dayIndex: s.packageItems.dayIndex,
          sort: s.packageItems.sort,
          primaryAmountEur: sql<
            string | null
          >`(select tp.amount_eur from trip_prices tp where tp.trip_id=package_items.trip_id and tp.is_primary limit 1)`,
        })
        .from(s.packageItems)
        .where(eq(s.packageItems.packageId, id.data))
        .orderBy(s.packageItems.dayIndex),
    );
  });
  app.post('/v1/admin/i18n/review', auth.guard('translations'), async (c) => {
    const input = await auth.parse(c, translationReviewSchema),
      field = (await publicTranslationFields(db, cfg)).find(
        (field) =>
          field.entity === input.entity &&
          field.id === input.id &&
          field.field === input.field,
      );
    if (!field) fail(422, 'INVALID_TRANSLATION_FIELD');
    if (field.en !== input.source) fail(409, 'TRANSLATION_STALE');
    const draftId = translationDraftId(input);
    if (c.get('principal').role === 'editor') {
      await db.transaction(async (tx) => {
        const where = and(
          eq(s.contentDrafts.entity, 'translation'),
          eq(s.contentDrafts.entityId, draftId),
          eq(s.contentDrafts.section, 'review'),
        );
        const [before] = await tx.select().from(s.contentDrafts).where(where);
        await tx
          .insert(s.contentDrafts)
          .values({
            entity: 'translation',
            entityId: draftId,
            section: 'review',
            data: input,
            createdBy: c.get('principal').id,
          })
          .onConflictDoUpdate({
            target: [
              s.contentDrafts.entity,
              s.contentDrafts.entityId,
              s.contentDrafts.section,
            ],
            set: {
              data: input,
              createdBy: c.get('principal').id,
              updatedAt: new Date(),
            },
          });
        await recordChange(
          tx,
          c,
          cfg,
          'translation_draft',
          draftId,
          before ?? null,
          { data: input },
          'translation_draft',
        );
      });
      return c.json({ ok: true, draft: true });
    }
    await db.transaction(async (tx) => {
      const where = and(
        eq(s.contentTranslations.entity, input.entity),
        eq(s.contentTranslations.entityId, input.id),
        eq(s.contentTranslations.field, input.field),
        eq(s.contentTranslations.locale, input.locale),
      );
      const [before] = await tx
        .select()
        .from(s.contentTranslations)
        .where(where)
        .for('update');
      const target = translationTarget(input);
      let previous: string | null = null;
      if (target) {
        const result = await tx.execute<{ value: string | null }>(
          sql`select ${sql.identifier(target.column)} #>> ${jsonPathSql([...target.path, input.locale])} as value from ${sql.identifier(target.table)} where ${sql.identifier(target.key)}::text=${input.id} for update`,
        );
        previous = result.rows[0]?.value ?? null;
      }
      await updateTranslationValue(tx, input, input.text, input.source);
      await tx
        .insert(s.contentTranslations)
        .values({
          entity: input.entity,
          entityId: input.id,
          field: input.field,
          locale: input.locale,
          text: input.text,
          sourceHash: createHash('sha256').update(input.source).digest('hex'),
          origin: 'human',
        })
        .onConflictDoUpdate({
          target: [
            s.contentTranslations.entity,
            s.contentTranslations.entityId,
            s.contentTranslations.field,
            s.contentTranslations.locale,
          ],
          set: {
            text: input.text,
            sourceHash: createHash('sha256').update(input.source).digest('hex'),
            origin: 'human',
            provider: null,
            updatedAt: new Date(),
          },
        });
      const selector = {
        entity: input.entity,
        id: input.id,
        field: input.field,
        locale: input.locale,
      };
      await recordChange(
        tx,
        c,
        cfg,
        'translation',
        randomUUID(),
        {
          target: selector,
          previous,
          row: before
            ? {
                text: before.text,
                sourceHash: before.sourceHash,
                origin: before.origin,
                provider: before.provider,
              }
            : null,
        },
        { target: selector, text: input.text },
        'translation_review',
        ['site', 'collections', 'ui:' + input.locale],
      );
      await revalidateTranslations(tx, input.locale);
      await tx
        .delete(s.contentDrafts)
        .where(
          and(
            eq(s.contentDrafts.entity, 'translation'),
            eq(s.contentDrafts.entityId, draftId),
            eq(s.contentDrafts.section, 'review'),
          ),
        );
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/price-list', auth.guard('prices'), async (c) => {
    const trips = await db
      .select({
        id: s.trips.id,
        title: s.trips.title,
        collectionId: s.trips.collectionId,
        privateSurchargePct: s.trips.privateSurchargePct,
        format: s.trips.format,
        kind: s.trips.kind,
      })
      .from(s.trips)
      .where(isNull(s.trips.archivedAt))
      .orderBy(s.trips.sort, sql`${s.trips.title}->>'en'`);
    const prices = await db
      .select()
      .from(s.tripPrices)
      .orderBy(s.tripPrices.sort);
    return c.json(
      trips.map((trip) => ({
        ...trip,
        rows: prices.filter((price) => price.tripId === trip.id),
      })),
    );
  });
  app.get('/v1/admin/request-assignees', auth.guard('requests'), async (c) =>
    c.json(
      await db
        .select({ id: s.adminUsers.id, name: s.adminUsers.name })
        .from(s.adminUsers)
        .where(
          and(
            isNull(s.adminUsers.disabledAt),
            inArray(s.adminUsers.role, ['owner', 'manager', 'sales']),
          ),
        ),
    ),
  );
  app.get('/v1/admin/i18n/values', auth.guard('translations'), async (c) => {
    const query = z
      .strictObject({
        entity: z.enum([
          'trip',
          'collection',
          'hero_slide',
          'faq',
          'page_block',
          'media',
          'settings',
          'ui',
          'trip_item',
          'trip_price',
          'itinerary',
        ]),
        id: z.string().min(1).max(120),
      })
      .safeParse(c.req.query());
    if (!query.success) fail(422, 'INVALID_QUERY');
    return c.json(
      await db
        .select()
        .from(s.contentTranslations)
        .where(
          and(
            eq(s.contentTranslations.entity, query.data.entity),
            eq(s.contentTranslations.entityId, query.data.id),
          ),
        ),
    );
  });
  app.get('/v1/admin/history', auth.guard(), async (c) => {
    const query = z
      .strictObject({ entity: z.string().max(80), id: z.uuid() })
      .safeParse(c.req.query());
    if (!query.success) fail(422, 'INVALID_QUERY');
    const map: Record<string, Permission> = {
      trip: 'content',
      trip_prices: 'prices',
      trip_itinerary: 'content',
      trip_items: 'content',
      trip_media: 'content',
      collection: 'content',
      hero_slide: 'heroDraft',
      request: 'requests',
      media: 'content',
      faq: 'content',
      page_blocks: 'content',
      package: 'content',
      settings: 'audit',
      hero_order: 'heroLive',
      collection_order: 'publish',
      trip_order: 'content',
      translation: 'audit',
      translation_draft: 'translations',
    };
    const permission = map[query.data.entity];
    if (!permission || !can(c.get('principal').role, permission))
      fail(403, 'FORBIDDEN');
    return c.json(
      await db
        .select({
          id: s.revisions.id,
          createdAt: s.revisions.createdAt,
          createdBy: s.revisions.createdBy,
          actorName: sql<string>`(select name from admin_users where id=${s.revisions.createdBy})`,
        })
        .from(s.revisions)
        .where(
          and(
            eq(s.revisions.entity, query.data.entity),
            eq(s.revisions.entityId, query.data.id),
          ),
        )
        .orderBy(desc(s.revisions.createdAt))
        .limit(100),
    );
  });
}
