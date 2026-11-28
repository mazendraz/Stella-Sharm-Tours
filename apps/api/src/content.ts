import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  contentPageInput,
  publishProblems,
  type ContentKind,
} from '@stella/shared/content';
import type { ApiEnv } from './types';
import type { Config } from './config';
import type { authService } from './auth';
import type { loadCatalog } from './catalog';
import { can } from '@stella/shared/admin';
import { fail } from './errors';
import { requireCoreCopy } from './publication-languages';
import { clientIp } from './auth';
import { hashPrivate } from './requests';

type Catalog = Awaited<ReturnType<typeof loadCatalog>>;
type Row = typeof s.contentPages.$inferSelect;
const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugRe = /^[a-z0-9-]{1,120}$/;
const id = (value: string) => {
  if (!uuidRe.test(value)) fail(404, 'NOT_FOUND');
  return value;
};

/** Audit + site cache refresh. No revisions: Undo does not cover pages yet. */
async function audit(
  tx: Pick<Database, 'insert'>,
  c: Context<ApiEnv>,
  cfg: Config,
  action: string,
  pageId: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(s.auditLog).values({
    userId: c.get('principal').id,
    action,
    entity: 'content_page',
    entityId: pageId,
    before: before as object,
    after: after as object,
    ipHash: hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
  });
  await tx
    .insert(s.outbox)
    .values({ name: 'revalidate.web', data: { tags: ['content'] } });
}

/** Everything that blocks publication, in one list for the editor. */
async function blockers(db: Database, page: Row) {
  const problems: string[] = publishProblems({
    kind: page.kind as ContentKind,
    title: page.title,
    summary: page.summary,
    body: page.body,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    faqs: page.faqs,
    authorName: page.authorName,
    sources: page.sources,
    relatedTrips: page.relatedTrips,
  });
  if (page.relatedTrips.length) {
    const live = await db
      .select({ slug: s.trips.slug })
      .from(s.trips)
      .where(
        and(
          eq(s.trips.status, 'published'),
          isNull(s.trips.archivedAt),
          inArray(s.trips.slug, page.relatedTrips),
        ),
      );
    if (live.length !== page.relatedTrips.length)
      problems.push('relatedTripNotPublished');
  }
  try {
    await requireCoreCopy(db, [
      {
        entity: 'content_page',
        id: page.id,
        copy: {
          title: page.title,
          summary: page.summary,
          body: page.body,
          faqs: page.faqs,
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
        },
      },
    ]);
  } catch {
    problems.push('translationsMissing');
  }
  return problems;
}

export function registerContent(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
  catalog: (c: Context<ApiEnv>) => Promise<Catalog>,
) {
  const values = (b: ReturnType<typeof contentPageInput.parse>) => ({
    slug: b.slug,
    kind: b.kind,
    category: b.category ?? null,
    title: b.title,
    summary: b.summary ?? null,
    body: b.body ?? null,
    seoTitle: b.seoTitle ?? null,
    seoDescription: b.seoDescription ?? null,
    authorName: b.authorName ?? null,
    authorRole: b.authorRole ?? null,
    sources: b.sources ?? [],
    faqs: b.faqs ?? [],
    coverMediaId: b.coverMediaId ?? null,
    relatedTrips: b.relatedTrips ?? [],
    relatedPages: b.relatedPages ?? [],
    sort: b.sort ?? 0,
  });

  app.get('/v1/admin/content-pages', auth.guard('content'), async (c) => {
    const rows = await db
      .select()
      .from(s.contentPages)
      .where(isNull(s.contentPages.archivedAt))
      .orderBy(asc(s.contentPages.kind), asc(s.contentPages.sort));
    return c.json(
      await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          slug: r.slug,
          kind: r.kind,
          category: r.category,
          title: r.title,
          status: r.status,
          updatedAt: r.updatedAt,
          blockers: await blockers(db, r),
        })),
      ),
    );
  });

  app.get('/v1/admin/content-pages/:id', auth.guard('content'), async (c) => {
    const [row] = await db
      .select()
      .from(s.contentPages)
      .where(eq(s.contentPages.id, id(c.req.param('id'))));
    if (!row || row.archivedAt) fail(404, 'NOT_FOUND');
    return c.json({ page: row, blockers: await blockers(db, row) });
  });

  app.post('/v1/admin/content-pages', auth.guard('content'), async (c) => {
    const b = contentPageInput.parse(await c.req.json());
    const [exists] = await db
      .select({ id: s.contentPages.id })
      .from(s.contentPages)
      .where(eq(s.contentPages.slug, b.slug));
    if (exists) fail(409, 'SLUG_TAKEN');
    const row = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.contentPages)
        .values({ ...values(b), status: 'draft' })
        .returning();
      await audit(tx, c, cfg, 'create', row!.id, null, { slug: b.slug });
      return row!;
    });
    return c.json({ id: row.id }, 201);
  });

  app.put('/v1/admin/content-pages/:id', auth.guard('content'), async (c) => {
    const pageId = id(c.req.param('id')),
      b = contentPageInput.parse(await c.req.json());
    return c.json(
      await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(s.contentPages)
          .where(eq(s.contentPages.id, pageId))
          .for('update');
        if (!before || before.archivedAt) fail(404, 'NOT_FOUND');
        // Saving a published page changes the live site, which is a publish
        // decision: editors unpublish via an owner/manager first.
        if (
          before.status === 'published' &&
          !can(c.get('principal').role, 'publish')
        )
          fail(403, 'FORBIDDEN');
        if (b.slug !== before.slug) {
          const [taken] = await tx
            .select({ id: s.contentPages.id })
            .from(s.contentPages)
            .where(eq(s.contentPages.slug, b.slug));
          if (taken) fail(409, 'SLUG_TAKEN');
          // A live URL must not change silently.
          if (before.status === 'published') fail(409, 'UNPUBLISH_FIRST');
        }
        const [after] = await tx
          .update(s.contentPages)
          .set({ ...values(b), updatedAt: new Date() })
          .where(eq(s.contentPages.id, pageId))
          .returning();
        // A published page may only be saved while it still passes the
        // publication checks; otherwise unpublish first.
        if (after!.status === 'published') {
          const problems = await blockers(tx as unknown as Database, after!);
          if (problems.length) fail(422, 'PUBLISH_BLOCKED');
        }
        await audit(
          tx,
          c,
          cfg,
          'update',
          pageId,
          { slug: before.slug },
          {
            slug: after!.slug,
          },
        );
        return { ok: true };
      }),
    );
  });

  for (const action of ['publish', 'unpublish', 'archive'] as const)
    app.post(
      `/v1/admin/content-pages/:id/${action}`,
      auth.guard('publish'),
      async (c) => {
        const pageId = id(c.req.param('id'));
        const [page] = await db
          .select()
          .from(s.contentPages)
          .where(eq(s.contentPages.id, pageId));
        if (!page || page.archivedAt) fail(404, 'NOT_FOUND');
        if (action === 'publish') {
          const problems = await blockers(db, page);
          if (problems.length)
            return c.json(
              {
                error: { code: 'PUBLISH_BLOCKED', message: 'PUBLISH_BLOCKED' },
                problems,
              },
              422,
            );
        }
        await db.transaction(async (tx) => {
          await tx
            .update(s.contentPages)
            .set(
              action === 'publish'
                ? {
                    status: 'published',
                    publishedAt: page.publishedAt ?? new Date(),
                    updatedAt: new Date(),
                  }
                : action === 'unpublish'
                  ? { status: 'draft', updatedAt: new Date() }
                  : { status: 'draft', archivedAt: new Date() },
            )
            .where(eq(s.contentPages.id, pageId));
          await audit(
            tx,
            c,
            cfg,
            action,
            pageId,
            { status: page.status },
            {
              status: action === 'publish' ? 'published' : 'draft',
            },
          );
        });
        return c.json({ ok: true });
      },
    );

  // ---- Public ------------------------------------------------------------
  const published = () =>
    db
      .select()
      .from(s.contentPages)
      .where(
        and(
          eq(s.contentPages.status, 'published'),
          isNull(s.contentPages.archivedAt),
        ),
      )
      .orderBy(asc(s.contentPages.sort), desc(s.contentPages.publishedAt));

  app.get('/v1/public/content', async (c) => {
    const result = await catalog(c),
      rows = await published(),
      // Only published trips: trip pages use this to link back to guides.
      liveTrips = new Set(result.trips.map((x) => x.slug));
    return c.json(
      rows.map((r) => ({
        slug: r.slug,
        kind: r.kind,
        category: r.category,
        title: result.text('content_page', r.id, 'title', r.title)!,
        summary: result.text('content_page', r.id, 'summary', r.summary),
        cover: result.media(r.coverMediaId),
        related_trips: r.relatedTrips.filter((x) => liveTrips.has(x)),
        updated_at: r.updatedAt.toISOString(),
      })),
    );
  });

  app.get('/v1/public/content/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!slugRe.test(slug)) fail(404, 'NOT_FOUND');
    const result = await catalog(c),
      rows = await published(),
      page = rows.find((r) => r.slug === slug);
    if (!page) fail(404, 'NOT_FOUND');
    const t = (field: string, v: s.Localized | null) =>
      result.text('content_page', page.id, field, v);
    const liveTrips = new Set(result.trips.map((x) => x.slug));
    return c.json({
      slug: page.slug,
      kind: page.kind,
      category: page.category,
      title: t('title', page.title)!,
      summary: t('summary', page.summary),
      body: t('body', page.body),
      seo_title: t('seo_title', page.seoTitle),
      seo_description: t('seo_description', page.seoDescription),
      author: page.authorName
        ? { name: page.authorName, role: page.authorRole }
        : null,
      sources: page.sources,
      faqs: page.faqs.map((f, i) => ({
        q: t(`faqs[${i}].q`, f.q)!,
        a: t(`faqs[${i}].a`, f.a)!,
      })),
      cover: result.media(page.coverMediaId),
      related_trips: page.relatedTrips.filter((x) => liveTrips.has(x)),
      // Links work both ways: published pages that list this one are related
      // too (a destination page shows the guides that point to it).
      related_pages: [
        ...new Set([
          ...page.relatedPages,
          ...rows
            .filter((r) => r.relatedPages.includes(page.slug))
            .map((r) => r.slug),
        ]),
      ]
        .filter((rel) => rel !== page.slug)
        .slice(0, 12)
        .flatMap((rel) => {
          const r = rows.find((x) => x.slug === rel);
          return r
            ? [
                {
                  slug: r.slug,
                  kind: r.kind,
                  title: result.text('content_page', r.id, 'title', r.title)!,
                },
              ]
            : [];
        }),
      published_at: page.publishedAt?.toISOString() ?? null,
      updated_at: page.updatedAt.toISOString(),
    });
  });
}
