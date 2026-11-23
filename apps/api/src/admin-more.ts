import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import {
  and,
  eq,
  inArray,
  isNull,
  isNotNull,
  sql,
  getTableColumns,
} from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  localizedSchema,
  roles,
  can,
  basicsSchema,
  scheduleSchema,
  seoSchema,
  heroSchema,
  collectionEditSchema,
  requestPatchSchema,
  priceRowSchema,
  type Permission,
} from '@stella/shared/admin';
import { locales, isCoreLocale } from '@stella/shared';
import type { ApiEnv } from './types';
import type { Config } from './config';
import {
  authService,
  opaque,
  sha,
  seal,
  equal,
  aad,
  signPurpose,
} from './auth';
import {
  recordChange,
  tripListExtras,
  usableMedia,
  canPublishTrip,
  tripSnapshot,
} from './admin';
import { fail } from './errors';
import { coreWebMessages } from './web-dictionaries';
import { requireCoreCopy } from './publication-languages';
import { restorePublication } from './restore-publication';
import {
  restoreTranslation,
  revalidateTranslations,
} from './translation-review';
import {
  recordHumanFields,
  copyEntityTranslations,
} from './translation-records';
const uuid = (v: string | undefined) => {
  if (!z.uuid().safeParse(v).success) fail(422, 'INVALID_ID');
  return v!;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const project = (schema: z.ZodObject, v: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(schema.shape)
      .filter((k) => k in v)
      .map((k) => [k, v[k]]),
  );
function markdownSafe(v: unknown) {
  if (
    typeof v === 'string' &&
    (/<\/?[a-z][\s\S]*>/i.test(v) ||
      /\]\(\s*(?:javascript|data|vbscript):/i.test(v))
  )
    fail(422, 'UNSAFE_MARKDOWN');
  if (Array.isArray(v)) v.forEach(markdownSafe);
  else if (v && typeof v === 'object') Object.values(v).forEach(markdownSafe);
}
export function registerMore(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  const parse = auth.parse;
  const getUsers = () =>
    db
      .select({
        id: s.adminUsers.id,
        email: s.adminUsers.email,
        name: s.adminUsers.name,
        role: s.adminUsers.role,
        totpEnabled: s.adminUsers.totpEnabled,
        mfaRequired: s.adminUsers.mfaRequired,
        disabledAt: s.adminUsers.disabledAt,
        lastLoginAt: s.adminUsers.lastLoginAt,
      })
      .from(s.adminUsers);
  app.get('/v1/admin/users', auth.guard('users'), async (c) =>
    c.json(await getUsers()),
  );
  app.post('/v1/admin/users', auth.guard('users'), async (c) => {
    auth.recent(c);
    const b = await parse(
        c,
        z.strictObject({
          email: z.email().max(254),
          name: z.string().trim().min(1).max(80),
          role: z.enum(roles),
          mfaRequired: z.boolean().optional(),
        }),
      ),
      raw = opaque();
    const [user] = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(s.adminUsers)
        .values({ ...b, passwordHash: '!setup-required' })
        .returning();
      await tx.insert(s.authTokens).values({
        id: sha(raw),
        userId: rows[0]!.id,
        purpose: 'setup',
        expiresAt: new Date(Date.now() + 48 * 3600000),
      });
      await tx.insert(s.outbox).values({
        name: 'auth.invite',
        data: {
          userId: rows[0]!.id,
          token: seal(
            raw,
            cfg.TOTP_ENC_KEY,
            aad('auth-token', rows[0]!.id),
          ).toString('base64'),
        },
      });
      await tx.insert(s.auditLog).values({
        userId: c.get('principal').id,
        action: 'invite',
        entity: 'user',
        entityId: rows[0]!.id,
        after: { role: b.role },
      });
      return rows;
    });
    return c.json({ id: user!.id }, 201);
  });
  app.patch('/v1/admin/users/:id', auth.guard('users'), async (c) => {
    auth.recent(c);
    const id = uuid(c.req.param('id')),
      b = await parse(
        c,
        z.strictObject({
          name: z.string().trim().min(1).max(80).optional(),
          role: z.enum(roles).optional(),
          disabled: z.boolean().optional(),
          mfaRequired: z.boolean().optional(),
        }),
      );
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('admin-users'))`,
      );
      const [before] = await tx
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, id))
        .for('update');
      if (!before) fail(404, 'NOT_FOUND');
      if (
        id === c.get('principal').id &&
        ((b.role && b.role !== before.role) || b.disabled)
      )
        fail(409, 'SELF_CHANGE');
      if (
        before.role === 'owner' &&
        ((b.role && b.role !== 'owner') || b.disabled)
      ) {
        const owners = await tx
          .select()
          .from(s.adminUsers)
          .where(
            and(
              eq(s.adminUsers.role, 'owner'),
              isNull(s.adminUsers.disabledAt),
            ),
          );
        if (owners.length <= 1) fail(409, 'LAST_OWNER');
      }
      await tx
        .update(s.adminUsers)
        .set({
          ...(b.name ? { name: b.name } : {}),
          ...(b.role ? { role: b.role } : {}),
          ...(b.mfaRequired !== undefined
            ? { mfaRequired: b.mfaRequired }
            : {}),
          ...(b.disabled !== undefined
            ? { disabledAt: b.disabled ? new Date() : null }
            : {}),
        })
        .where(eq(s.adminUsers.id, id));
      if (b.role || b.disabled !== undefined || b.mfaRequired !== undefined)
        await tx.delete(s.sessions).where(eq(s.sessions.userId, id));
      await tx.insert(s.auditLog).values({
        userId: c.get('principal').id,
        action: 'update',
        entity: 'user',
        entityId: id,
        before: { role: before.role, disabled: !!before.disabledAt },
        after: b,
      });
    });
    return c.json({ ok: true });
  });
  const packageSchema = z.strictObject({
    title: localizedSchema.optional(),
    summary: localizedSchema.nullable().optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9-]{1,120}$/)
      .optional(),
    parts: z
      .array(
        z.strictObject({
          tripId: z.uuid(),
          dayIndex: z.number().int().min(1).max(120),
        }),
      )
      .min(1)
      .max(38),
  });
  app.get('/v1/admin/packages', auth.guard('content'), async (c) =>
    c.json(
      await db
        .select({ ...getTableColumns(s.trips), ...tripListExtras })
        .from(s.trips)
        .where(
          and(
            eq(s.trips.kind, 'package'),
            c.req.query('archived') === '1'
              ? sql`${s.trips.archivedAt} is not null`
              : isNull(s.trips.archivedAt),
          ),
        )
        .orderBy(s.trips.sort, sql`${s.trips.title}->>'en'`),
    ),
  );
  for (const method of ['post', 'patch'] as const) {
    const route =
      method === 'post' ? '/v1/admin/packages' : '/v1/admin/packages/:id';
    app[method](route, auth.guard('content'), async (c) => {
      const b = await parse(c, packageSchema);
      const id = method === 'post' ? randomUUID() : uuid(c.req.param('id'));
      await db.transaction(async (tx) => {
        const parts = await tx
          .select()
          .from(s.trips)
          .where(
            inArray(
              s.trips.id,
              b.parts.map((p) => p.tripId),
            ),
          );
        if (
          parts.length !== b.parts.length ||
          parts.some((p) => p.kind !== 'trip' || p.archivedAt)
        )
          fail(422, 'INVALID_PACKAGE_PARTS');
        const [collection] = await tx
          .select()
          .from(s.collections)
          .where(eq(s.collections.kind, 'packages'));
        if (!collection) fail(422, 'PACKAGE_COLLECTION_MISSING');
        const [before] = await tx
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, id))
          .for('update');
        if (method === 'post') {
          if (!b.title || !b.slug) fail(422, 'TITLE_AND_SLUG_REQUIRED');
          await tx.insert(s.trips).values({
            id,
            title: b.title,
            slug: b.slug,
            summary: b.summary ?? null,
            collectionId: collection.id,
            kind: 'package',
            status: 'draft',
          });
        } else {
          if (!before || before.kind !== 'package') fail(404, 'NOT_FOUND');
          if (before.status === 'published')
            fail(409, 'UNPUBLISH_PACKAGE_FIRST');
          await tx
            .update(s.trips)
            .set({
              ...(b.title ? { title: b.title } : {}),
              ...(b.summary !== undefined ? { summary: b.summary } : {}),
              ...(b.slug ? { slug: b.slug } : {}),
              updatedAt: new Date(),
            })
            .where(eq(s.trips.id, id));
        }
        const previousParts = await tx
          .select()
          .from(s.packageItems)
          .where(eq(s.packageItems.packageId, id));
        await tx.delete(s.packageItems).where(eq(s.packageItems.packageId, id));
        await tx.insert(s.packageItems).values(
          b.parts.map((p, sort) => ({
            packageId: id,
            tripId: p.tripId,
            dayIndex: p.dayIndex,
            sort,
          })),
        );
        await tx
          .update(s.trips)
          .set({
            daysCount: Math.max(
              ...b.parts.map(
                (p) =>
                  p.dayIndex +
                  parts.find((t) => t.id === p.tripId)!.daysCount -
                  1,
              ),
            ),
          })
          .where(eq(s.trips.id, id));
        await recordChange(
          tx,
          c,
          cfg,
          'package',
          id,
          { trip: before ?? null, parts: previousParts },
          b,
        );
      });
      return c.json({ id }, method === 'post' ? 201 : 200);
    });
  }
  app.post(
    '/v1/admin/trips/:id/duplicate',
    auth.guard('content'),
    async (c) => {
      const id = uuid(c.req.param('id')),
        b = await parse(
          c,
          z.strictObject({
            slug: z
              .string()
              .regex(/^[a-z0-9-]{1,120}$/)
              .optional(),
          }),
        );
      const newId = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, id));
        if (!before) fail(404, 'NOT_FOUND');
        const {
          id: _old,
          createdAt: _created,
          updatedAt: _updated,
          ...base
        } = before;
        // "{title} (copy)" in every locale; slug "{slug}-copy", then -copy-2…
        let slug = b.slug;
        if (!slug) {
          const stem = before.slug.slice(0, 110) + '-copy',
            taken = new Set(
              (
                await tx
                  .select({ slug: s.trips.slug })
                  .from(s.trips)
                  .where(sql`${s.trips.slug} like ${stem + '%'}`)
              ).map((r) => r.slug),
            );
          slug = stem;
          for (let n = 2; taken.has(slug); n++) slug = stem + '-' + n;
        }
        const title = Object.fromEntries(
          Object.entries(before.title).map(([locale, text]) => [
            locale,
            typeof text === 'string' && text ? text + ' (copy)' : text,
          ]),
        ) as typeof before.title;
        const [row] = await tx
          .insert(s.trips)
          .values({
            ...base,
            title,
            slug,
            sort: before.sort + 1,
            status: 'draft',
            featuredOrder: null,
            archivedAt: null,
          })
          .returning();
        for (const p of await tx
          .select()
          .from(s.tripPrices)
          .where(eq(s.tripPrices.tripId, id))) {
          const { id: _price, ...values } = p;
          const [created] = await tx
            .insert(s.tripPrices)
            .values({ ...values, tripId: row!.id })
            .returning({ id: s.tripPrices.id });
          await copyEntityTranslations(tx, 'trip_price', p.id, created!.id);
        }
        for (const p of await tx
          .select()
          .from(s.tripItinerary)
          .where(eq(s.tripItinerary.tripId, id))) {
          const { id: _item, ...values } = p;
          const [created] = await tx
            .insert(s.tripItinerary)
            .values({ ...values, tripId: row!.id })
            .returning({ id: s.tripItinerary.id });
          await copyEntityTranslations(tx, 'itinerary', p.id, created!.id);
        }
        for (const p of await tx
          .select()
          .from(s.tripItems)
          .where(eq(s.tripItems.tripId, id))) {
          const { id: _item, ...values } = p;
          const [created] = await tx
            .insert(s.tripItems)
            .values({ ...values, tripId: row!.id })
            .returning({ id: s.tripItems.id });
          await copyEntityTranslations(tx, 'trip_item', p.id, created!.id);
        }
        const media = await tx
          .select()
          .from(s.tripMedia)
          .where(eq(s.tripMedia.tripId, id));
        if (media.length)
          await tx
            .insert(s.tripMedia)
            .values(media.map((p) => ({ ...p, tripId: row!.id })));
        const parts = await tx
          .select()
          .from(s.packageItems)
          .where(eq(s.packageItems.packageId, id));
        if (parts.length)
          await tx
            .insert(s.packageItems)
            .values(parts.map((p) => ({ ...p, packageId: row!.id })));
        await copyEntityTranslations(tx, 'trip', id, row!.id);
        await recordChange(
          tx,
          c,
          cfg,
          'trip',
          row!.id,
          { section: 'archive', values: { archivedAt: new Date() } },
          { source: id },
          'duplicate',
        );
        return row!.id;
      });
      return c.json({ id: newId }, 201);
    },
  );
  app.post('/v1/admin/collections', auth.guard('content'), async (c) => {
    const b = await parse(
      c,
      collectionEditSchema
        .required({ name: true })
        .extend({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/) })
        .strict(),
    );
    const row = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.collections)
        .values({ ...b, status: 'draft' })
        .returning();
      await recordChange(
        tx,
        c,
        cfg,
        'collection',
        row!.id,
        { ...row, archivedAt: new Date() },
        row,
        'create',
      );
      return row!;
    });
    return c.json({ id: row!.id }, 201);
  });
  app.post(
    '/v1/admin/collections/:id/publish',
    auth.guard('publish'),
    async (c) => {
      const id = uuid(c.req.param('id'));
      await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(s.collections)
          .where(eq(s.collections.id, id))
          .for('update');
        if (!before) fail(404, 'NOT_FOUND');
        const [draft] = await tx
          .select()
          .from(s.contentDrafts)
          .where(
            and(
              eq(s.contentDrafts.entity, 'collection'),
              eq(s.contentDrafts.entityId, id),
            ),
          );
        const b = draft ? collectionEditSchema.parse(draft.data) : {};
        const merged = { ...before, ...b };
        await requireCoreCopy(tx, [
          {
            entity: 'collection',
            id,
            copy: {
              name: merged.name,
              shortName: merged.shortName,
              headline: merged.headline,
              subline: merged.subline,
              perks: merged.perks,
            },
          },
        ]);
        for (const mid of [merged.coverMediaId, merged.heroVideoId])
          if (mid) {
            const [m] = await tx
              .select()
              .from(s.media)
              .where(eq(s.media.id, mid));
            if (
              !m ||
              m.archivedAt ||
              m.status !== 'ready' ||
              m.rightsStatus === 'unknown'
            )
              fail(422, 'MEDIA_NOT_PUBLISHABLE');
          }
        await tx
          .update(s.collections)
          .set({ ...b, status: 'published', updatedAt: new Date() })
          .where(eq(s.collections.id, id));
        await tx
          .delete(s.contentDrafts)
          .where(
            and(
              eq(s.contentDrafts.entity, 'collection'),
              eq(s.contentDrafts.entityId, id),
            ),
          );
        await recordChange(tx, c, cfg, 'collection', id, before, b, 'publish');
      });
      return c.json({ ok: true });
    },
  );
  const faqSchema = z.strictObject({
    q: localizedSchema,
    a: localizedSchema,
    sort: z.number().int().min(0).max(1000).default(0),
    publish: z.boolean().default(false),
  });
  app.get('/v1/admin/faqs', auth.guard('content'), async (c) =>
    c.json(
      await db
        .select()
        .from(s.faqs)
        .where(
          c.req.query('archived') === '1'
            ? sql`${s.faqs.archivedAt} is not null`
            : isNull(s.faqs.archivedAt),
        )
        .orderBy(s.faqs.sort),
    ),
  );
  app.post('/v1/admin/faqs', auth.guard('content'), async (c) => {
    const b = await parse(c, faqSchema);
    markdownSafe(b);
    if (b.publish && !can(c.get('principal').role, 'publish'))
      fail(403, 'FORBIDDEN');
    const row = await db.transaction(async (tx) => {
      if (b.publish)
        await requireCoreCopy(tx, [
          { entity: 'faq', id: '', copy: { q: b.q, a: b.a } },
        ]);
      const [row] = await tx
        .insert(s.faqs)
        .values({
          q: b.q,
          a: b.a,
          sort: b.sort,
          status: b.publish ? 'published' : 'draft',
        })
        .returning();
      await recordChange(
        tx,
        c,
        cfg,
        'faq',
        row!.id,
        { ...row, status: 'draft' },
        row,
        'create',
        ['faq', 'site'],
      );
      await recordHumanFields(tx, 'faq', row!.id, b, null);
      return row!;
    });
    return c.json({ id: row!.id }, 201);
  });
  app.patch('/v1/admin/faqs/:id', auth.guard('content'), async (c) => {
    const id = uuid(c.req.param('id')),
      b = await parse(c, faqSchema);
    markdownSafe(b);
    if (b.publish && !can(c.get('principal').role, 'publish'))
      fail(403, 'FORBIDDEN');
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.faqs)
        .where(eq(s.faqs.id, id))
        .for('update');
      if (!before) fail(404, 'NOT_FOUND');
      if (before.status === 'published' && c.get('principal').role === 'editor')
        fail(403, 'DRAFT_ONLY');
      if (b.publish)
        await requireCoreCopy(tx, [
          { entity: 'faq', id, copy: { q: b.q, a: b.a } },
        ]);
      await tx
        .update(s.faqs)
        .set({
          q: b.q,
          a: b.a,
          sort: b.sort,
          status: b.publish ? 'published' : 'draft',
        })
        .where(eq(s.faqs.id, id));
      await recordChange(tx, c, cfg, 'faq', id, before, b, 'update', ['faq']);
    });
    return c.json({ ok: true });
  });
  app.delete('/v1/admin/faqs/:id', auth.guard('publish'), async (c) => {
    const id = uuid(c.req.param('id'));
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(s.faqs).where(eq(s.faqs.id, id));
      if (!before) fail(404, 'NOT_FOUND');
      await tx.update(s.faqs).set({ status: 'draft' }).where(eq(s.faqs.id, id));
      await recordChange(tx, c, cfg, 'faq', id, before, null, 'hide', ['faq']);
    });
    return c.json({ ok: true });
  });
  const block = z.strictObject({
    id: z.uuid().optional(),
    type: z.enum(['rich_text', 'how_steps', 'contact_card', 'faq_list']),
    data: z.strictObject({
      title: localizedSchema.optional(),
      heading: localizedSchema.optional(),
      text: localizedSchema,
    }),
    sort: z.number().int().min(0).max(1000).default(0),
  });
  app.get('/v1/admin/pages/:key/blocks', auth.guard('content'), async (c) => {
    const key = c.req.param('key');
    if (!['home', 'contact', 'terms', 'privacy', 'cancellation'].includes(key))
      fail(422, 'INVALID_PAGE');
    return c.json(
      await db
        .select()
        .from(s.pageBlocks)
        .where(eq(s.pageBlocks.pageKey, key))
        .orderBy(s.pageBlocks.sort),
    );
  });
  app.put('/v1/admin/pages/:key/blocks', auth.guard('content'), async (c) => {
    const key = c.req.param('key');
    if (!['home', 'contact', 'terms', 'privacy', 'cancellation'].includes(key))
      fail(422, 'INVALID_PAGE');
    const b = await parse(
      c,
      z.strictObject({
        blocks: z.array(block).max(30),
        publish: z.boolean().default(false),
      }),
    );
    markdownSafe(b);
    if (b.publish && !can(c.get('principal').role, 'publish'))
      fail(403, 'FORBIDDEN');
    await db.transaction(async (tx) => {
      const before = await tx
        .select()
        .from(s.pageBlocks)
        .where(eq(s.pageBlocks.pageKey, key))
        .for('update');
      if (b.publish)
        await tx.delete(s.pageBlocks).where(eq(s.pageBlocks.pageKey, key));
      else
        await tx
          .delete(s.pageBlocks)
          .where(
            and(
              eq(s.pageBlocks.pageKey, key),
              eq(s.pageBlocks.status, 'draft'),
            ),
          );
      const selectedIds = new Set<string>();
      for (const row of b.blocks) {
        if (
          row.id &&
          (!before.some((value) => value.id === row.id) ||
            selectedIds.has(row.id))
        )
          fail(422, 'INVALID_BLOCK');
        if (row.id) selectedIds.add(row.id);
        const existing = before.find((value) => value.id === row.id),
          id =
            row.id && (b.publish || existing?.status === 'draft')
              ? row.id
              : randomUUID();
        await tx.insert(s.pageBlocks).values({
          ...row,
          id,
          pageKey: key,
          status: b.publish ? 'published' : 'draft',
        });
        if (existing && id !== existing.id) {
          const translations = await tx
            .select()
            .from(s.contentTranslations)
            .where(
              and(
                eq(s.contentTranslations.entity, 'page_block'),
                eq(s.contentTranslations.entityId, existing.id),
              ),
            );
          if (translations.length)
            await tx.insert(s.contentTranslations).values(
              translations.map(({ id: _id, ...value }) => ({
                ...value,
                entityId: id,
              })),
            );
        }
        await recordHumanFields(tx, 'page_block', id, row.data, existing?.data);
        if (b.publish)
          await requireCoreCopy(tx, [
            { entity: 'page_block', id, copy: row.data },
          ]);
      }
      await recordChange(
        tx,
        c,
        cfg,
        'page_blocks',
        randomUUID(),
        { key, blocks: before },
        b,
        'update',
        ['page:' + key, 'site'],
      );
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/i18n/settings', auth.guard('languages'), async (c) => {
    const rows = await db
      .select()
      .from(s.settings)
      .where(inArray(s.settings.key, ['i18n', 'i18n_runtime']));
    const month = new Date().toISOString().slice(0, 7),
      usage = await db
        .select()
        .from(s.translationUsage)
        .where(eq(s.translationUsage.month, month));
    return c.json({
      ...Object.fromEntries(rows.map((r) => [r.key, r.value])),
      usage: {
        month,
        characters: usage.reduce((sum, row) => sum + row.characters, 0),
      },
    });
  });
  app.put('/v1/admin/i18n/settings', auth.guard('languages'), async (c) => {
    const b = await parse(
      c,
      z.strictObject({
        auto: z
          .array(z.string().regex(/^[a-z]{2,3}$/))
          .max(200)
          .refine((v) => !v.some(isCoreLocale) && new Set(v).size === v.length),
        auto_live_min_coverage: z.number().min(0.95).max(1),
        indexable_auto: z.boolean(),
        free_tier_only: z.boolean(),
        monthly_char_budget: z.number().int().min(0).max(10000000),
      }),
    );
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.settings)
        .where(eq(s.settings.key, 'i18n'))
        .for('update');
      const value = { ...obj(before?.value), ...b, core: locales };
      await tx
        .insert(s.settings)
        .values({ key: 'i18n', value, updatedBy: c.get('principal').id })
        .onConflictDoUpdate({
          target: s.settings.key,
          set: {
            value,
            updatedAt: new Date(),
            updatedBy: c.get('principal').id,
          },
        });
      for (const locale of b.auto)
        await tx
          .insert(s.outbox)
          .values({ name: 'i18n.backfill_locale', data: { locale } });
      await recordChange(
        tx,
        c,
        cfg,
        'settings',
        randomUUID(),
        { key: 'i18n', value: before?.value ?? null },
        { key: 'i18n', value },
        'update',
        ['locales', 'site'],
      );
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/i18n/glossary', auth.guard('translations'), async (c) =>
    c.json(
      (
        await db
          .select()
          .from(s.settings)
          .where(eq(s.settings.key, 'i18n_glossary'))
      )[0]?.value ?? [],
    ),
  );
  app.put('/v1/admin/i18n/glossary', auth.guard('languages'), async (c) => {
    const b = await parse(
      c,
      z.strictObject({ terms: z.array(z.string().min(1).max(120)).max(300) }),
    );
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(s.settings)
        .where(eq(s.settings.key, 'i18n_glossary'));
      await tx
        .insert(s.settings)
        .values({ key: 'i18n_glossary', value: b.terms })
        .onConflictDoUpdate({
          target: s.settings.key,
          set: {
            value: b.terms,
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
        { key: 'i18n_glossary', value: before?.value ?? [] },
        { key: 'i18n_glossary', value: b.terms },
      );
    });
    return c.json({ ok: true });
  });
  app.get('/v1/admin/i18n/coverage', auth.guard('languages'), async (c) => {
    const rows = await db
      .select()
      .from(s.settings)
      .where(eq(s.settings.key, 'i18n_runtime'));
    return c.json(
      rows[0]?.value ?? { providers_available: false, coverage: {} },
    );
  });
  app.get('/v1/admin/i18n/queue', auth.guard('translations'), async (c) => {
    const p = z
      .strictObject({
        locale: z.string().regex(/^[a-z]{2,3}$/),
        entity: z
          .enum([
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
          ])
          .optional(),
      })
      .safeParse(c.req.query());
    if (!p.success) fail(422, 'INVALID_QUERY');
    const { publicTranslationFields } = await import('./translate');
    const fields = await publicTranslationFields(db, cfg);
    const rows = await db
      .select()
      .from(s.contentTranslations)
      .where(eq(s.contentTranslations.locale, p.data.locale));
    const drafts = await db
      .select()
      .from(s.contentDrafts)
      .where(eq(s.contentDrafts.entity, 'translation'));
    // Human-readable "where": the owning item's title and admin link target.
    const [
      tripRows,
      childRows,
      collectionRows,
      slideRows,
      mediaRows,
      faqRows,
      blockRows,
    ] = await Promise.all([
      db
        .select({ id: s.trips.id, title: s.trips.title, kind: s.trips.kind })
        .from(s.trips),
      db.execute<{ id: string; trip_id: string }>(
        sql`select id::text, trip_id::text from trip_items union all select id::text, trip_id::text from trip_prices union all select id::text, trip_id::text from trip_itinerary`,
      ),
      db
        .select({ id: s.collections.id, name: s.collections.name })
        .from(s.collections),
      db
        .select({
          id: s.heroSlides.id,
          headline: s.heroSlides.headline,
          collectionId: s.heroSlides.collectionId,
        })
        .from(s.heroSlides),
      db.select({ id: s.media.id, alt: s.media.alt }).from(s.media),
      db.select({ id: s.faqs.id, q: s.faqs.q }).from(s.faqs),
      db
        .select({ id: s.pageBlocks.id, pageKey: s.pageBlocks.pageKey })
        .from(s.pageBlocks),
    ]);
    const parentOf = new Map(childRows.rows.map((r) => [r.id, r.trip_id]));
    const where = (entity: string, id: string) => {
      if (['trip', 'trip_item', 'trip_price', 'itinerary'].includes(entity)) {
        const tripId = entity === 'trip' ? id : parentOf.get(id);
        const trip = tripRows.find((t) => t.id === tripId);
        return {
          parentId: tripId ?? null,
          parentKind: trip?.kind ?? 'trip',
          itemTitle: trip?.title ?? null,
        };
      }
      if (entity === 'collection')
        return {
          parentId: id,
          parentKind: 'collection',
          itemTitle: collectionRows.find((r) => r.id === id)?.name ?? null,
        };
      if (entity === 'hero_slide') {
        const slide = slideRows.find((r) => r.id === id);
        return {
          parentId: id,
          parentKind: 'hero_slide',
          itemTitle:
            slide?.headline ??
            collectionRows.find((r) => r.id === slide?.collectionId)?.name ??
            null,
        };
      }
      if (entity === 'media')
        return {
          parentId: id,
          parentKind: 'media',
          itemTitle: mediaRows.find((r) => r.id === id)?.alt ?? null,
        };
      if (entity === 'faq')
        return {
          parentId: id,
          parentKind: 'faq',
          itemTitle: faqRows.find((r) => r.id === id)?.q ?? null,
        };
      if (entity === 'page_block')
        return {
          parentId: blockRows.find((r) => r.id === id)?.pageKey ?? null,
          parentKind: 'page',
          itemTitle: null,
        };
      return { parentId: null, parentKind: entity, itemTitle: null };
    };
    return c.json(
      fields
        .filter((f) => !p.data.entity || p.data.entity === f.entity)
        .flatMap((f) => {
          if (f.entity === 'ui' && isCoreLocale(p.data.locale)) {
            const dictionary: Record<string, string> =
              coreWebMessages[p.data.locale];
            return [
              {
                entity: f.entity,
                id: f.id,
                field: f.field,
                source: f.en,
                ...where(f.entity, f.id),
                value: dictionary[f.field] ?? '',
                state: 'repository',
              },
            ];
          }
          const row = rows.find(
            (r) =>
              r.entity === f.entity &&
              r.entityId === f.id &&
              r.field === f.field,
          );
          const stale = !!row && row.sourceHash !== sha(f.en);
          const human = f.human[p.data.locale];
          const draft = drafts.find((row) => {
            const value = obj(row.data);
            return (
              value.locale === p.data.locale &&
              value.entity === f.entity &&
              value.id === f.id &&
              value.field === f.field
            );
          });
          if (human && !stale && !draft) return [];
          return [
            {
              entity: f.entity,
              id: f.id,
              field: f.field,
              source: f.en,
              ...where(f.entity, f.id),
              value: draft ? obj(draft.data).text : (human ?? row?.text ?? ''),
              state: draft
                ? 'draft'
                : stale
                  ? 'stale'
                  : (row?.origin ?? 'empty'),
            },
          ];
        }),
    );
  });
  app.post(
    '/v1/admin/i18n/translate',
    auth.guard('translations'),
    async (c) => {
      const b = await parse(
        c,
        z.strictObject({
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
            'itinerary',
          ]),
          id: z.string().max(120),
          fields: z.array(z.string().max(120)).max(100).optional(),
          locale: z.string().regex(/^[a-z]{2,3}$/),
        }),
      );
      if (isCoreLocale(b.locale)) fail(422, 'INVALID_LOCALE');
      await db
        .insert(s.outbox)
        .values({ name: 'i18n.translate_entity', data: b });
      return c.json({ queued: true }, 202);
    },
  );
  app.post(
    '/v1/admin/i18n/backfill/:locale',
    auth.guard('languages'),
    async (c) => {
      const locale = c.req.param('locale');
      if (!/^[a-z]{2,3}$/.test(locale) || isCoreLocale(locale))
        fail(422, 'INVALID_LOCALE');
      await db
        .insert(s.outbox)
        .values({ name: 'i18n.backfill_locale', data: { locale } });
      return c.json({ queued: true }, 202);
    },
  );
  registerBulkAndRestore(app, db, cfg, auth);
}
function registerBulkAndRestore(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  const previewSchema = z.strictObject({
    collectionId: z.uuid().optional(),
    tripIds: z.array(z.uuid()).min(1).max(200).optional(),
    mode: z.enum(['percent', 'amount']),
    value: z.number().min(-10000).max(10000),
    /** Round results to the nearest €1 (default) or €5. */
    round: z.union([z.literal(0), z.literal(1), z.literal(5)]).default(1),
  });
  const rowLimit = 5000;
  const tripLimit = 200;
  const payloadSchema = z.strictObject({
    user: z.uuid(),
    expires: z.number(),
    input: previewSchema,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  });
  type PreviewInput = z.infer<typeof previewSchema>;
  const priceRows = (reader: Pick<Database, 'select'>, input: PreviewInput) =>
    reader
      .select({
        id: s.tripPrices.id,
        tripId: s.tripPrices.tripId,
        amount: s.tripPrices.amountEur,
        slug: s.trips.slug,
      })
      .from(s.tripPrices)
      .innerJoin(s.trips, eq(s.trips.id, s.tripPrices.tripId))
      .where(
        and(
          isNull(s.trips.archivedAt),
          isNotNull(s.tripPrices.amountEur),
          input.collectionId
            ? eq(s.trips.collectionId, input.collectionId)
            : undefined,
          input.tripIds ? inArray(s.trips.id, input.tripIds) : undefined,
        ),
      )
      .orderBy(s.tripPrices.id)
      .limit(rowLimit + 1);
  type PriceRows = Awaited<ReturnType<typeof priceRows>>;
  const oversized = (rows: PriceRows) =>
    rows.length > rowLimit ||
    new Set(rows.map(({ tripId }) => tripId)).size > tripLimit;
  const fingerprint = (rows: PriceRows) =>
    sha(
      JSON.stringify(
        rows.map(({ id, tripId, amount }) => [id, tripId, amount]),
      ),
    );
  const adjustment = (rows: PriceRows, input: PreviewInput) =>
    rows.map(({ id, tripId, amount }) => {
      const before = Number(amount);
      const raw =
        input.mode === 'percent'
          ? before * (1 + input.value / 100)
          : before + input.value;
      const step = input.round || 0.01;
      const after = Math.max(
        0,
        Number((Math.round(raw / step) * step).toFixed(2)),
      );
      if (after > 99999999) fail(422, 'INVALID_PRICE');
      return { id, tripId, before, after };
    });
  const large = (a: number, b: number) =>
    a === 0 ? b !== 0 : Math.abs(b - a) / a > 0.4;
  app.post('/v1/admin/prices/bulk/preview', auth.guard('prices'), async (c) => {
    const input = await auth.parse(c, previewSchema);
    const current = await priceRows(db, input);
    if (oversized(current)) fail(422, 'PREVIEW_TOO_LARGE');
    const rows = adjustment(current, input);
    const payload = {
      user: c.get('principal').id,
      expires: Date.now() + 300000,
      input,
      fingerprint: fingerprint(current),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url'),
      signature = signPurpose('bulk-prices', encoded, cfg.SESSION_SECRET);
    return c.json({
      rows,
      requires_confirmation: rows.some((row) => large(row.before, row.after)),
      token: encoded + '.' + signature,
    });
  });
  app.post('/v1/admin/prices/bulk/apply', auth.guard('prices'), async (c) => {
    const b = await auth.parse(
        c,
        z.strictObject({
          token: z.string().max(120000),
          confirmLargeChange: z.boolean().optional(),
        }),
      ),
      [encoded, signature, ...extra] = b.token.split('.');
    if (
      !encoded ||
      !signature ||
      extra.length ||
      !equal(signature, signPurpose('bulk-prices', encoded, cfg.SESSION_SECRET))
    )
      fail(422, 'INVALID_PREVIEW');
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    } catch {
      fail(422, 'INVALID_PREVIEW');
    }
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) fail(422, 'INVALID_PREVIEW');
    const p = parsed.data;
    if (p.user !== c.get('principal').id || p.expires < Date.now())
      fail(409, 'PREVIEW_EXPIRED');
    await db.transaction(async (tx) => {
      const current = await priceRows(tx, p.input).for('update');
      if (oversized(current) || fingerprint(current) !== p.fingerprint)
        fail(409, 'PREVIEW_STALE');
      const changed = adjustment(current, p.input).filter(
        (row) => row.before !== row.after,
      );
      if (
        changed.some((row) => large(row.before, row.after)) &&
        !b.confirmLargeChange
      )
        fail(409, 'PRICE_CONFIRMATION_REQUIRED');
      if (!changed.length) return;

      const byTrip = new Map<string, typeof changed>();
      for (const row of changed) {
        const entries = byTrip.get(row.tripId) ?? [];
        entries.push(row);
        byTrip.set(row.tripId, entries);
      }
      // Include unpriced rows in each undo snapshot.
      const before = await tx
        .select()
        .from(s.tripPrices)
        .where(inArray(s.tripPrices.tripId, [...byTrip.keys()]))
        .for('update');
      await tx.execute(sql`
        update ${s.tripPrices} as price set amount_eur = changed.amount
        from jsonb_to_recordset(${JSON.stringify(changed.map((row) => ({ id: row.id, amount: row.after })))}::jsonb)
          as changed(id uuid, amount numeric)
        where price.id = changed.id
      `);
      const slugs = new Map(current.map((row) => [row.tripId, row.slug]));
      for (const [id, rows] of byTrip)
        await recordChange(
          tx,
          c,
          cfg,
          'trip_prices',
          id,
          before.filter((row) => row.tripId === id),
          rows,
          'bulk_prices',
          [],
        );
      await tx.insert(s.outbox).values({
        name: 'revalidate.web',
        data: {
          tags: [...byTrip.keys()].map((id) => 'trip:' + slugs.get(id)!),
        },
      });
    });
    return c.json({ ok: true });
  });
  app.post('/v1/admin/revisions/:id/restore', async (c) => {
    const parsed = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(c.req.param('id'));
    if (!parsed.success) fail(422, 'INVALID_ID');
    const b = await auth.parse(
      c,
      z.strictObject({ confirmLargeChange: z.boolean().optional() }),
    );
    await db.transaction(async (tx) => {
      // Serialize repeated restores without granting write access to history.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${'restore-revision:' + parsed.data}, 0))`,
      );
      const [revision] = await tx
        .select()
        .from(s.revisions)
        .where(eq(s.revisions.id, parsed.data));
      if (!revision) fail(404, 'NOT_FOUND');
      const value = obj(revision.snapshot),
        id = revision.entityId,
        role = c.get('principal').role;
      const map: Record<string, Permission> = {
        translation_draft: 'translations',
        translation: 'translations',
        trip: 'content',
        trip_prices: 'prices',
        trip_itinerary: 'content',
        trip_items: 'content',
        trip_media: 'content',
        trip_order: 'content',
        collection: 'content',
        collection_order: 'publish',
        hero_slide: 'heroDraft',
        hero_order: 'heroLive',
        faq: 'content',
        page_blocks: 'content',
        package: 'content',
        request: 'requests',
        media: 'content',
        settings: String(value.key).startsWith('i18n')
          ? 'languages'
          : ['home', 'how_steps'].includes(String(value.key))
            ? 'publish'
            : value.key === 'homepage_draft'
              ? 'content'
              : 'settings',
      };
      const permission = map[revision.entity];
      if (!permission || !can(role, permission)) fail(403, 'FORBIDDEN');
      if (revision.entity === 'settings' && permission === 'settings')
        auth.recent(c);
      let current: unknown = null;
      if (revision.entity === 'translation_draft') {
        const where = and(
          eq(s.contentDrafts.entity, 'translation'),
          eq(s.contentDrafts.entityId, id),
          eq(s.contentDrafts.section, 'review'),
        );
        current =
          (await tx.select().from(s.contentDrafts).where(where))[0] ?? null;
        await tx.delete(s.contentDrafts).where(where);
        if (revision.snapshot !== null)
          await tx.insert(s.contentDrafts).values({
            entity: 'translation',
            entityId: id,
            section: 'review',
            data: obj(revision.snapshot).data,
            createdBy: c.get('principal').id,
          });
      } else if (revision.entity === 'translation') {
        if (role === 'editor') fail(403, 'DRAFT_ONLY');
        current = await restoreTranslation(tx, revision.snapshot);
        await revalidateTranslations(
          tx,
          String(obj(current).target && obj(obj(current).target).locale),
        );
      } else if (revision.entity === 'trip_prices') {
        const [trip] = await tx
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, id))
          .for('update');
        if (!trip) fail(404, 'NOT_FOUND');
        const rows = await tx
          .select()
          .from(s.tripPrices)
          .where(eq(s.tripPrices.tripId, id))
          .for('update');
        current = rows;
        const restored = z
          .array(priceRowSchema.extend({ sort: z.number().int() }))
          .parse(
            (Array.isArray(revision.snapshot) ? revision.snapshot : []).map(
              (p) => {
                const r = obj(p);
                return {
                  id: r.id,
                  label: r.label,
                  amountEur: r.amountEur === null ? null : Number(r.amountEur),
                  unit: r.unit,
                  minQty: r.minQty,
                  maxQty: r.maxQty,
                  isPrimary: r.isPrimary,
                  validFrom: r.validFrom,
                  validTo: r.validTo,
                  sort: r.sort,
                };
              },
            ),
          );
        if (
          restored.some((r) => {
            const before = rows.find((p) => p.id === r.id);
            return (
              r.amountEur !== null &&
              before?.amountEur !== null &&
              before?.amountEur !== undefined &&
              large(Number(before.amountEur), r.amountEur)
            );
          }) &&
          !b.confirmLargeChange
        )
          fail(409, 'PRICE_CONFIRMATION_REQUIRED');
        await tx.delete(s.tripPrices).where(eq(s.tripPrices.tripId, id));
        if (restored.length)
          await tx.insert(s.tripPrices).values(
            restored.map((r) => ({
              ...r,
              tripId: id,
              amountEur: r.amountEur === null ? null : String(r.amountEur),
            })),
          );
      } else if (revision.entity === 'trip') {
        const [trip] = await tx
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, id))
          .for('update');
        if (!trip) fail(404, 'NOT_FOUND');
        if (role === 'editor' && trip.status === 'published')
          fail(403, 'DRAFT_ONLY');
        const section = String(value.section),
          values = obj(value.values);
        current = {
          section,
          values:
            section === 'status'
              ? { status: trip.status }
              : project(
                  section === 'basics'
                    ? basicsSchema
                    : section === 'schedule'
                      ? scheduleSchema
                      : seoSchema,
                  trip,
                ),
        };
        if (section === 'publication') {
          if (!can(role, 'publish')) fail(403, 'FORBIDDEN');
          current = await tripSnapshot(tx, id);
          await restorePublication(
            tx,
            id,
            value,
            b.confirmLargeChange === true,
          );
          if (obj(value.trip).status === 'published')
            await canPublishTrip(tx, id);
        } else if (section === 'archive') {
          current = {
            section: 'archive',
            values: { archivedAt: trip.archivedAt },
          };
          const archivedAt = z
            .string()
            .datetime()
            .nullable()
            .parse(values.archivedAt);
          await tx
            .update(s.trips)
            .set({
              archivedAt: archivedAt ? new Date(archivedAt) : null,
              updatedAt: new Date(),
            })
            .where(eq(s.trips.id, id));
        } else if (section === 'status') {
          if (!can(role, 'publish')) fail(403, 'FORBIDDEN');
          const status = z
            .enum(['draft', 'published', 'hidden'])
            .parse(values.status);
          if (status === 'published') {
            const media = await tx
              .select()
              .from(s.tripMedia)
              .where(eq(s.tripMedia.tripId, id));
            await usableMedia(
              tx,
              media.map((r) => r.mediaId),
            );
          }
          await tx
            .update(s.trips)
            .set({ status, updatedAt: new Date() })
            .where(eq(s.trips.id, id));
        } else if (section === 'basics') {
          const normalized = {
            ...values,
            ...(values.privateSurchargePct !== undefined &&
            values.privateSurchargePct !== null
              ? { privateSurchargePct: Number(values.privateSurchargePct) }
              : {}),
          };
          const r = basicsSchema.parse(normalized);
          if (r.privateSurchargePct !== undefined && !can(role, 'prices'))
            fail(403, 'FORBIDDEN');
          await tx
            .update(s.trips)
            .set({
              ...r,
              privateSurchargePct:
                r.privateSurchargePct === undefined
                  ? undefined
                  : r.privateSurchargePct === null
                    ? null
                    : String(r.privateSurchargePct),
              updatedAt: new Date(),
            })
            .where(eq(s.trips.id, id));
        } else if (section === 'schedule')
          await tx
            .update(s.trips)
            .set({ ...scheduleSchema.parse(values), updatedAt: new Date() })
            .where(eq(s.trips.id, id));
        else if (section === 'seo')
          await tx
            .update(s.trips)
            .set({ ...seoSchema.parse(values), updatedAt: new Date() })
            .where(eq(s.trips.id, id));
        else fail(422, 'RESTORE_UNSUPPORTED');
      } else if (
        ['trip_itinerary', 'trip_items', 'trip_media'].includes(revision.entity)
      ) {
        const [trip] = await tx
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, id))
          .for('update');
        if (!trip) fail(404, 'NOT_FOUND');
        if (role === 'editor' && trip.status === 'published')
          fail(403, 'DRAFT_ONLY');
        const rows = z
          .array(z.record(z.string(), z.unknown()))
          .parse(revision.snapshot);
        if (revision.entity === 'trip_itinerary') {
          current = await tx
            .select()
            .from(s.tripItinerary)
            .where(eq(s.tripItinerary.tripId, id));
          await tx
            .delete(s.tripItinerary)
            .where(eq(s.tripItinerary.tripId, id));
          for (const r of rows)
            await tx.insert(s.tripItinerary).values({
              tripId: id,
              timeLabel: z.string().nullable().parse(r.timeLabel),
              text: localizedSchema.parse(r.text),
              sort: z.number().int().parse(r.sort),
            });
        } else if (revision.entity === 'trip_items') {
          current = await tx
            .select()
            .from(s.tripItems)
            .where(eq(s.tripItems.tripId, id));
          await tx.delete(s.tripItems).where(eq(s.tripItems.tripId, id));
          for (const r of rows)
            await tx.insert(s.tripItems).values({
              tripId: id,
              type: z
                .enum(['include', 'exclude', 'optional', 'bring', 'highlight'])
                .parse(r.type),
              text: localizedSchema.parse(r.text),
              extraPriceEur:
                r.extraPriceEur === null ? null : String(r.extraPriceEur),
              sort: z.number().int().parse(r.sort),
            });
        } else {
          if (trip.status === 'published')
            await usableMedia(
              tx,
              rows.map((r) => z.uuid().parse(r.mediaId)),
            );
          current = await tx
            .select()
            .from(s.tripMedia)
            .where(eq(s.tripMedia.tripId, id));
          await tx.delete(s.tripMedia).where(eq(s.tripMedia.tripId, id));
          for (const r of rows)
            await tx.insert(s.tripMedia).values({
              tripId: id,
              mediaId: z.uuid().parse(r.mediaId),
              role: z.enum(['cover', 'gallery', 'video']).parse(r.role),
              sort: z.number().int().parse(r.sort),
            });
        }
      } else if (revision.entity === 'collection') {
        const [row] = await tx
          .select()
          .from(s.collections)
          .where(eq(s.collections.id, id))
          .for('update');
        if (!row) fail(404, 'NOT_FOUND');
        if (role === 'editor' && row.status === 'published')
          fail(403, 'DRAFT_ONLY');
        current = row;
        const r = collectionEditSchema.parse(
          project(collectionEditSchema, { ...value, perks: value.perks ?? [] }),
        );
        const status = z
          .enum(['draft', 'published'])
          .parse(value.status ?? row.status);
        if (status === 'published') {
          if (!can(role, 'publish')) fail(403, 'FORBIDDEN');
          await usableMedia(tx, [r.coverMediaId, r.heroVideoId]);
        }
        await tx
          .update(s.collections)
          .set({
            ...r,
            status,
            archivedAt: value.archivedAt
              ? new Date(String(value.archivedAt))
              : null,
            updatedAt: new Date(),
          })
          .where(eq(s.collections.id, id));
      } else if (revision.entity === 'hero_slide') {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('hero-publish'))`,
        );
        const [row] = await tx
          .select()
          .from(s.heroSlides)
          .where(eq(s.heroSlides.id, id))
          .for('update');
        if (!row) fail(404, 'NOT_FOUND');
        if (
          role === 'editor' &&
          (row.status === 'published' || value.status === 'published')
        )
          fail(403, 'DRAFT_ONLY');
        current = row;
        const r = heroSchema.parse(project(heroSchema, value));
        const status = z
          .enum(['draft', 'published'])
          .parse(value.status ?? row.status);
        if (status === 'published') {
          await usableMedia(tx, [r.videoMediaId, r.imageMediaId]);
          const live = await tx
            .select()
            .from(s.heroSlides)
            .where(
              and(
                eq(s.heroSlides.status, 'published'),
                isNull(s.heroSlides.archivedAt),
              ),
            );
          if (row.status !== 'published' && live.length >= 10)
            fail(409, 'HERO_LIMIT');
        }
        await tx
          .update(s.heroSlides)
          .set({
            ...r,
            startsAt: r.startsAt ? new Date(r.startsAt) : null,
            endsAt: r.endsAt ? new Date(r.endsAt) : null,
            status,
            archivedAt: value.archivedAt
              ? new Date(String(value.archivedAt))
              : null,
            updatedAt: new Date(),
          })
          .where(eq(s.heroSlides.id, id));
      } else if (revision.entity.endsWith('_order')) {
        const rows = z
          .array(
            z.strictObject({ id: z.uuid(), sort: z.number().int().min(0) }),
          )
          .parse(revision.snapshot);
        const table =
          revision.entity === 'hero_order'
            ? s.heroSlides
            : revision.entity === 'collection_order'
              ? s.collections
              : s.trips;
        current = (
          await tx
            .select()
            .from(table)
            .where(
              inArray(
                table.id,
                rows.map((r) => r.id),
              ),
            )
            .for('update')
        ).map((r) => ({ id: r.id, sort: r.sort }));
        for (const row of rows)
          await tx
            .update(table)
            .set({ sort: row.sort })
            .where(eq(table.id, row.id));
      } else if (revision.entity === 'request') {
        const [row] = await tx
          .select()
          .from(s.bookingRequests)
          .where(eq(s.bookingRequests.id, id))
          .for('update');
        if (!row) fail(404, 'NOT_FOUND');
        if (row.anonymizedAt) fail(409, 'REQUEST_ANONYMIZED');
        current = project(requestPatchSchema, row);
        await tx
          .update(s.bookingRequests)
          .set({ ...requestPatchSchema.parse(value), updatedAt: new Date() })
          .where(eq(s.bookingRequests.id, id));
      } else if (revision.entity === 'settings') {
        const key = z
          .enum([
            'contacts',
            'address',
            'hours',
            'legal_entity',
            'pickup_areas',
            'social',
            'request_rules',
            'i18n',
            'i18n_glossary',
            'home',
            'how_steps',
            'homepage_draft',
          ])
          .parse(value.key);
        const [row] = await tx
          .select()
          .from(s.settings)
          .where(eq(s.settings.key, key))
          .for('update');
        current = { key, value: row?.value ?? null };
        await tx
          .insert(s.settings)
          .values({
            key,
            value: value.value == null ? sql`'null'::jsonb` : value.value,
            updatedBy: c.get('principal').id,
          })
          .onConflictDoUpdate({
            target: s.settings.key,
            set: {
              value: value.value == null ? sql`'null'::jsonb` : value.value,
              updatedAt: new Date(),
              updatedBy: c.get('principal').id,
            },
          });
      } else if (revision.entity === 'faq') {
        const [row] = await tx
          .select()
          .from(s.faqs)
          .where(eq(s.faqs.id, id))
          .for('update');
        if (!row) fail(404, 'NOT_FOUND');
        if (role === 'editor' && row.status === 'published')
          fail(403, 'DRAFT_ONLY');
        const status = z
          .enum(['draft', 'published'])
          .parse(value.status ?? 'draft');
        if (status === 'published' && !can(role, 'publish'))
          fail(403, 'FORBIDDEN');
        current = row;
        markdownSafe(value);
        await tx
          .update(s.faqs)
          .set({
            q: localizedSchema.parse(value.q),
            a: localizedSchema.parse(value.a),
            sort: z.number().int().parse(value.sort),
            status,
            archivedAt: value.archivedAt
              ? new Date(String(value.archivedAt))
              : null,
          })
          .where(eq(s.faqs.id, id));
      } else if (revision.entity === 'page_blocks') {
        const key = z
            .enum(['home', 'contact', 'terms', 'privacy', 'cancellation'])
            .parse(value.key),
          rows = z.array(z.record(z.string(), z.unknown())).parse(value.blocks);
        if (rows.some((r) => r.status === 'published') && !can(role, 'publish'))
          fail(403, 'FORBIDDEN');
        markdownSafe(rows);
        current = {
          key,
          blocks: await tx
            .select()
            .from(s.pageBlocks)
            .where(eq(s.pageBlocks.pageKey, key)),
        };
        await tx.delete(s.pageBlocks).where(eq(s.pageBlocks.pageKey, key));
        for (const r of rows)
          await tx.insert(s.pageBlocks).values({
            pageKey: key,
            type: z.string().max(80).parse(r.type),
            data: r.data,
            sort: z.number().int().parse(r.sort),
            status: z.enum(['draft', 'published']).parse(r.status),
          });
      } else if (revision.entity === 'package') {
        const [row] = await tx
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, id))
          .for('update');
        if (!row || row.kind !== 'package') fail(404, 'NOT_FOUND');
        if (role === 'editor' && row.status === 'published')
          fail(403, 'DRAFT_ONLY');
        current = {
          trip: row,
          parts: await tx
            .select()
            .from(s.packageItems)
            .where(eq(s.packageItems.packageId, id)),
        };
        if (value.trip === null) {
          await tx
            .update(s.trips)
            .set({ status: 'draft', archivedAt: new Date() })
            .where(eq(s.trips.id, id));
        } else {
          const p = obj(value.trip),
            status = z.enum(['draft', 'published', 'hidden']).parse(p.status);
          if (status === 'published' && !can(role, 'publish'))
            fail(403, 'FORBIDDEN');
          await tx
            .update(s.trips)
            .set({
              title: localizedSchema.parse(p.title),
              summary:
                p.summary === null ? null : localizedSchema.parse(p.summary),
              slug: z
                .string()
                .regex(/^[a-z0-9-]{1,120}$/)
                .parse(p.slug),
              daysCount: z.number().int().min(1).max(120).parse(p.daysCount),
              status,
              updatedAt: new Date(),
            })
            .where(eq(s.trips.id, id));
          await tx
            .delete(s.packageItems)
            .where(eq(s.packageItems.packageId, id));
          for (const part of z.array(z.unknown()).parse(value.parts)) {
            const r = obj(part);
            await tx.insert(s.packageItems).values({
              packageId: id,
              tripId: z.uuid().parse(r.tripId),
              dayIndex: z.number().int().min(1).nullable().parse(r.dayIndex),
              sort: z.number().int().parse(r.sort),
            });
          }
          if (status === 'published') await canPublishTrip(tx, id);
        }
      } else if (revision.entity === 'media') {
        const [row] = await tx
          .select()
          .from(s.media)
          .where(eq(s.media.id, id))
          .for('update');
        if (!row) fail(404, 'NOT_FOUND');
        current = {
          alt: row.alt,
          credit: row.credit,
          license: row.license,
          rightsStatus: row.rightsStatus,
          focalX: Number(row.focalX),
          focalY: Number(row.focalY),
          autoEnhance: row.autoEnhance,
          trimStart: row.trimStart,
          trimEnd: row.trimEnd,
          posterTime: row.posterTime,
          archivedAt: row.archivedAt,
        };
        if (value.rightsStatus === 'unknown') {
          const used = await tx.execute(
            sql`select 1 from trip_media tm join trips t on t.id=tm.trip_id where tm.media_id=${id} and t.status='published' union all select 1 from trips where status='published' and story->'scenes' @> jsonb_build_array(jsonb_build_object('mediaId',${id}::text)) union all select 1 from collections where status='published' and (cover_media_id=${id} or hero_video_id=${id}) union all select 1 from hero_slides where status='published' and (image_media_id=${id} or video_media_id=${id}) limit 1`,
          );
          if (used.rows.length) fail(409, 'MEDIA_IN_USE');
        }
        await tx
          .update(s.media)
          .set({
            ...(value.alt !== undefined
              ? {
                  alt:
                    value.alt === null
                      ? null
                      : localizedSchema.parse(value.alt),
                }
              : {}),
            ...(value.credit !== undefined
              ? { credit: z.string().nullable().parse(value.credit) }
              : {}),
            ...(value.license !== undefined
              ? { license: z.string().nullable().parse(value.license) }
              : {}),
            ...(value.rightsStatus !== undefined
              ? {
                  rightsStatus: z
                    .enum(['owned', 'licensed', 'permission', 'unknown'])
                    .parse(value.rightsStatus),
                }
              : {}),
            ...(value.focalX !== undefined
              ? {
                  focalX: String(
                    z.coerce.number().min(0).max(1).parse(value.focalX),
                  ),
                }
              : {}),
            ...(value.focalY !== undefined
              ? {
                  focalY: String(
                    z.coerce.number().min(0).max(1).parse(value.focalY),
                  ),
                }
              : {}),
            ...(value.autoEnhance !== undefined
              ? { autoEnhance: z.boolean().parse(value.autoEnhance) }
              : {}),
            ...(value.archivedAt !== undefined
              ? {
                  archivedAt: value.archivedAt
                    ? new Date(String(value.archivedAt))
                    : null,
                }
              : {}),
            ...(value.trimStart !== undefined
              ? {
                  trimStart:
                    value.trimStart === null ? null : String(value.trimStart),
                }
              : {}),
            ...(value.trimEnd !== undefined
              ? {
                  trimEnd:
                    value.trimEnd === null ? null : String(value.trimEnd),
                }
              : {}),
            ...(value.posterTime !== undefined
              ? {
                  posterTime:
                    value.posterTime === null ? null : String(value.posterTime),
                }
              : {}),
            status: 'processing',
          })
          .where(eq(s.media.id, id));
        await tx
          .insert(s.outbox)
          .values({ name: 'media.process', data: { mediaId: id } });
      } else fail(422, 'RESTORE_UNSUPPORTED');
      // Request audit entries intentionally omit customer and internal-note values.
      if (revision.entity === 'request') {
        await tx.insert(s.revisions).values({
          entity: 'request',
          entityId: id,
          snapshot: current,
          createdBy: c.get('principal').id,
        });
        await tx.insert(s.auditLog).values({
          userId: c.get('principal').id,
          action: 'restore',
          entity: 'request',
          entityId: id,
          after: { revision: revision.id },
        });
      } else
        await recordChange(
          tx,
          c,
          cfg,
          revision.entity,
          id,
          current,
          revision.snapshot,
          'restore',
          ['site', 'collections', 'locales', 'faq'],
        );
    });
    return c.json({ ok: true });
  });
}
