import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { coreLocaleOptions } from '@stella/shared';
import { resolveText } from '@stella/shared/i18n/resolve';
import { cairoDate } from '@stella/shared/booking';
import { estimateTrip } from '@stella/shared/price';
import {
  whatsappNumberFor,
  type WhatsAppContacts,
} from '@stella/shared/whatsapp';
import { applyPreviewDrafts } from './preview-drafts';
import {
  siteSchema,
  slideSchema,
  tripSchema,
  collectionSchema,
  type Trip,
  type Media,
} from '@stella/shared/public-contract';
type RecordValue = Record<string, unknown>;
const object = (v: unknown): RecordValue =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as RecordValue) : {};
type Reader = Pick<Database, 'select'>;
/** Live public locales: the seven core locales plus enabled, covered auto locales. */
export function liveLocales(settings: RecordValue) {
  const i18n = object(settings.i18n),
    runtime = object(settings.i18n_runtime),
    coverage = object(runtime.coverage);
  const auto =
    runtime.providers_available === true && Array.isArray(i18n.auto)
      ? i18n.auto.filter(
          (code): code is string =>
            typeof code === 'string' &&
            Number(coverage[code] ?? 0) >=
              Number(i18n.auto_live_min_coverage ?? 0.95),
        )
      : [];
  return [
    ...coreLocaleOptions.map((l) => ({
      ...l,
      indexable: true,
      dir: 'ltr' as const,
    })),
    ...auto
      .filter((code) => !coreLocaleOptions.some((l) => l.code === code))
      .map((code) => ({
        code,
        name:
          new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code,
        auto: true,
        indexable: i18n.indexable_auto === true,
        dir: ['ar', 'he', 'fa', 'ur'].includes(code)
          ? ('rtl' as const)
          : ('ltr' as const),
      })),
  ];
}
/** Reads only the i18n settings rows needed by `liveLocales`. */
export async function loadLiveLocales(db: Reader) {
  const rows = await db
    .select()
    .from(s.settings)
    .where(inArray(s.settings.key, ['i18n', 'i18n_runtime']));
  return liveLocales(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}
export async function readSettings(db: Reader) {
  return Object.fromEntries(
    (await db.select().from(s.settings)).map((r) => [r.key, r.value]),
  );
}
export async function loadCatalog(
  db: Reader,
  locale: string,
  mediaOrigin: string,
  options: {
    previewTrip?: string;
    previewCollection?: string;
    requestedTrips?: string[];
  } = {},
) {
  const today = cairoDate();
  const selected = options.requestedTrips
    ? db
        .select({ id: s.trips.id })
        .from(s.trips)
        .where(inArray(s.trips.slug, options.requestedTrips))
    : undefined;
  const requested = selected
    ? db
        .select({ id: s.trips.id })
        .from(s.trips)
        .where(
          or(
            inArray(s.trips.id, selected),
            inArray(
              s.trips.id,
              db
                .select({ id: s.packageItems.tripId })
                .from(s.packageItems)
                .where(inArray(s.packageItems.packageId, selected)),
            ),
          ),
        )
    : undefined;
  const [
    cs,
    ts,
    ps,
    its,
    items,
    ms,
    tms,
    parts,
    slides,
    translations,
    settings,
  ] = await Promise.all([
    db
      .select()
      .from(s.collections)
      .where(
        and(
          or(
            eq(s.collections.status, 'published'),
            options.previewCollection
              ? eq(s.collections.slug, options.previewCollection)
              : undefined,
            options.previewTrip
              ? sql`${s.collections.id} in (select collection_id from trips where slug=${options.previewTrip})`
              : undefined,
          ),
          isNull(s.collections.archivedAt),
        ),
      )
      .orderBy(asc(s.collections.sort)),

    db
      .select()
      .from(s.trips)
      .where(
        and(
          or(
            eq(s.trips.status, 'published'),
            options.previewTrip
              ? eq(s.trips.slug, options.previewTrip)
              : undefined,
            options.previewCollection
              ? sql`${s.trips.collectionId} in (select id from collections where slug=${options.previewCollection})`
              : undefined,
          ),
          isNull(s.trips.archivedAt),
          requested ? inArray(s.trips.id, requested) : undefined,
        ),
      )
      .orderBy(asc(s.trips.sort)),
    db
      .select()
      .from(s.tripPrices)
      .where(requested ? inArray(s.tripPrices.tripId, requested) : undefined)
      .orderBy(asc(s.tripPrices.sort), asc(s.tripPrices.id)),

    db
      .select()
      .from(s.tripItinerary)
      .where(requested ? inArray(s.tripItinerary.tripId, requested) : undefined)
      .orderBy(asc(s.tripItinerary.sort), asc(s.tripItinerary.id)),
    db
      .select()
      .from(s.tripItems)
      .where(requested ? inArray(s.tripItems.tripId, requested) : undefined)
      .orderBy(
        asc(s.tripItems.sort),
        asc(s.tripItems.type),
        asc(s.tripItems.id),
      ),

    db
      .select()
      .from(s.media)
      .where(
        and(
          eq(s.media.status, 'ready'),
          isNull(s.media.archivedAt),
          requested
            ? or(
                inArray(
                  s.media.id,
                  db
                    .select({ id: s.tripMedia.mediaId })
                    .from(s.tripMedia)
                    .where(inArray(s.tripMedia.tripId, requested)),
                ),
                sql`exists(select 1 from trips st where ${inArray(sql`st.id`, requested)} and st.story->'scenes' @> jsonb_build_array(jsonb_build_object('mediaId',${s.media.id}::text)))`,
              )
            : undefined,
        ),
      ),
    db
      .select()
      .from(s.tripMedia)
      .where(requested ? inArray(s.tripMedia.tripId, requested) : undefined)
      .orderBy(
        asc(s.tripMedia.sort),
        asc(s.tripMedia.role),
        asc(s.tripMedia.mediaId),
      ),
    db
      .select()
      .from(s.packageItems)
      .where(selected ? inArray(s.packageItems.packageId, selected) : undefined)
      .orderBy(asc(s.packageItems.sort), asc(s.packageItems.tripId)),

    db
      .select()
      .from(s.heroSlides)
      .where(
        and(
          eq(s.heroSlides.status, 'published'),
          isNull(s.heroSlides.archivedAt),
        ),
      )
      .orderBy(asc(s.heroSlides.sort)),

    db
      .select()
      .from(s.contentTranslations)
      .where(eq(s.contentTranslations.locale, locale)),
    readSettings(db),
  ] as const);
  await applyPreviewDrafts(db, options, {
    collections: cs,
    trips: ts,
    itinerary: its,
    items,
    media: tms,
  });
  const byTranslation = new Map(
    translations.map((row) => [
      JSON.stringify([row.entity, row.entityId, row.field]),
      row,
    ]),
  );
  const text = (
    entity: string,
    id: string,
    field: string,
    value: s.Localized | null | undefined,
  ) => {
    const row = byTranslation.get(JSON.stringify([entity, id, field]));
    const result = resolveText(value, locale, row ? [row] : []);
    return result ? { text: result.text, lang: result.lang } : null;
  };
  const url = (path: unknown) =>
    typeof path === 'string'
      ? mediaOrigin.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
      : null;
  const media = (id: string | null): Media | null => {
    const m = ms.find((m) => m.id === id && m.rightsStatus !== 'unknown');
    if (!m || !m.width || !m.height) return null;
    const variants = object(m.variants),
      jpg = object(variants.jpg),
      avif = object(variants.avif);
    const poster = url(variants.poster ?? jpg['1200'] ?? avif['1200']);
    if (!poster) return null;
    return {
      url: poster,
      width: m.width,
      height: m.height,
      alt: text('media', m.id, 'alt', m.alt) ?? { text: '', lang: 'en' },
      rights_status: m.rightsStatus,
      variants: Object.fromEntries(
        Object.entries(jpg).flatMap(([w, p]) => (url(p) ? [[w, url(p)!]] : [])),
      ),
      ...(m.kind === 'video'
        ? {
            video: {
              vertical: url(variants.mp4_v),
              horizontal: url(variants.mp4_h),
            },
          }
        : {}),
    };
  };
  function storyFor(trip: (typeof ts)[number]) {
    if (!trip.story) return null;
    const scenes = [];
    const sceneText = (key: string, value: s.Localized) => {
      const row = byTranslation.get(JSON.stringify(['trip', trip.id, key]));
      const current =
        row &&
        row.sourceHash === createHash('sha256').update(value.en).digest('hex');
      const resolved = resolveText(value, locale, current ? [row] : []);
      return resolved && { text: resolved.text, lang: resolved.lang };
    };
    for (const { title, caption, mediaId, ...scene } of trip.story.scenes) {
      const heading = sceneText('story.' + scene.id + '.title', title);
      const body = sceneText('story.' + scene.id + '.caption', caption);
      const asset = media(mediaId);
      if (
        !asset ||
        !heading ||
        !body ||
        heading.lang !== locale ||
        body.lang !== locale
      )
        return null;
      scenes.push({ ...scene, title: heading, caption: body, media: asset });
    }
    return { scenes };
  }
  const available = ts.filter((t) => cs.some((c) => c.id === t.collectionId));
  // Packages may contain published trips only; never leak a draft's title or price.
  const publicTrips = available.filter(
    (t) =>
      t.kind !== 'package' ||
      parts
        .filter((p) => p.packageId === t.id)
        .every((p) =>
          available.some((a) => a.id === p.tripId && a.kind === 'trip'),
        ),
  );
  const toTrip = (t: (typeof ts)[number]): Trip => {
    const rows = ps.filter(
      (p) =>
        p.tripId === t.id &&
        (!p.validFrom || p.validFrom <= today) &&
        (!p.validTo || p.validTo >= today),
    );
    const mediaRows = tms.filter((m) => m.tripId === t.id);
    const availableStory = t.story ? storyFor(t) : null;
    const result = {
      story_available: t.story ? !!availableStory : undefined,
      story_cover: availableStory?.scenes[0]?.media,
      slug: t.slug,
      collection: cs.find((c) => c.id === t.collectionId)!.slug,
      kind: t.kind,
      title: text('trip', t.id, 'title', t.title)!,
      summary: text('trip', t.id, 'summary', t.summary),
      description: text('trip', t.id, 'description', t.description),
      cover: media(mediaRows.find((m) => m.role === 'cover')?.mediaId ?? null),
      gallery: mediaRows
        .filter(
          (m) =>
            m.role === 'gallery' || m.role === 'cover' || m.role === 'video',
        )
        .map((m) => media(m.mediaId))
        .filter((m): m is Media => !!m),
      duration_label: text('trip', t.id, 'duration_label', t.durationLabel),
      duration_minutes: t.durationMinutes,
      days_label: text('trip', t.id, 'days_label', t.daysLabel),
      run_days: t.runDays,
      departure_label: t.departureLabel
        ? (text('trip', t.id, 'departure_label', { en: t.departureLabel })
            ?.text ?? null)
        : null,
      return_label: t.returnLabel
        ? text('trip', t.id, 'return_label', { en: t.returnLabel })
        : null,
      days_count: t.daysCount,
      flight: t.flight,
      overnight: t.overnight,
      family_friendly: t.familyFriendly,
      min_age: t.minAge,
      format: t.format,
      private_surcharge_pct:
        t.privateSurchargePct === null ? null : Number(t.privateSurchargePct),
      private_on_request: t.privateOnRequest,
      prices: rows.map((p) => ({
        id: p.id,
        label: text('trip_price', p.id, 'label', p.label),
        amount_eur: p.amountEur === null ? null : Number(p.amountEur),
        unit: p.unit,
        min_qty: p.minQty,
        max_qty: p.maxQty,
        is_primary: p.isPrimary,
      })),
      itinerary: its
        .filter((i) => i.tripId === t.id)
        .map((i) => ({
          time: i.timeLabel
            ? (text('itinerary', i.id, 'time_label', { en: i.timeLabel })
                ?.text ?? null)
            : null,
          text: text('itinerary', i.id, 'text', i.text)!,
        })),
      items: items
        .filter((i) => i.tripId === t.id)
        .map((i) => ({
          type: i.type,
          text: text('trip_item', i.id, 'text', i.text)!,
        })),
      notes: (t.notes ?? []).map((n, i) =>
        text('trip', t.id, `notes[${i}]`, n)!,
      ),
      parts: parts
        .filter((p) => p.packageId === t.id)
        .flatMap((p) => {
          const part = publicTrips.find(
            (a) => a.id === p.tripId && a.kind === 'trip',
          );
          if (!part) return [];
          const dto = toTrip(part);
          return [
            {
              slug: dto.slug,
              title: dto.title,
              cover: dto.cover,
              days_count: dto.days_count,
              prices: dto.prices,
              format: dto.format,
              private_surcharge_pct: dto.private_surcharge_pct,
            },
          ];
        }),
      seo_title: text('trip', t.id, 'seo_title', t.seoTitle),
      seo_description: text('trip', t.id, 'seo_description', t.seoDescription),
    };
    return tripSchema.parse(result);
  };
  const dtos = publicTrips.map(toTrip);
  // Trips shown in a collection. "All of Egypt" (kind packages) lists every
  // trip on the site: its own ready-made packages first, then each normal
  // collection in its admin order (owner, 2026-11-26).
  const collectionRank = (slug: string) => cs.findIndex((c) => c.slug === slug);
  const membersOf = (c: { slug: string; kind: string }) =>
    c.kind === 'private_virtual'
      ? dtos
          .filter((t) => ['private', 'both'].includes(t.format))
          .sort(
            (a, b) =>
              Number(b.format === 'private') - Number(a.format === 'private'),
          )
      : c.kind === 'packages'
        ? [...dtos].sort(
            (a, b) =>
              Number(b.collection === c.slug) -
                Number(a.collection === c.slug) ||
              collectionRank(a.collection) - collectionRank(b.collection),
          )
        : dtos.filter((t) => t.collection === c.slug);
  const collections = cs.map((c) => {
    const trips = membersOf(c);
    const prices = trips.flatMap((t) => {
      const price =
        t.prices.find((p) => p.is_primary) ??
        t.prices.find((p) => p.unit !== 'child');
      if (!price) return [];
      if (c.kind === 'private_virtual') {
        const value = estimateTrip(t, 1, 0, 'private');
        return value.onRequest ? [] : [value.amount];
      }
      return price.amount_eur === null ? [] : [price.amount_eur];
    });
    return collectionSchema.parse({
      slug: c.slug,
      kind: c.kind,
      name: text('collection', c.id, 'name', c.name),
      short_name: text('collection', c.id, 'short_name', c.shortName ?? c.name),
      headline: text('collection', c.id, 'headline', c.headline ?? c.name),
      subline: text('collection', c.id, 'subline', c.subline),
      color: c.color,
      cover: media(c.coverMediaId),
      trip_count: trips.length,
      min_price_eur: prices.length ? Math.min(...prices) : null,
      max_days: Math.max(1, ...trips.map((t) => t.days_count)),
      previews: trips.flatMap((t) => (t.cover ? [t.cover] : [])).slice(0, 3),
    });
  });
  const locales = liveLocales(settings);
  const home = object(settings.home),
    contacts = object(settings.contacts),
    bookingNotice = object(settings.request_rules).min_days_ahead,
    privateCollection = cs.find((c) => c.kind === 'private_virtual');
  const settingText = (key: string, value: unknown) =>
    text('settings', key, 'value', value as s.Localized | null);
  const site = siteSchema.parse({
    name: 'Stella Sharm Tours',
    locales,
    contacts: {
      whatsapp_primary: contacts.whatsapp_primary ?? null,
      whatsapp_secondary: contacts.whatsapp_secondary ?? null,
      phone: contacts.phone ?? null,
      email: contacts.email ?? null,
    },
    address: settingText('address', settings.address),
    hours: settingText('hours', settings.hours),
    legal_entity: settingText('legal_entity', settings.legal_entity),
    home: Object.fromEntries(
      [
        'private_heading',
        'private_text',
        'build_heading',
        'build_text',
        'contact_heading',
        'contact_text',
      ].map((field) => [
        field,
        text('settings', 'home', field, home[field] as s.Localized) ?? {
          text: '',
          lang: 'en',
        },
      ]),
    ),
    hero_slides: slides
      .filter(
        (slide) =>
          (!slide.startsAt || slide.startsAt <= new Date()) &&
          (!slide.endsAt || slide.endsAt > new Date()),
      )
      .flatMap((slide) => {
        const collection = cs.find((c) => c.id === slide.collectionId),
          video = media(slide.videoMediaId),
          image = media(slide.imageMediaId),
          cover = video
            ? {
                ...video,
                ...(image
                  ? {
                      url: image.url,
                      variants: image.variants,
                      width: image.width,
                      height: image.height,
                    }
                  : {}),
              }
            : image;
        if (!cover) return [];
        let href = slide.ctaTarget ?? '';
        if (slide.ctaType === 'collection')
          href = '/c/' + (slide.ctaTarget || collection?.slug || '');
        if (slide.ctaType === 'trip' || slide.ctaType === 'package')
          href = '/t/' + (slide.ctaTarget ?? '');
        if (slide.ctaType === 'my_trip') href = '/my-trip';
        if (slide.ctaType === 'whatsapp')
          href =
            'https://wa.me/' +
            (
              whatsappNumberFor(locale, contacts as WhatsAppContacts) ?? ''
            ).replace(/\D/g, '');
        const dto = slideSchema.safeParse({
          id: slide.id,
          title: slide.headline
            ? text('hero_slide', slide.id, 'headline', slide.headline)
            : collection
              ? text(
                  'collection',
                  collection.id,
                  collection.headline ? 'headline' : 'name',
                  collection.headline ?? collection.name,
                )
              : null,
          kicker: slide.kicker
            ? text('hero_slide', slide.id, 'kicker', slide.kicker)
            : collection
              ? text('collection', collection.id, 'name', collection.name)
              : null,
          subline: slide.subline
            ? text('hero_slide', slide.id, 'subline', slide.subline)
            : collection
              ? text('collection', collection.id, 'subline', collection.subline)
              : null,
          cta_label: text(
            'hero_slide',
            slide.id,
            'cta_label',
            slide.ctaLabel ?? { en: 'See trips' },
          ),
          href,
          cover,
          duration_s: slide.durationS,
          device: slide.showOn,
          starts_at: slide.startsAt?.toISOString() ?? null,
          ends_at: slide.endsAt?.toISOString() ?? null,
        });
        return dto.success && dto.data.title.text.trim() ? [dto.data] : [];
      }),
    featured_trips: Array.isArray(home.featured_trip_slugs)
      ? home.featured_trip_slugs.flatMap((slug) =>
          dtos.filter((t) => t.slug === slug),
        )
      : publicTrips
          .filter((t) => t.featuredOrder !== null)
          .sort((a, b) => a.featuredOrder! - b.featuredOrder!)
          .slice(0, 12)
          .map(toTrip),
    private_trips: Array.isArray(home.private_trip_slugs)
      ? home.private_trip_slugs.flatMap((slug) =>
          dtos.filter((t) => t.slug === slug && t.format !== 'group'),
        )
      : dtos.filter((t) => t.format === 'private'),
    private_perks: (privateCollection?.perks ?? []).map((p, i) => ({
      title: text(
        'collection',
        privateCollection!.id,
        `perks[${i}].title`,
        p.title,
      ),
      sub: text('collection', privateCollection!.id, `perks[${i}].sub`, p.sub),
    })),
    how_steps: (Array.isArray(settings.how_steps)
      ? settings.how_steps
      : []
    ).map((step, i) => {
      const p = object(step);
      return {
        title: text(
          'settings',
          'how_steps',
          `[${i}].title`,
          p.title as s.Localized,
        ),
        text: text(
          'settings',
          'how_steps',
          `[${i}].text`,
          p.text as s.Localized,
        ),
      };
    }),
    pickup_areas: settings.pickup_areas ?? [],
    booking_min_days_ahead:
      typeof bookingNotice === 'number' ? Math.max(1, bookingNotice) : 1,
    social: settings.social ?? [],
    map_image: media(
      typeof settings.map_image === 'string' ? settings.map_image : null,
    ),
  });
  return {
    site,
    collections,
    trips: dtos,
    story: (slug: string) => {
      const trip = publicTrips.find((t) => t.slug === slug);
      return trip ? storyFor(trip) : null;
    },
    text,
    media,
    settings,
    collection: (slug: string) => {
      const collection = collections.find((c) => c.slug === slug);
      if (!collection) return null;
      const list = membersOf(collection);
      return {
        collection,
        trips: list,
        combo: list.find((t) => t.kind === 'package') ?? null,
      };
    },
  };
}
