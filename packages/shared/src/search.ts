/**
 * Public trip search: text normalization, the index contract, and the
 * in-browser matcher. Pure and browser-safe (no Node APIs); the API builds
 * the index with the same `normalize` so both sides agree on every token.
 */
import MiniSearch from 'minisearch';
import { z } from 'zod';
import { mediaSchema, textSchema } from './public-contract';

// Characters NFKD + mark stripping leave alone. Applied after lower-casing.
const FOLD: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ı: 'i',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ٱ: 'ا',
  ة: 'ه',
  ى: 'ي',
};
for (let i = 0; i < 10; i++) {
  FOLD[String.fromCharCode(0x0660 + i)] = String(i); // Arabic-Indic
  FOLD[String.fromCharCode(0x06f0 + i)] = String(i); // Persian
}
const FOLD_RE = new RegExp('[' + Object.keys(FOLD).join('') + ']', 'g');

/**
 * Lower-case, accent-free, punctuation-free form used for indexing and
 * querying. Arabic: no tashkeel/tatweel, one alif, ة→ه, ى→ي (hamza seats
 * decompose to their base letter under NFKD).
 */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\p{M}ـ]/gu, '')
    .toLowerCase()
    .replace(FOLD_RE, (c) => FOLD[c]!)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})(?=\p{N})|(\p{N})(?=\p{L})/gu, '$1$2 ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NO_SPACES =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const ARABIC_ARTICLE = /^ال(?=\p{Script=Arabic})/u;

/** Normalized tokens; Arabic article dropped, bigrams for unspaced scripts. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(input).split(' ')) {
    if (!raw) continue;
    const token =
      raw.length >= 4 && ARABIC_ARTICLE.test(raw) ? raw.slice(2) : raw;
    out.push(token);
    if (token.length > 2 && NO_SPACES.test(token))
      for (let i = 0; i < token.length - 1; i++)
        out.push(token.slice(i, i + 2));
  }
  return out;
}

export const searchEntrySchema = z.object({
  type: z.enum(['trip', 'package', 'collection']),
  slug: z.string(),
  collection: z.string().nullable(),
  title: textSchema,
  collection_name: textSchema.nullable(),
  thumb: mediaSchema.nullable(),
  from_price_eur: z.number().nonnegative().nullable(),
  duration: textSchema.nullable(),
  fields: z.object({
    title: z.array(z.string()),
    keywords: z.array(z.string()),
    places: z.array(z.string()),
    collection: z.array(z.string()),
  }),
});
export const searchIndexSchema = z.object({
  version: z.string(),
  locale: z.string(),
  suggested: z.array(z.string()),
  entries: z.array(searchEntrySchema),
});
export type SearchEntry = z.infer<typeof searchEntrySchema>;
export type SearchIndex = z.infer<typeof searchIndexSchema>;

export const CORE_SEARCH_LOCALES = [
  'en',
  'it',
  'es',
  'fr',
  'de',
  'ru',
  'tr',
] as const;
/** Staff-edited words visitors might type; matching aid only, never shown. */
export type SearchKeywords = {
  [K in (typeof CORE_SEARCH_LOCALES)[number] | 'extra']?: string[] | undefined;
};
type Display = z.infer<typeof textSchema>;
type Thumb = z.infer<typeof mediaSchema> | null;
export type SourceCollection = {
  slug: string;
  type: 'collection';
  /** Name and short name in every live locale. */
  names: string[];
  keywords: SearchKeywords | null;
  display: { title: Display; thumb: Thumb };
};
export type SourceTrip = {
  slug: string;
  type: 'trip' | 'package';
  collection: string;
  titles: string[];
  /** Highlight items in every live locale. */
  places: string[];
  collectionNames: string[];
  keywords: SearchKeywords | null;
  display: {
    title: Display;
    collection_name: Display | null;
    thumb: Thumb;
    from_price_eur: number | null;
    duration: Display | null;
  };
};
export type SearchSource = {
  locale: string;
  suggested: string[];
  collections: SourceCollection[];
  trips: SourceTrip[];
};

const unique = (values: string[]) => [
  ...new Set(values.map(normalize).filter(Boolean)),
];
const flatKeywords = (k: SearchKeywords | null) =>
  k
    ? [...CORE_SEARCH_LOCALES.flatMap((l) => k[l] ?? []), ...(k.extra ?? [])]
    : [];
/** FNV-1a 64-bit; sync and browser-safe, only used as a cache version. */
function fnv1a(text: string) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Turns catalog text from every locale into the compact public index. */
export function buildSearchIndex(source: SearchSource): SearchIndex {
  const entries: SearchEntry[] = [
    ...source.collections.map((c) => ({
      type: c.type,
      slug: c.slug,
      collection: null,
      title: c.display.title,
      collection_name: null,
      thumb: c.display.thumb,
      from_price_eur: null,
      duration: null,
      fields: {
        title: unique(c.names),
        keywords: unique(flatKeywords(c.keywords)),
        places: [],
        collection: [],
      },
    })),
    ...source.trips.map((t) => ({
      type: t.type,
      slug: t.slug,
      collection: t.collection,
      title: t.display.title,
      collection_name: t.display.collection_name,
      thumb: t.display.thumb,
      from_price_eur: t.display.from_price_eur,
      duration: t.display.duration,
      fields: {
        title: unique(t.titles),
        keywords: unique(flatKeywords(t.keywords)),
        places: unique(t.places),
        collection: unique(t.collectionNames),
      },
    })),
  ];
  return {
    version: fnv1a(JSON.stringify([source.locale, source.suggested, entries])),
    locale: source.locale,
    suggested: source.suggested,
    entries,
  };
}

export const MAX_RESULTS = 8;
export const MAX_COLLECTIONS = 2;
const COLLECTION_WEIGHT = 0.5;
const FIELDS = ['title', 'keywords', 'places', 'collection'] as const;
const BOOST = { title: 5, keywords: 3, places: 2, collection: 1 };
const fuzzy = (term: string) =>
  term.length <= 3 ? 0 : term.length <= 6 ? 1 : 2;

/** Builds the matcher once per index; call the result on every keystroke. */
export function createSearch(index: SearchIndex) {
  const engine = new MiniSearch<Record<string, string | number>>({
    fields: [...FIELDS],
    tokenize,
    processTerm: (t) => t,
    searchOptions: {
      tokenize,
      processTerm: (t) => t,
      prefix: true,
      fuzzy,
      boost: BOOST,
    },
  });
  engine.addAll(
    index.entries.map((e, id) => ({
      id,
      ...Object.fromEntries(FIELDS.map((f) => [f, e.fields[f].join(' | ')])),
    })),
  );
  const rank = new Map(index.suggested.map((slug, i) => [slug, i]));
  const order = (id: number) => rank.get(index.entries[id]!.slug) ?? Infinity;
  return (query: string): SearchEntry[] => {
    if (!tokenize(query).length) return [];
    let hits = engine.search(query, { combineWith: 'AND' });
    if (!hits.length) hits = engine.search(query, { combineWith: 'OR' });
    // A collection is a shortcut, not the answer: when a trip matches as
    // well, the trip comes first.
    const score = (h: (typeof hits)[number]) =>
      index.entries[h.id as number]!.type === 'collection'
        ? h.score * COLLECTION_WEIGHT
        : h.score;
    hits.sort(
      (a, b) =>
        score(b) - score(a) ||
        order(a.id) - order(b.id) ||
        (a.id as number) - (b.id as number),
    );
    const out: SearchEntry[] = [];
    let collections = 0;
    for (const hit of hits) {
      const e = index.entries[hit.id as number]!;
      if (e.type === 'collection' && ++collections > MAX_COLLECTIONS) continue;
      out.push(e);
      if (out.length === MAX_RESULTS) break;
    }
    return out;
  };
}
