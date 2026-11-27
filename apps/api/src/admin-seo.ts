import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  summarize,
  tripHealth,
  type Loc,
  type SeoTripSource,
} from '@stella/shared/seo-health';
import { seoLocales } from '@stella/shared/seo-defaults';
import {
  pageProblems,
  parsePage,
  robotsAllows,
  type PageProblem,
} from '@stella/shared/seo-page';
import type { ApiEnv } from './types';
import type { Config } from './config';
import type { authService } from './auth';
import { fail } from './errors';

/** Crawlers whose access the admin shows; tokens as vendors document them. */
export const watchedCrawlers = [
  { agent: 'Googlebot', purpose: 'search' },
  { agent: 'Bingbot', purpose: 'search' },
  { agent: 'OAI-SearchBot', purpose: 'aiSearch' },
  { agent: 'ChatGPT-User', purpose: 'aiUser' },
  { agent: 'PerplexityBot', purpose: 'aiSearch' },
  { agent: 'Perplexity-User', purpose: 'aiUser' },
  { agent: 'Claude-SearchBot', purpose: 'aiSearch' },
  { agent: 'Claude-User', purpose: 'aiUser' },
  { agent: 'Google-Extended', purpose: 'gemini' },
  { agent: 'GPTBot', purpose: 'training' },
  { agent: 'ClaudeBot', purpose: 'training' },
  { agent: 'CCBot', purpose: 'training' },
] as const;

/**
 * External accounts the SEO screen can show data from. None is connected
 * in code yet: the admin shows "connection required" and setup steps, never
 * placeholder numbers (docs/seo/EXTERNAL-ACTIONS-REQUIRED.md).
 */
export const integrations = [
  'searchConsole',
  'bingWebmaster',
  'ga4',
  'pageSpeed',
  'organicConversions',
  'aiReferrals',
] as const;

export async function loadSeoSources(db: Database): Promise<SeoTripSource[]> {
  const [trips, prices, items, itinerary, images] = await Promise.all([
    db
      .select({
        id: s.trips.id,
        slug: s.trips.slug,
        kind: s.trips.kind,
        status: s.trips.status,
        collection: s.collections.slug,
        title: s.trips.title,
        summary: s.trips.summary,
        description: s.trips.description,
        seoTitle: s.trips.seoTitle,
        seoDescription: s.trips.seoDescription,
        durationLabel: s.trips.durationLabel,
        departureLabel: s.trips.departureLabel,
      })
      .from(s.trips)
      .leftJoin(s.collections, eq(s.collections.id, s.trips.collectionId))
      .where(isNull(s.trips.archivedAt))
      .orderBy(s.trips.sort, sql`${s.trips.title}->>'en'`),
    db
      .select({
        tripId: s.tripPrices.tripId,
        amountEur: s.tripPrices.amountEur,
        unit: s.tripPrices.unit,
        isPrimary: s.tripPrices.isPrimary,
      })
      .from(s.tripPrices),
    db
      .select({
        tripId: s.tripItems.tripId,
        type: s.tripItems.type,
        text: s.tripItems.text,
      })
      .from(s.tripItems)
      .orderBy(s.tripItems.sort),
    db
      .select({
        tripId: s.tripItinerary.tripId,
        n: sql<number>`count(*)::int`,
      })
      .from(s.tripItinerary)
      .groupBy(s.tripItinerary.tripId),
    db
      .select({
        tripId: s.tripMedia.tripId,
        role: s.tripMedia.role,
        kind: s.media.kind,
        alt: s.media.alt,
      })
      .from(s.tripMedia)
      .innerJoin(s.media, eq(s.media.id, s.tripMedia.mediaId)),
  ]);
  const by = <T extends { tripId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) map.set(r.tripId, [...(map.get(r.tripId) ?? []), r]);
    return map;
  };
  const p = by(prices),
    i = by(items),
    m = by(images),
    it = new Map(itinerary.map((r) => [r.tripId, r.n]));
  return trips.map((t) => ({
    ...t,
    title: t.title as Loc,
    summary: t.summary as Loc | null,
    description: t.description as Loc | null,
    seoTitle: t.seoTitle as Loc | null,
    seoDescription: t.seoDescription as Loc | null,
    durationLabel: t.durationLabel as Loc | null,
    prices: (p.get(t.id) ?? []).map((r) => ({
      amountEur: r.amountEur === null ? null : Number(r.amountEur),
      unit: r.unit,
      isPrimary: r.isPrimary,
    })),
    items: (i.get(t.id) ?? []).map((r) => ({
      type: r.type,
      text: r.text as Loc,
    })),
    itineraryCount: it.get(t.id) ?? 0,
    images: (m.get(t.id) ?? [])
      .filter((r) => r.kind === 'image')
      .map((r) => ({ role: r.role, alt: r.alt as Loc | null })),
  }));
}

const pageBody = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  locale: z.enum(seoLocales),
});
export const seoContracts = {
  page: pageBody,
};

const userAgent = 'StellaSeoCheck/1.0 (+admin live check)';
async function get(url: string) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(10_000),
    });
    return {
      status: res.status,
      body: res.status === 200 ? await res.text() : '',
    };
  } catch {
    return { status: 0, body: '' };
  }
}
async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]!);
      }
    }),
  );
  return out;
}

/** One live check at a time, at most once a minute, per API process. */
let lastRun = 0,
  running = false;
const cooldownMs = 60_000;

export function registerAdminSeo(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  const origin = new URL(cfg.WEB_ORIGIN).origin;

  app.get('/v1/admin/seo', auth.guard('content'), async (c) => {
    const sources = await loadSeoSources(db),
      health = tripHealth(sources);
    const [faqRows, collections] = await Promise.all([
      db
        .select({ q: s.faqs.q, a: s.faqs.a })
        .from(s.faqs)
        .where(and(eq(s.faqs.status, 'published'), isNull(s.faqs.archivedAt))),
      db
        .select({
          slug: s.collections.slug,
          status: s.collections.status,
          subline: s.collections.subline,
          headline: s.collections.headline,
        })
        .from(s.collections)
        .where(isNull(s.collections.archivedAt)),
    ]);
    const liveCollections = collections.filter((r) => r.status === 'published');
    return c.json({
      origin,
      locales: seoLocales,
      summary: summarize(health),
      trips: sources.map((t) => ({
        id: t.id,
        slug: t.slug,
        kind: t.kind,
        status: t.status,
        collection: t.collection,
        title: t.title,
        seoTitle: t.seoTitle,
        seoDescription: t.seoDescription,
      })),
      health,
      faqs: {
        published: faqRows.length,
        perLocale: Object.fromEntries(
          seoLocales.map((l) => [
            l,
            faqRows.filter((f) => (f.q as Loc)[l] && (f.a as Loc)[l]).length,
          ]),
        ),
      },
      collections: {
        published: liveCollections.length,
        withoutDescription: liveCollections
          .filter(
            (r) =>
              !(r.subline as Loc | null)?.en && !(r.headline as Loc | null)?.en,
          )
          .map((r) => r.slug),
      },
      integrations: integrations.map((id) => ({ id, status: 'notConnected' })),
    });
  });

  // Fetches one public trip page and returns what crawlers see in its head.
  app.post('/v1/admin/seo/page', auth.guard('content'), async (c) => {
    const body = pageBody.parse(await c.req.json());
    const [trip] = await db
      .select({ status: s.trips.status })
      .from(s.trips)
      .where(and(eq(s.trips.slug, body.slug), isNull(s.trips.archivedAt)));
    if (!trip) fail(404, 'NOT_FOUND');
    const url = `${origin}/${body.locale}/t/${body.slug}`,
      res = await get(url);
    const page = res.status === 200 ? parsePage(res.body) : null;
    return c.json({
      url,
      status: res.status,
      published: trip.status === 'published',
      page: page && {
        title: page.title,
        description: page.description,
        robots: page.robots,
        canonical: page.canonical,
        alternates: page.alternates,
        ogImage: page.ogImage,
        metadataInHead: page.metadataInHead,
        schemaTypes: page.schemaTypes,
        jsonld: page.jsonld.map((j) => j.value),
      },
      problems: page
        ? pageProblems(page, {
            url,
            locale: body.locale,
            locales: [...seoLocales],
            status: res.status,
          })
        : (['status'] as PageProblem[]),
    });
  });

  // Live check of the public site: robots, sitemap, and the EN + IT pages.
  app.post('/v1/admin/seo/check', auth.guard('content'), async (c) => {
    if (running || Date.now() - lastRun < cooldownMs) fail(429, 'RATE_LIMITED');
    running = true;
    const started = Date.now();
    try {
      const sources = await loadSeoSources(db);
      const robots = await get(origin + '/robots.txt'),
        sitemap = await get(origin + '/sitemap.xml');
      const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
        m[1]!.trim(),
      );
      const inSitemap = new Set(locs);
      const published = sources.filter((t) => t.status === 'published'),
        unpublished = sources.filter((t) => t.status !== 'published');
      const expected = published.flatMap((t) =>
        seoLocales.map((l) => `${origin}/${l}/t/${t.slug}`),
      );
      const leaked = locs.filter((u) =>
        unpublished.some((t) => u.endsWith('/t/' + t.slug)),
      );
      // Priority markets first; every language's home page too.
      const sample = [
        ...seoLocales.map((l) => `${origin}/${l}`),
        ...locs.filter((u) => /\/(en|it)(\/|$)/.test(u.slice(origin.length))),
      ];
      const urls = [...new Set(sample)].slice(0, 140);
      const pages = await pool(urls, 4, async (url) => {
        const res = await get(url),
          locale = url.slice(origin.length + 1).split('/')[0]!;
        const page = res.status === 200 ? parsePage(res.body) : null;
        return {
          url,
          status: res.status,
          title: page?.title ?? null,
          description: page?.description ?? null,
          hrefs: page?.hrefs ?? [],
          problems: page
            ? pageProblems(page, {
                url,
                locale,
                locales: [...seoLocales],
                status: res.status,
              })
            : (['status'] as PageProblem[]),
        };
      });
      const crawled = new Set(pages.map((p) => p.url));
      const linked = new Set(
        pages.flatMap((p) => p.hrefs.map((h) => origin + h.replace(/\/$/, ''))),
      );
      const toProbe = [...linked]
        .filter(
          (u) => !crawled.has(u) && !/\/(request|my-trip|preview)/.test(u),
        )
        .slice(0, 60);
      const probes = await pool(toProbe, 4, async (url) => ({
        url,
        status: (await get(url)).status,
      }));
      const broken = [
        ...pages.filter((p) => p.status >= 400 || p.status === 0),
        ...probes.filter((p) => p.status >= 400 || p.status === 0),
      ].map((p) => ({ url: p.url, status: p.status }));
      const drafts = await pool(unpublished.slice(0, 5), 2, async (t) => ({
        slug: t.slug,
        status: (await get(`${origin}/en/t/${t.slug}`)).status,
      }));
      return c.json({
        ranAt: new Date().toISOString(),
        origin,
        durationMs: Date.now() - started,
        robots: {
          status: robots.status,
          crawlers: watchedCrawlers.map((w) => ({
            ...w,
            allowed:
              robots.status === 200
                ? robotsAllows(robots.body, w.agent, '/en')
                : null,
          })),
          privateBlocked:
            robots.status === 200 &&
            !robotsAllows(robots.body, 'Googlebot', '/api/x') &&
            !robotsAllows(robots.body, 'Googlebot', '/en/my-trip'),
        },
        sitemap: {
          status: sitemap.status,
          urls: locs.length,
          missingTrips: expected.filter((u) => !inSitemap.has(u)),
          unpublishedListed: leaked,
        },
        pages: pages.map(({ hrefs: _hrefs, ...p }) => p),
        brokenLinks: broken,
        orphans: urls.filter(
          (u) =>
            inSitemap.has(u) &&
            !linked.has(u) &&
            !/\/(en|it|es|fr|de|ru|tr)$/.test(u),
        ),
        unpublishedReachable: drafts.filter((d) => d.status === 200),
      });
    } finally {
      lastRun = Date.now();
      running = false;
    }
  });
}
