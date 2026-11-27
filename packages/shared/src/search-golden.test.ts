/**
 * The search quality contract: real queries a visitor might type, in every
 * core language, with typos and in Arabic, must put the intended trip at the
 * top. Fix keywords or ranking when a row fails; change a row only when its
 * expectation is wrong for a visitor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { searchKeywordsSchema } from './admin';
import { buildSearchIndex, createSearch, CORE_SEARCH_LOCALES } from './search';
import {
  buildRepoSearchSource,
  coreText,
  repoCatalog,
  repoKeywords,
} from './search-golden.fixture';

type Case = { q: string; expect: string | RegExp; top?: 1 | 3 };

const index = buildSearchIndex(buildRepoSearchSource());
const search = createSearch(index);
const matches = (slug: string, want: string | RegExp) =>
  typeof want === 'string' ? slug === want : want.test(slug);
function check({ q, expect: want, top = 1 }: Case) {
  const got = search(q).map((e) => e.slug);
  expect(
    got.slice(0, top).some((slug) => matches(slug, want)),
    `"${q}" → expected ${String(want)} in top ${top}, got [${got.join(', ')}]`,
  ).toBe(true);
}

const published = repoCatalog.trips.filter((t) => t.status === 'published');

describe('every trip by its English title', () => {
  for (const t of published)
    it(t.title, () => check({ q: t.title, expect: t.slug }));
});

describe('every collection by its English name', () => {
  for (const c of repoCatalog.collections)
    it(c.name.en, () => {
      const first = search(c.name.en).find((e) => e.type === 'collection');
      expect(first?.slug).toBe(c.id);
    });
});

const translatedTrips = [
  'tiran-island-boat',
  'dolphin-show',
  'quad-bike-safari',
  'mount-sinai-st-catherine',
  'petra-bus-ferry',
  'luxor-plane-1-day',
  'sea-scope-submarine',
  'spa-turkish-bath',
  'aqua-park',
  'dahab-day-trip',
];
describe('titles in every core language, lower-case without accents', () => {
  for (const slug of translatedTrips) {
    const en = published.find((t) => t.slug === slug)!.title;
    for (const locale of CORE_SEARCH_LOCALES.slice(1)) {
      const title = coreText(en, locale);
      it(`${slug} (${locale})`, () => {
        expect(title, `missing ${locale} title for ${slug}`).toBeTruthy();
        const q = title!.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        check({ q, expect: slug });
      });
    }
  }
});

const cases: Case[] = [
  // Typos
  { q: 'piramds', expect: /^cairo-/, top: 3 },
  { q: 'pyramides', expect: /^cairo-/, top: 3 },
  { q: 'snorkling', expect: /ras-mohammed|tiran/, top: 3 },
  { q: 'ras mohamed', expect: /^ras-mohammed-/ },
  { q: 'ras muhamed', expect: /^ras-mohammed-/ },
  { q: 'tiren', expect: 'tiran-island-boat' },
  { q: 'sinia', expect: 'mount-sinai-st-catherine' },
  { q: 'dolfin', expect: 'dolphin-show' },
  { q: 'dolphines', expect: 'dolphin-show' },
  { q: 'quadd', expect: 'quad-bike-safari' },
  { q: 'submarin', expect: 'sea-scope-submarine' },
  { q: 'luxer', expect: 'luxor-plane-1-day' },
  { q: 'alexandira', expect: 'cairo-alexandria-bus-2-days' },
  { q: 'jerusalim', expect: 'jerusalem-bethlehem' },
  { q: 'aquapak', expect: 'aqua-park' },
  { q: 'parasaling', expect: 'water-activities', top: 3 },
  // Arabic, with spelling variants (no auto-translated text in the index)
  { q: 'دلافين', expect: 'dolphin-show' },
  { q: 'الدلافين', expect: 'dolphin-show' },
  { q: 'دولفين', expect: 'dolphin-show' },
  { q: 'رأس محمد', expect: /^ras-mohammed-/ },
  { q: 'راس محمد', expect: /^ras-mohammed-/ },
  { q: 'الأهرامات', expect: /^cairo-/ },
  { q: 'اهرامات', expect: /^cairo-/ },
  { q: 'الاهرامات', expect: /^cairo-/ },
  { q: 'سفاري', expect: /safari|quad|buggy/, top: 3 },
  { q: 'جزيرة تيران', expect: 'tiran-island-boat' },
  { q: 'جزيره تيران', expect: 'tiran-island-boat' },
  { q: 'تيران', expect: 'tiran-island-boat' },
  { q: 'حمام تركي', expect: 'spa-turkish-bath' },
  { q: 'الأقصر', expect: 'luxor-plane-1-day' },
  { q: 'اقصر', expect: 'luxor-plane-1-day' },
  { q: 'البتراء', expect: 'petra-bus-ferry' },
  { q: 'القدس', expect: 'jerusalem-bethlehem' },
  { q: 'الإسكندرية', expect: 'cairo-alexandria-bus-2-days' },
  { q: 'اسكندرية', expect: 'cairo-alexandria-bus-2-days' },
  { q: 'غواصة', expect: 'sea-scope-submarine' },
  { q: 'أكوا بارك', expect: 'aqua-park' },
  { q: 'باراشوت', expect: 'water-activities', top: 3 },
  { q: 'وشواش', expect: 'wishwash-lake-canyon' },
  { q: 'دهب', expect: /dahab/, top: 3 },
  { q: 'جبل موسى', expect: 'mount-sinai-st-catherine' },
  { q: 'ركوب الخيل', expect: /horse-riding/ },
  { q: 'باجي', expect: 'buggy-car-safari' },
  { q: 'ras mo7amed', expect: /^ras-mohammed-/ },
  // Intent words via keywords, any language
  { q: 'schnorcheln', expect: /ras-mohammed|tiran/, top: 3 },
  { q: 'snorkeling', expect: /ras-mohammed|tiran/, top: 3 },
  { q: 'сафари', expect: /safari|quad|buggy/, top: 3 },
  { q: 'квадроцикл', expect: 'quad-bike-safari' },
  { q: 'tekne', expect: /boat|tiran|speed/, top: 3 },
  { q: 'cammello', expect: /super-safari-5in1|dahab-day-trip/, top: 3 },
  { q: 'camel', expect: /super-safari-5in1|dahab-day-trip/, top: 3 },
  { q: 'horse', expect: /horse-riding/ },
  { q: 'cavallo', expect: /horse-riding/ },
  { q: 'лошадь', expect: /horse-riding/ },
  { q: 'museum', expect: /^cairo-/, top: 3 },
  { q: 'museo', expect: /^cairo-/, top: 3 },
  { q: 'музей', expect: /^cairo-/, top: 3 },
  { q: 'pyramids', expect: /^cairo-/ },
  { q: 'piramidi', expect: /^cairo-/ },
  { q: 'пирамиды', expect: /^cairo-/ },
  { q: 'piramitler', expect: /^cairo-/ },
  { q: '7in1', expect: 'stella-sharm-7in1' },
  { q: '7 in 1', expect: 'stella-sharm-7in1' },
  { q: '5 in 1', expect: 'super-safari-5in1' },
  { q: '5in1', expect: 'super-safari-5in1' },
  { q: 'quad', expect: 'quad-bike-safari' },
  { q: 'buggy', expect: 'buggy-car-safari' },
  { q: 'parasailing', expect: 'water-activities' },
  { q: 'glass bottom', expect: 'glass-bottom-boat' },
  { q: 'speed boat', expect: 'private-speed-boat' },
  { q: 'dinner cruise', expect: 'romantic-dinner-cruise' },
  { q: 'city tour', expect: 'sharm-city-tour' },
  { q: 'blue hole', expect: 'red-canyon-blue-hole' },
  { q: 'three pools', expect: 'red-canyon-three-pools' },
  { q: 'wishwash', expect: 'wishwash-lake-canyon' },
  { q: 'white island', expect: 'ras-mohammed-white-island-boat' },
  { q: 'camping', expect: 'camping-nabq' },
  { q: 'nabq', expect: /nabq/ },
  { q: 'stargazing', expect: /arabian-night-safari|nabq-private-afternoon/ },
  { q: 'dahab day trip', expect: 'dahab-day-trip' },
  { q: 'dahab', expect: /dahab/, top: 3 },
  { q: 'luxor', expect: 'luxor-plane-1-day' },
  { q: 'louxor', expect: 'luxor-plane-1-day' },
  { q: 'луксор', expect: 'luxor-plane-1-day' },
  { q: 'petra', expect: 'petra-bus-ferry' },
  { q: 'jordanie', expect: 'petra-bus-ferry', top: 3 },
  { q: 'jerusalem', expect: 'jerusalem-bethlehem' },
  { q: 'kudüs', expect: 'jerusalem-bethlehem' },
  { q: 'аквапарк', expect: 'aqua-park' },
  { q: 'wasserpark', expect: 'aqua-park' },
  { q: 'hammam', expect: 'spa-turkish-bath' },
  { q: 'massage', expect: 'spa-turkish-bath' },
  { q: 'alexandria', expect: 'cairo-alexandria-bus-2-days' },
  { q: 'mount sinai', expect: 'mount-sinai-st-catherine' },
  { q: 'sunrise sinai', expect: 'mount-sinai-st-catherine' },
  { q: 'monastery', expect: /st-catherine/, top: 3 },
  { q: 'cairo plane', expect: /^cairo-plane-/ },
  { q: 'kairo flug', expect: /^cairo-plane-/ },
  { q: 'yunus', expect: 'dolphin-show' },
  { q: 'delfini', expect: 'dolphin-show' },
  { q: 'dauphins', expect: 'dolphin-show' },
  // A title in another language than the index locale (EN)
  { q: 'isola di tiran', expect: 'tiran-island-boat' },
];

describe('real visitor queries', () => {
  for (const c of cases) it(c.q, () => check(c));
});

describe('negatives', () => {
  it('returns nothing for nonsense', () => {
    expect(search('xqzt')).toEqual([]);
  });
  it('never returns an unpublished package for its own title', () => {
    for (const p of repoCatalog.packages.filter(
      (p) => p.status !== 'published',
    ))
      expect(search(p.title).map((e) => e.slug)).not.toContain(p.slug);
  });
});

describe('keyword coverage', () => {
  const hasArabic = (words: string[] = []) =>
    words.some((w) => /\p{Script=Arabic}/u.test(w));
  const entities = [
    ...published.map(
      (t) => ['trip', t.slug, repoKeywords.trips[t.slug]] as const,
    ),
    ...repoCatalog.collections.map(
      (c) => ['collection', c.id, repoKeywords.collections[c.id]] as const,
    ),
  ];
  for (const [kind, slug, keywords] of entities)
    it(`${kind} ${slug} has keywords in every core language and Arabic`, () => {
      expect(keywords).toBeDefined();
      for (const l of CORE_SEARCH_LOCALES)
        expect(keywords![l]?.length, `${slug}.${l}`).toBeGreaterThan(0);
      expect(hasArabic(keywords!.extra), `${slug}.extra`).toBe(true);
    });
  it('keyword file passes the admin validation the seed uses', () => {
    for (const k of [
      ...Object.values(repoKeywords.trips),
      ...Object.values(repoKeywords.collections),
    ])
      expect(searchKeywordsSchema.safeParse(k).error).toBeUndefined();
  });
  it('keyword file names only real trips, packages and collections', () => {
    const slugs = new Set([
      ...repoCatalog.trips.map((t) => t.slug),
      ...repoCatalog.packages.map((p) => p.slug),
    ]);
    expect(
      Object.keys(repoKeywords.trips).filter((s) => !slugs.has(s)),
    ).toEqual([]);
    const ids = new Set(repoCatalog.collections.map((c) => c.id));
    expect(
      Object.keys(repoKeywords.collections).filter((s) => !ids.has(s)),
    ).toEqual([]);
  });
  it('keyword file ships in the API image the seed runs in', () => {
    const dockerfile = readFileSync(
      fileURLToPath(new URL('../../../infra/Dockerfile', import.meta.url)),
      'utf8',
    );
    expect(dockerfile).toMatch(
      /COPY[^\n]*data\/search-keywords\.json[^\n]*\/app\/data\//,
    );
  });
  it('golden set has at least 120 queries', () => {
    expect(
      published.length +
        repoCatalog.collections.length +
        translatedTrips.length * 6 +
        cases.length,
    ).toBeGreaterThanOrEqual(120);
  });
});
