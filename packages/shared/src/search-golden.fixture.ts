/**
 * Test-only: builds the same SearchSource the API builds from the database,
 * but from the repository seed files (catalog, core translations, keywords).
 * Mirrors the seed: EN from data/catalog.json, IT/ES/FR/DE/RU/TR from
 * data/i18n/core-content.json, keywords from data/search-keywords.json.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SearchKeywords, SearchSource } from './search';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const json = <T>(path: string): T =>
  JSON.parse(readFileSync(root + path, 'utf8')) as T;

type L = { en: string; [k: string]: string | undefined };
type CatalogTrip = {
  slug: string;
  collection: string;
  title: string;
  highlights: string[];
  status: string;
};
type CatalogCollection = { id: string; name: L; short?: L };
type CatalogPackage = {
  slug: string;
  title: string;
  collection: string;
  status: string;
};

export const repoCatalog = json<{
  collections: CatalogCollection[];
  trips: CatalogTrip[];
  packages: CatalogPackage[];
}>('data/catalog.json');
export const repoKeywords = json<{
  collections: Record<string, SearchKeywords>;
  trips: Record<string, SearchKeywords>;
}>('data/search-keywords.json');

const sources = json<string[]>('data/i18n/core-source.json');
const content = json<{ locales: string[]; rows: (number | string)[][] }>(
  'data/i18n/core-content.json',
);
const byEnglish = new Map<string, string[]>(
  content.rows.map(([index, ...translated]) => [
    sources[index as number]!,
    translated as string[],
  ]),
);
/** The EN text plus its six authored core translations. */
export function coreTexts(en: string): string[] {
  return [en, ...(byEnglish.get(en) ?? [])];
}
/** One authored translation, e.g. coreText('Dolphin Show', 'de'). */
export function coreText(en: string, locale: string): string | undefined {
  const i = content.locales.indexOf(locale);
  return i < 0 ? en : byEnglish.get(en)?.[i];
}

const display = (text: string) => ({ text, lang: 'en' });
const localized = (value: L | undefined) =>
  value
    ? [
        ...coreTexts(value.en),
        ...Object.values(value).filter((v): v is string => !!v),
      ]
    : [];

/** SearchSource for display locale EN with core-language text only. */
export function buildRepoSearchSource(): SearchSource {
  const collections = repoCatalog.collections;
  const collectionNames = (id: string) =>
    localized(collections.find((c) => c.id === id)?.name);
  const published = repoCatalog.trips.filter((t) => t.status === 'published');
  return {
    locale: 'en',
    suggested: [],
    collections: collections.map((c) => ({
      slug: c.id,
      type: 'collection',
      names: [...localized(c.name), ...localized(c.short)],
      keywords: repoKeywords.collections[c.id] ?? null,
      display: { title: display(c.name.en), thumb: null },
    })),
    trips: [
      ...published.map((t) => ({
        slug: t.slug,
        type: 'trip' as const,
        collection: t.collection,
        titles: coreTexts(t.title),
        places: t.highlights.flatMap(coreTexts),
        collectionNames: collectionNames(t.collection),
        keywords: repoKeywords.trips[t.slug] ?? null,
        display: {
          title: display(t.title),
          collection_name: null,
          thumb: null,
          from_price_eur: null,
          duration: null,
        },
      })),
      ...repoCatalog.packages
        .filter((p) => p.status === 'published')
        .map((p) => ({
          slug: p.slug,
          type: 'package' as const,
          collection: p.collection,
          titles: coreTexts(p.title),
          places: [],
          collectionNames: collectionNames(p.collection),
          keywords: repoKeywords.trips[p.slug] ?? null,
          display: {
            title: display(p.title),
            collection_name: null,
            thumb: null,
            from_price_eur: null,
            duration: null,
          },
        })),
    ],
  };
}
