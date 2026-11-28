import { describe, expect, it } from 'vitest';
import { summarize, tripHealth, type SeoTripSource } from './seo-health';
import { pageProblems, parsePage, robotsAllows } from './seo-page';

const all = (en: string) => ({
  en,
  it: en + ' it',
  es: en + ' es',
  fr: en + ' fr',
  de: en + ' de',
  ru: en + ' ru',
  tr: en + ' tr',
});
const trip = (over: Partial<SeoTripSource> = {}): SeoTripSource => ({
  id: over.slug ?? 'a',
  slug: 'a',
  kind: 'trip',
  status: 'published',
  collection: 'sea',
  title: all('Tiran Island by Boat'),
  summary: all('Snorkelling · Lunch'),
  description: null,
  seoTitle: null,
  seoDescription: null,
  durationLabel: all('Full day'),
  departureLabel: '08:00',
  prices: [{ amountEur: 30, unit: 'person', isPrimary: true }],
  items: [{ type: 'include', text: all('Lunch') }],
  itineraryCount: 0,
  images: [{ role: 'cover', alt: all('Boat') }],
  ...over,
});

describe('SEO health', () => {
  it('lists missing operational facts without inventing them', () => {
    const [h] = tripHealth([trip()]);
    expect(h!.missing).toEqual(
      expect.arrayContaining([
        'description',
        'excludes',
        'bring',
        'itinerary',
        'photos',
      ]),
    );
    expect(h!.done).toEqual(
      expect.arrayContaining(['includes', 'price', 'cover', 'translations']),
    );
    expect(h!.seo.it.titleSource).toBe('default');
  });

  it('flags missing translations per language', () => {
    const [h] = tripHealth([
      trip({ description: { en: 'Long text', it: 'Testo lungo' } }),
    ]);
    const langs = h!.issues
      .filter((i) => i.code === 'translationMissing')
      .map((i) => i.locale);
    expect(langs).toEqual(['es', 'fr', 'de', 'ru', 'tr']);
  });

  it('reports duplicates only among published trips', () => {
    const twin = { seoDescription: all('Same text for both trips here') };
    const health = tripHealth([
      trip({ slug: 'a', ...twin }),
      trip({ slug: 'b', ...twin, title: all('Other trip') }),
      trip({ slug: 'c', ...twin, status: 'draft', title: all('Draft') }),
    ]);
    const dup = (slug: string) =>
      health
        .find((h) => h.slug === slug)!
        .issues.some((i) => i.code === 'descriptionDuplicate');
    expect([dup('a'), dup('b'), dup('c')]).toEqual([true, true, false]);
    expect(summarize(health).publishedTrips).toBe(2);
  });

  it('prefers admin overrides over defaults', () => {
    const [h] = tripHealth([trip({ seoTitle: all('Custom') })]);
    expect(h!.seo.en).toMatchObject({
      title: 'Custom',
      titleSource: 'override',
    });
  });
});

describe('live page checks', () => {
  const url = 'https://x.test/en/t/a';
  const html = `<html lang="en"><head><title>T</title>
<meta name="description" content="D &amp; more"/>
<link rel="canonical" href="${url}"/>
<link rel="alternate" hrefLang="en" href="${url}"/>
<link rel="alternate" hrefLang="it" href="https://x.test/it/t/a"/>
<link rel="alternate" hrefLang="x-default" href="${url}"/>
</head><body><h1>T</h1><img src="a" alt="A">
<script type="application/ld+json">{"@graph":[{"@type":"TouristTrip"}]}</script>
<a href="/en/c/sea">x</a></body></html>`;

  it('passes a correct page', () => {
    const page = parsePage(html);
    expect(page.description).toBe('D & more');
    expect(page.schemaTypes).toEqual(['TouristTrip']);
    expect(
      pageProblems(page, {
        url,
        locale: 'en',
        locales: ['en', 'it'],
        status: 200,
      }),
    ).toEqual([]);
  });

  it('catches metadata streamed into body and missing languages', () => {
    const page = parsePage(
      html
        .replace('<title>T</title>', '')
        .replace('</body>', '<title>T</title></body>'),
    );
    expect(
      pageProblems(page, {
        url,
        locale: 'en',
        locales: ['en', 'it', 'de'],
        status: 200,
      }),
    ).toEqual(['metadataInBody', 'hreflang']);
  });

  it('reads robots.txt groups like a crawler', () => {
    const robots = `User-agent: *\nAllow: /\nDisallow: /api/\n\nUser-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n`;
    expect(robotsAllows(robots, 'Googlebot', '/en')).toBe(true);
    expect(robotsAllows(robots, 'Googlebot', '/api/x')).toBe(false);
    expect(robotsAllows(robots, 'CCBot', '/en')).toBe(false);
    expect(robotsAllows(robots, 'OAI-SearchBot', '/en')).toBe(true);
  });
});
