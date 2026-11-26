import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  createSearch,
  normalize,
  searchIndexSchema,
  tokenize,
  type SearchEntry,
  type SearchIndex,
  type SearchSource,
} from './search';

describe('normalize', () => {
  it('strips Latin accents', () => {
    expect(normalize('Égypte')).toBe('egypte');
  });
  it('expands German sharp s', () => {
    expect(normalize('Straße')).toBe('strasse');
  });
  it('folds Cyrillic yo', () => {
    expect(normalize('Ёлка')).toBe('елка');
  });
  it('folds Turkish dotted and dotless i', () => {
    expect(normalize('İSTANBUL')).toBe('istanbul');
    expect(normalize('ışık')).toBe('isik');
  });
  it('expands ligatures', () => {
    expect(normalize('Œuvre')).toBe('oeuvre');
    expect(normalize('Æble')).toBe('aeble');
    expect(normalize('Ørsted')).toBe('orsted');
  });
  it('strips Arabic diacritics and unifies hamza forms', () => {
    expect(normalize('رَأْسُ مُحَمَّدٍ')).toBe('راس محمد');
    expect(normalize('إسكندرية')).toBe('اسكندريه');
  });
  it('unifies ta marbuta and alif maqsura', () => {
    expect(normalize('مدينة')).toBe('مدينه');
    expect(normalize('مستشفى')).toBe('مستشفي');
  });
  it('removes Arabic tatweel', () => {
    expect(normalize('سفـــاري')).toBe('سفاري');
  });
  it('converts Arabic-Indic and Persian digits', () => {
    expect(normalize('٣ أيام')).toBe('3 ايام');
    expect(normalize('۷')).toBe('7');
  });
  it('turns punctuation and dashes into single spaces', () => {
    expect(normalize('St. Catherine — Dahab')).toBe('st catherine dahab');
  });
  it('splits letters from digits', () => {
    expect(normalize('5in1')).toBe('5 in 1');
    expect(normalize('7in1')).toBe('7 in 1');
  });
  it('returns an empty string for blank or emoji-only input', () => {
    expect(normalize('   ')).toBe('');
    expect(normalize('🐬🌊')).toBe('');
  });
  it('handles long pasted input', () => {
    expect(() => normalize('ras mohammed '.repeat(40))).not.toThrow();
  });
});

describe('tokenize', () => {
  it('drops the Arabic article from longer words', () => {
    expect(tokenize('الأهرامات')).toEqual(['اهرامات']);
  });
  it('keeps short Arabic words that start with the article letters', () => {
    expect(tokenize('الى')).toEqual(['الي']);
  });
  it('adds character bigrams for scripts without spaces', () => {
    expect(tokenize('金字塔')).toEqual(['金字塔', '金字', '字塔']);
  });
});

const text = (t: string) => ({ text: t, lang: 'en' });
const entry = (
  slug: string,
  fields: Partial<SearchEntry['fields']>,
  type: SearchEntry['type'] = 'trip',
): SearchEntry => ({
  type,
  slug,
  collection: type === 'collection' ? null : 'sea',
  title: text(slug),
  collection_name: null,
  thumb: null,
  from_price_eur: null,
  duration: null,
  fields: {
    title: [],
    keywords: [],
    places: [],
    collection: [],
    ...fields,
  },
});
const fixture = (
  entries: SearchEntry[],
  suggested: string[] = [],
): SearchIndex => ({ version: 'v', locale: 'en', suggested, entries });

const base = fixture([
  entry('cairo-bus', {
    title: ['cairo by bus', 'cairo in autobus'],
    places: ['giza pyramids', 'great sphinx'],
    collection: ['pharaohs temples'],
  }),
  entry('tiran-island-boat', {
    title: ['tiran island by boat', 'isola di tiran in barca'],
    keywords: ['snorkeling', 'coral'],
  }),
  entry('ras-mohammed-bus', {
    title: ['ras mohammed by bus'],
    keywords: ['snorkeling', 'national park'],
  }),
  entry('super-safari-5in1', {
    title: ['super safari 5 in 1'],
    keywords: ['quad', 'camel'],
  }),
]);

describe('createSearch', () => {
  const search = createSearch(base);
  const slugs = (q: string) => search(q).map((e) => e.slug);

  it('matches prefixes', () => {
    expect(slugs('pyra')).toContain('cairo-bus');
  });
  it('tolerates one edit in a 5-letter word', () => {
    expect(slugs('tiren')[0]).toBe('tiran-island-boat');
  });
  it('tolerates two edits in a 9-letter word', () => {
    expect(slugs('snorkling')).toEqual(
      expect.arrayContaining(['tiran-island-boat', 'ras-mohammed-bus']),
    );
  });
  it('does not fuzz words of three letters or less', () => {
    expect(slugs('spx')).toEqual([]);
  });
  it('ranks a title match above a keyword-only match', () => {
    const s = createSearch(
      fixture([
        entry('kw', { keywords: ['dolphin'] }),
        entry('ti', { title: ['dolphin show'] }),
      ]),
    );
    expect(s('dolphin').map((e) => e.slug)).toEqual(['ti', 'kw']);
  });
  it('ranks a trip above a collection matching the same word', () => {
    const s = createSearch(
      fixture([
        entry('beyond', { keywords: ['jerusalem'] }, 'collection'),
        entry('jerusalem-trip', { title: ['jerusalem and bethlehem'] }),
      ]),
    );
    expect(s('jerusalem').map((e) => e.slug)).toEqual([
      'jerusalem-trip',
      'beyond',
    ]);
  });
  it('falls back to any-word matching when all words cannot match', () => {
    expect(slugs('tiran xyzzyq')[0]).toBe('tiran-island-boat');
  });
  it('returns nothing for blank queries', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });
  it('matches digits written with or without spaces', () => {
    expect(slugs('5in1')[0]).toBe('super-safari-5in1');
    expect(slugs('5 in 1')[0]).toBe('super-safari-5in1');
  });
  it('finds a title in another language than the index locale', () => {
    expect(slugs('isola tiran')[0]).toBe('tiran-island-boat');
  });
  it('caps collections at two and results at eight', () => {
    const many = fixture([
      ...Array.from({ length: 4 }, (_, i) =>
        entry('c' + i, { title: ['safari world ' + i] }, 'collection'),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        entry('t' + i, { title: ['safari trip ' + i] }),
      ),
    ]);
    const hits = createSearch(many)('safari');
    expect(hits).toHaveLength(8);
    const few = fixture([
      ...Array.from({ length: 4 }, (_, i) =>
        entry('c' + i, { title: ['safari world ' + i] }, 'collection'),
      ),
      entry('t', { title: ['safari trip'] }),
    ]);
    const mixed = createSearch(few)('safari');
    expect(mixed.filter((e) => e.type === 'collection')).toHaveLength(2);
    expect(mixed).toHaveLength(3);
  });
  it('breaks ties by suggested order, then index order', () => {
    const tie = fixture(
      [
        entry('a', { title: ['boat trip'] }),
        entry('b', { title: ['boat trip'] }),
        entry('c', { title: ['boat trip'] }),
      ],
      ['c'],
    );
    expect(createSearch(tie)('boat trip').map((e) => e.slug)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
  it('survives emoji and very long queries', () => {
    expect(search('🐬')).toEqual([]);
    expect(() => search('tiran '.repeat(40))).not.toThrow();
  });
});

describe('buildSearchIndex', () => {
  const t = (s: string) => ({ text: s, lang: 'en' });
  const source = (title = 'Tiran Island'): SearchSource => ({
    locale: 'en',
    suggested: ['tiran'],
    collections: [
      {
        slug: 'sea',
        type: 'collection',
        names: ['The Red Sea', 'Il Mar Rosso', 'Sea'],
        keywords: { en: ['diving'], extra: ['البحر الأحمر'] },
        display: { title: t('The Red Sea'), thumb: null },
      },
    ],
    trips: [
      {
        slug: 'tiran',
        type: 'trip',
        collection: 'sea',
        titles: [title, 'Isola di Tiran', 'tiran island'],
        places: ['Tiran', 'Tiran'],
        collectionNames: ['The Red Sea', 'Il Mar Rosso'],
        keywords: { it: ['snorkeling'], extra: ['جزيرة تيران'] },
        display: {
          title: t(title),
          collection_name: t('The Red Sea'),
          thumb: null,
          from_price_eur: 35,
          duration: t('1 day'),
        },
      },
    ],
  });

  it('normalizes and de-duplicates text across locales', () => {
    const trip = buildSearchIndex(source()).entries[1]!;
    expect(trip.fields.title).toEqual(['tiran island', 'isola di tiran']);
    expect(trip.fields.places).toEqual(['tiran']);
  });
  it('merges keywords from every locale and the extra list', () => {
    const trip = buildSearchIndex(source()).entries[1]!;
    expect(trip.fields.keywords).toEqual(['snorkeling', 'جزيره تيران']);
  });
  it('lists collections first, then trips, carrying display fields', () => {
    const index = buildSearchIndex(source());
    expect(index.entries.map((e) => [e.type, e.slug])).toEqual([
      ['collection', 'sea'],
      ['trip', 'tiran'],
    ]);
    expect(index.entries[0]!.fields.title).toEqual([
      'the red sea',
      'il mar rosso',
      'sea',
    ]);
    expect(index.entries[1]).toMatchObject({
      collection: 'sea',
      from_price_eur: 35,
      title: { text: 'Tiran Island' },
    });
    expect(index.suggested).toEqual(['tiran']);
  });
  it('changes version only when content changes', () => {
    const a = buildSearchIndex(source()).version;
    expect(buildSearchIndex(source()).version).toBe(a);
    expect(buildSearchIndex(source('Tiran Isle')).version).not.toBe(a);
  });
  it('produces an index that matches the public schema', () => {
    expect(
      searchIndexSchema.safeParse(buildSearchIndex(source())).success,
    ).toBe(true);
  });
});
