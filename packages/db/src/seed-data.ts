import { readFile } from 'node:fs/promises';
import { searchKeywordsSchema } from '@stella/shared/admin';
import { createHash, randomBytes } from 'node:crypto';
import { eq, and, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './index';
import * as s from './schema';
import { durationFacts, runDays, splitNotes } from './normalize';
import { locales } from '@stella/shared';
import { seedCoreTranslations } from './core-translations';
const localized = z
  .union([z.string(), z.record(z.string(), z.string())])
  .transform((v) => (typeof v === 'string' ? { en: v } : (v as s.Localized)));
const collection = z.object({
  id: z.string(),
  kind: z.enum(['normal', 'private_virtual', 'packages']),
  order: z.number(),
  name: localized,
  short: localized,
  headline: localized,
  sub: localized,
  cover: z.string().nullable().default(null),
  hero_video: z.string().nullable(),
  hero_video_mobile: z.string().nullable().optional(),
  color: z.string(),
  perks: z.array(z.tuple([z.string(), z.string()])).optional(),
});
const trip = z.object({
  slug: z.string(),
  collection: z.string(),
  title: z.string(),
  days: z.string(),
  departure: z.string().nullable().optional(),
  return_time: z.string().nullable().optional(),
  duration: z.string(),
  transport: z.string(),
  format: z.enum(['group', 'private', 'both']),
  family: z.boolean(),
  flight: z.boolean(),
  status: z.enum(['draft', 'published', 'hidden']),
  private_on_request: z.boolean(),
  prices: z.array(
    z.object({
      label: z.string().nullable(),
      amount_eur: z.number().nonnegative().nullable(),
      unit: z.enum([
        'person',
        'child',
        'quad',
        'buggy',
        'car',
        'boat',
        'group',
        'hour',
      ]),
    }),
  ),
  highlights: z.array(z.string()).default([]),
  includes: z.array(z.string()),
  excludes: z.array(z.string()),
  optional: z.array(z.string()),
  bring: z.array(z.string()).optional(),
  notes: z.array(z.string()),
  itinerary: z.array(z.tuple([z.string().nullable(), z.string()])),
  media: z.object({
    cover: z.string().nullable().default(null),
    video: z.string().nullable().optional(),
    gallery: z.array(z.string()).optional(),
  }),
});
const catalogSchema = z.object({
  collections: z.array(collection),
  trips: z.array(trip),
  packages: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      trips: z.array(z.string()),
      price_eur: z.number().nullable(),
      summary: z.string().optional(),
      cover: z.string().optional(),
      status: z.literal('draft'),
      collection: z.string(),
    }),
  ),
  business: z.object({ name: z.string(), address: z.string() }),
});
type Options = {
  catalogPath: URL;
  ownerEmail: string;
  importMedia?: (path: string, alt: s.Localized) => Promise<string | null>;
};
// Official contact channels sent by the owner on 2026-11-14.
const businessContacts = {
  phone: '+201095989932',
  email: 'stellasharmtour@gmail.com',
};
const businessSocial = [
  { label: 'Instagram', url: 'https://www.instagram.com/stellasharmtours/' },
  { label: 'Facebook', url: 'https://www.facebook.com/share/1MiMcbCDxF/' },
  {
    label: 'TripAdvisor',
    url: 'https://www.tripadvisor.co.uk/Attraction_Review-g297555-d34091505-Reviews-Stella_Sharm_Tours_by_Heroes_travel-Sharm_El_Sheikh_South_Sinai_Red_Sea_and_Sina.html',
  },
  { label: 'Google Maps', url: 'https://share.google/mI9ygfvx6Khi5caqM' },
];
const featured = [
  'ras-mohammed-white-island-boat',
  'ras-mohammed-bus',
  'quad-bike-safari',
  'red-canyon-three-pools',
  'red-canyon-blue-hole',
  'water-activities',
  'private-speed-boat',
  'sea-scope-submarine',
  'dolphin-show',
  'cairo-bus-gem',
  'mount-sinai-st-catherine',
];
const keywordFile = z.strictObject({
  collections: z.record(z.string(), searchKeywordsSchema),
  trips: z.record(z.string(), searchKeywordsSchema),
});
/**
 * Applies data/search-keywords.json. Fills only empty columns, so keywords
 * staff edited in the admin survive a seed rerun.
 */
export async function seedSearchKeywords(
  db: Pick<Database, 'update'>,
  file: URL,
) {
  const data = keywordFile.parse(JSON.parse(await readFile(file, 'utf8')));
  for (const [slug, searchKeywords] of Object.entries(data.collections))
    await db
      .update(s.collections)
      .set({ searchKeywords })
      .where(
        and(eq(s.collections.slug, slug), isNull(s.collections.searchKeywords)),
      );
  for (const [slug, searchKeywords] of Object.entries(data.trips))
    await db
      .update(s.trips)
      .set({ searchKeywords })
      .where(and(eq(s.trips.slug, slug), isNull(s.trips.searchKeywords)));
}
export async function seedCatalog(db: Database, options: Options) {
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(options.catalogPath, 'utf8')),
  );
  return db.transaction(async (db) => {
    const cids = new Map<string, string>(),
      tids = new Map<string, string>();
    for (const c of catalog.collections) {
      const cover =
        c.cover && options.importMedia
          ? await options.importMedia(c.cover, c.name)
          : null;
      const video =
        c.hero_video && options.importMedia
          ? await options.importMedia(c.hero_video, c.name)
          : null;
      await db
        .insert(s.collections)
        .values({
          slug: c.id,
          kind: c.kind,
          name: c.name,
          shortName: c.short,
          headline: c.headline,
          subline: c.sub,
          color: c.color,
          sort: c.order,
          status: 'published',
          coverMediaId: cover,
          heroVideoId: video,
          perks:
            c.perks?.map(([title, sub]) => ({
              title: { en: title },
              sub: { en: sub },
            })) ?? null,
        })
        .onConflictDoNothing({ target: s.collections.slug });
      const row = (
        await db
          .select()
          .from(s.collections)
          .where(eq(s.collections.slug, c.id))
      )[0]!;
      cids.set(c.id, row.id);
      for (const [field, value] of [
        ['name', row.name],
        ['short_name', row.shortName],
        ['headline', row.headline],
        ['subline', row.subline],
      ] as const) {
        if (!value) continue;
        for (const locale of locales) {
          if (locale === 'en' || !value[locale]) continue;
          await db
            .insert(s.contentTranslations)
            .values({
              entity: 'collection',
              entityId: row.id,
              field,
              locale,
              text: value[locale]!,
              sourceHash: createHash('sha256').update(value.en).digest('hex'),
              origin: 'human',
            })
            .onConflictDoNothing();
        }
      }
      // Never overwrite staff edits on a seed rerun. Create missing seed slides only.
      const slideExists = await db
        .select({ id: s.heroSlides.id })
        .from(s.heroSlides)
        .where(eq(s.heroSlides.collectionId, row.id));
      if (!slideExists.length && (row.coverMediaId || row.heroVideoId)) {
        const [video] = row.heroVideoId
          ? await db
              .select()
              .from(s.media)
              .where(eq(s.media.id, row.heroVideoId))
          : [];
        const mobileId =
          c.hero_video_mobile && options.importMedia
            ? await options.importMedia(c.hero_video_mobile, c.name)
            : null;
        const [mobile] = mobileId
          ? await db.select().from(s.media).where(eq(s.media.id, mobileId))
          : [];
        const mobileReady =
          mobile?.status === 'ready' && mobile.rightsStatus !== 'unknown';
        const slide = {
          collectionId: row.id,
          imageMediaId: row.coverMediaId,
          videoMediaId:
            video?.status === 'ready' && video.rightsStatus !== 'unknown'
              ? video.id
              : row.coverMediaId
                ? null
                : row.heroVideoId,
          ctaType: 'collection' as const,
          ctaTarget: c.id,
          ctaLabel: { en: 'See trips' },
          // Owner decision (2026-11-28): "All of Egypt" is the first hero
          // video, then Private, then the other collections in catalog order.
          // Hero order stays independent of the collection order.
          sort: c.id === 'all' ? 0 : c.order + 1,
          durationS: 6,
          status:
            row.coverMediaId ||
            (video?.status === 'ready' && video.rightsStatus !== 'unknown')
              ? ('published' as const)
              : ('draft' as const),
        };
        await db.insert(s.heroSlides).values(
          mobileReady &&
            video?.status === 'ready' &&
            video.rightsStatus !== 'unknown'
            ? [
                { ...slide, showOn: 'mobile', videoMediaId: mobile.id },
                { ...slide, showOn: 'desktop' },
              ]
            : [slide],
        );
      }
    }
    for (const [sort, t] of catalog.trips.entries()) {
      const notes = splitNotes(t.notes),
        facts = durationFacts(t.duration);
      const inserted = await db
        .insert(s.trips)
        .values({
          slug: t.slug,
          kind: 'trip',
          collectionId: cids.get(t.collection)!,
          title: { en: t.title },
          summary: t.highlights.length
            ? { en: t.highlights.slice(0, 3).join(' · ') }
            : null,
          daysLabel: { en: t.days },
          runDays: runDays(t.days),
          onRequest: t.prices.every((p) => p.amount_eur === null),
          departureLabel: t.departure ?? null,
          returnLabel: t.return_time ?? null,
          durationLabel: { en: t.duration },
          ...facts,
          transport: t.transport,
          format: t.format === 'private' ? 'private' : 'both',
          privateOnRequest: t.private_on_request,
          familyFriendly: t.family,
          flight: t.flight,
          notes: notes.public.map((en) => ({ en })),
          editorialNotes: notes.editorial,
          sort,
          status: t.status,
          featuredOrder: featured.includes(t.slug)
            ? featured.indexOf(t.slug)
            : null,
        })
        .onConflictDoNothing({ target: s.trips.slug })
        .returning();
      const row =
        inserted[0] ??
        (await db.select().from(s.trips).where(eq(s.trips.slug, t.slug)))[0]!;
      tids.set(t.slug, row.id);
      if (!inserted.length && t.return_time && row.returnLabel === null)
        await db
          .update(s.trips)
          .set({ returnLabel: t.return_time })
          .where(and(eq(s.trips.id, row.id), isNull(s.trips.returnLabel)));
      if (inserted.length)
        await db.transaction(async (tx) => {
          if (t.prices.length)
            await tx.insert(s.tripPrices).values(
              t.prices.map((p, i) => ({
                tripId: row.id,
                label: p.label ? { en: p.label } : null,
                amountEur: p.amount_eur === null ? null : String(p.amount_eur),
                unit: p.unit,
                isPrimary: i === 0,
                sort: i,
              })),
            );
          if (t.itinerary.length)
            await tx.insert(s.tripItinerary).values(
              t.itinerary.map(([time, en], i) => ({
                tripId: row.id,
                timeLabel: time,
                text: { en },
                sort: i,
              })),
            );
          for (const [key, type] of [
            ['includes', 'include'],
            ['excludes', 'exclude'],
            ['optional', 'optional'],
            ['bring', 'bring'],
            ['highlights', 'highlight'],
          ] as const) {
            const values = t[key] ?? [];
            if (values.length)
              await tx.insert(s.tripItems).values(
                values.map((en, i) => ({
                  tripId: row.id,
                  type,
                  text: { en },
                  sort: i,
                })),
              );
          }
        });
      if (options.importMedia) {
        for (const [role, paths] of [
          ['cover', [t.media.cover]],
          ['gallery', t.media.gallery ?? []],
          ['video', [t.media.video]],
        ] as const) {
          for (const [i, path] of paths.entries()) {
            if (!path) continue;
            const mediaId = await options.importMedia(path, { en: t.title });
            if (mediaId)
              await db
                .insert(s.tripMedia)
                .values({ tripId: row.id, mediaId, role, sort: i })
                .onConflictDoNothing();
          }
        }
      }
    }
    for (const [sort, p] of catalog.packages.entries()) {
      await db
        .insert(s.trips)
        .values({
          slug: p.slug,
          kind: 'package',
          collectionId: cids.get('all')!,
          title: { en: p.title },
          summary: p.summary ? { en: p.summary } : null,
          daysCount: p.trips.reduce(
            (sum, slug) =>
              sum +
              durationFacts(
                catalog.trips.find((t) => t.slug === slug)!.duration,
              ).daysCount,
            0,
          ),
          status: 'draft',
          sort,
          format: 'both',
        })
        .onConflictDoNothing({ target: s.trips.slug });
      const row = (
        await db.select().from(s.trips).where(eq(s.trips.slug, p.slug))
      )[0]!;
      if (p.cover && options.importMedia) {
        const mediaId = await options.importMedia(p.cover, { en: p.title });
        if (mediaId)
          await db
            .insert(s.tripMedia)
            .values({ tripId: row.id, mediaId, role: 'cover', sort: 0 })
            .onConflictDoNothing();
      }
      for (const [i, slug] of p.trips.entries())
        await db
          .insert(s.packageItems)
          .values({
            packageId: row.id,
            tripId: tids.get(slug)!,
            dayIndex: i + 1,
            sort: i,
          })
          .onConflictDoNothing();
    }
    await seedSearchKeywords(
      db,
      new URL('search-keywords.json', options.catalogPath),
    );
    const privateCollection = catalog.collections.find(
      (c) => c.id === 'private',
    )!;
    const defaults: Record<string, unknown> = {
      contacts: {
        whatsapp_primary: '+201069012881',
        whatsapp_secondary: '+201008605904',
        phone: businessContacts.phone,
        email: businessContacts.email,
      },
      address: { en: catalog.business.address },
      hours: null,
      legal_entity: { en: catalog.business.name },
      social: businessSocial,
      pickup_areas: [
        'Naama Bay',
        'Nabq Bay',
        'Sharks Bay',
        'Hadaba',
        'Old Market',
        'Other',
      ],
      request_rules: { min_days_ahead: 1, max_adults: 60, max_children: 40 },
      home: {
        private_heading: privateCollection.headline,
        private_text: privateCollection.sub,
        build_heading: { en: 'Build your own Egypt.' },
        build_text: {
          en: 'A day on the water. A night in the desert. The rest is yours.',
        },
        contact_heading: { en: 'Not sure what to pick?' },
        contact_text: {
          en: "Tell us your dates and what you enjoy. We'll help you plan.",
        },
      },
      how_steps: [
        {
          title: { en: 'Pick your days' },
          text: { en: 'One trip, a collection, or your own mix.' },
        },
        {
          title: { en: 'Send one request' },
          text: { en: 'Dates, guests and your hotel.' },
        },
        {
          title: { en: 'We confirm' },
          text: { en: 'Availability, pickup time and price on WhatsApp.' },
        },
      ],
      i18n: {
        core: locales,
        auto: ['pl', 'cs', 'sk', 'uk', 'ro', 'hu', 'nl', 'pt', 'ar', 'zh'],
        auto_live_min_coverage: 0.95,
        indexable_auto: true,
        provider_by_locale: { default: 'deepl', fallback: 'google' },
        free_tier_only: true,
        monthly_char_budget: 1000000,
      },
      i18n_glossary: [
        'Stella',
        'Stella Sharm Tours',
        'Ras Mohammed',
        'Tiran',
        'Naama Bay',
        'Nabq',
        'Sharks Bay',
        'Hadaba',
        'Old Market',
        'St Catherine',
        'Dahab',
        'Petra',
        'Wishwash',
        'Sea Scope',
      ],
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (value === null) continue;
      await db.insert(s.settings).values({ key, value }).onConflictDoNothing();
    }
    // Databases seeded before the owner sent these details: fill only the
    // fields that are still empty, never overwrite what staff typed in admin.
    const current = new Map(
      (
        await db
          .select()
          .from(s.settings)
          .where(inArray(s.settings.key, ['contacts', 'social']))
      ).map((row) => [row.key, row.value]),
    );
    const contacts = (current.get('contacts') ?? {}) as Record<string, unknown>;
    if (!contacts.phone || !contacts.email)
      await db
        .update(s.settings)
        .set({
          value: {
            ...contacts,
            phone: contacts.phone || businessContacts.phone,
            email: contacts.email || businessContacts.email,
          },
        })
        .where(eq(s.settings.key, 'contacts'));
    const social = current.get('social');
    if (!Array.isArray(social) || social.length === 0)
      await db
        .update(s.settings)
        .set({ value: businessSocial })
        .where(eq(s.settings.key, 'social'));
    const owner = (
      await db
        .insert(s.adminUsers)
        .values({
          email: options.ownerEmail,
          name: 'Owner',
          role: 'owner',
          passwordHash: '!setup-required',
        })
        .onConflictDoNothing({ target: s.adminUsers.email })
        .returning()
    )[0];
    const candidate =
      owner ??
      (
        await db
          .select()
          .from(s.adminUsers)
          .where(eq(s.adminUsers.email, options.ownerEmail))
      )[0];
    const activeSetup = candidate
      ? await db
          .select()
          .from(s.authTokens)
          .where(
            and(
              eq(s.authTokens.userId, candidate.id),
              eq(s.authTokens.purpose, 'setup'),
              gt(s.authTokens.expiresAt, new Date()),
            ),
          )
      : [];
    let setupToken: string | null = null;
    if (candidate?.passwordHash === '!setup-required' && !activeSetup.length) {
      setupToken = randomBytes(32).toString('base64url');
      await db.insert(s.authTokens).values({
        id: createHash('sha256').update(setupToken).digest('hex'),
        userId: candidate.id,
        purpose: 'setup',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
    }
    await seedCoreTranslations(db);
    await db.insert(s.outbox).values({
      name: 'revalidate.web',
      data: {
        tags: [
          'site',
          'collections',
          ...Array.from(cids.keys(), (slug) => 'collection:' + slug),
          ...Array.from(tids.keys(), (slug) => 'trip:' + slug),
        ],
      },
    });
    return {
      collections: cids.size,
      trips: tids.size,
      packages: catalog.packages.length,
      setupToken,
    };
  });
}
