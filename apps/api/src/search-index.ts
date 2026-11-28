/**
 * Public search index: every published trip, package and collection with
 * the text the site shows in each live language, plus staff keywords. The
 * browser downloads it once and ranks results locally (shared/search.ts).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as s from '@stella/db/schema';
import { resolveText, type TranslationRow } from '@stella/shared/i18n/resolve';
import type { Media, Trip } from '@stella/shared/public-contract';
import { estimateTrip } from '@stella/shared/price';
import type { SearchSource } from '@stella/shared/search';
import type { loadCatalog } from './catalog';

type Reader = Parameters<typeof loadCatalog>[0];
type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

/** The "from" price the trip card shows: one adult, null when on request. */
const fromPrice = (trip: Trip) => {
  const e = estimateTrip(
    trip,
    1,
    0,
    trip.format === 'private' ? 'private' : 'group',
  );
  return e.onRequest ? null : e.amount;
};
/** Smallest useful thumbnail: no video sources in the index. */
const thumb = (media: Media | null | undefined): Media | null => {
  if (!media) return null;
  const { video: _video, ...rest } = media;
  return rest;
};

export async function loadSearchSource(
  db: Reader,
  catalog: Catalog,
  locale: string,
): Promise<SearchSource> {
  const live = catalog.site.locales.map((l) => l.code);
  const tripSlugs = catalog.trips.map((t) => t.slug),
    collectionSlugs = catalog.collections.map((c) => c.slug);
  const [trips, collections] = await Promise.all([
    tripSlugs.length
      ? db
          .select({
            id: s.trips.id,
            slug: s.trips.slug,
            title: s.trips.title,
            searchKeywords: s.trips.searchKeywords,
          })
          .from(s.trips)
          .where(
            and(inArray(s.trips.slug, tripSlugs), isNull(s.trips.archivedAt)),
          )
      : [],
    collectionSlugs.length
      ? db
          .select({
            id: s.collections.id,
            slug: s.collections.slug,
            name: s.collections.name,
            shortName: s.collections.shortName,
            searchKeywords: s.collections.searchKeywords,
          })
          .from(s.collections)
          .where(inArray(s.collections.slug, collectionSlugs))
      : [],
  ]);
  const tripIds = trips.map((t) => t.id);
  const [highlights, translations] = await Promise.all([
    tripIds.length
      ? db
          .select()
          .from(s.tripItems)
          .where(
            and(
              inArray(s.tripItems.tripId, tripIds),
              eq(s.tripItems.type, 'highlight'),
            ),
          )
      : [],
    db
      .select({
        entity: s.contentTranslations.entity,
        entityId: s.contentTranslations.entityId,
        field: s.contentTranslations.field,
        locale: s.contentTranslations.locale,
        text: s.contentTranslations.text,
        origin: s.contentTranslations.origin,
      })
      .from(s.contentTranslations)
      .where(
        and(
          inArray(s.contentTranslations.entity, [
            'trip',
            'collection',
            'trip_item',
          ]),
          inArray(s.contentTranslations.field, [
            'title',
            'name',
            'short_name',
            'text',
          ]),
          inArray(s.contentTranslations.locale, live),
        ),
      ),
  ]);
  const rows = new Map<string, TranslationRow[]>();
  for (const r of translations) {
    const key = r.entity + '\u0000' + r.entityId + '\u0000' + r.field;
    rows.set(key, [...(rows.get(key) ?? []), r]);
  }
  /** The text the site shows in each live language (no EN fallbacks). */
  const everyLocale = (
    entity: string,
    id: string,
    field: string,
    value: s.Localized | null | undefined,
  ) => {
    const found = rows.get(entity + '\u0000' + id + '\u0000' + field) ?? [];
    return live.flatMap((l) => {
      const r = resolveText(value, l, found);
      return r && !r.fallback && r.text.trim() ? [r.text] : [];
    });
  };
  const collectionRow = new Map(collections.map((c) => [c.slug, c]));
  const collectionNames = (slug: string) => {
    const c = collectionRow.get(slug);
    return c ? everyLocale('collection', c.id, 'name', c.name) : [];
  };
  const tripRow = new Map(trips.map((t) => [t.slug, t]));
  const placesOf = new Map<string, string[]>();
  for (const h of highlights)
    placesOf.set(h.tripId, [
      ...(placesOf.get(h.tripId) ?? []),
      ...everyLocale('trip_item', h.id, 'text', h.text),
    ]);
  const collectionDto = new Map(catalog.collections.map((c) => [c.slug, c]));
  return {
    locale,
    suggested: catalog.site.featured_trips.map((t) => t.slug),
    collections: catalog.collections.flatMap((c) => {
      const row = collectionRow.get(c.slug);
      return row
        ? [
            {
              slug: c.slug,
              type: 'collection' as const,
              names: [
                ...everyLocale('collection', row.id, 'name', row.name),
                ...everyLocale(
                  'collection',
                  row.id,
                  'short_name',
                  row.shortName,
                ),
              ],
              keywords: row.searchKeywords ?? null,
              display: { title: c.name, thumb: thumb(c.cover) },
            },
          ]
        : [];
    }),
    trips: catalog.trips.flatMap((t) => {
      const row = tripRow.get(t.slug);
      return row
        ? [
            {
              slug: t.slug,
              type: t.kind,
              collection: t.collection,
              titles: everyLocale('trip', row.id, 'title', row.title),
              places: placesOf.get(row.id) ?? [],
              collectionNames: collectionNames(t.collection),
              keywords: row.searchKeywords ?? null,
              display: {
                title: t.title,
                collection_name: collectionDto.get(t.collection)?.name ?? null,
                thumb: thumb(t.cover),
                from_price_eur: fromPrice(t),
                duration: t.duration_label,
              },
            },
          ]
        : [];
    }),
  };
}
