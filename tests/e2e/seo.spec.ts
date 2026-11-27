import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import en from '../../apps/web/messages/en.json' with { type: 'json' };
import it from '../../apps/web/messages/it.json' with { type: 'json' };

const run = promisify(execFile);
const html = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const origin = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
).origin;

// One crawl is enough; the viewport does not change server HTML.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'mobile');
});

test('the public site passes the SEO regression check', async ({ baseURL }) => {
  test.setTimeout(300_000);
  let output = '';
  try {
    ({ stdout: output } = await run(
      process.execPath,
      ['scripts/seo-check.mjs', '--base', baseURL!, '--origin', origin],
      { maxBuffer: 10 * 1024 * 1024 },
    ));
  } catch (error) {
    output = (error as { stdout?: string }).stdout ?? String(error);
  }
  expect(output, output).toContain('Errors: 0');
});

test('metadata is in <head> for AI search crawlers too', async ({
  request,
}) => {
  for (const ua of [
    'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
    'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
  ]) {
    const body = await (
      await request.get('/it', { headers: { 'user-agent': ua } })
    ).text();
    const head = body.slice(0, body.indexOf('</head>'));
    expect(head).toContain('<title>' + html(it.seoHomeTitle) + '</title>');
    expect(head).toContain('rel="canonical" href="' + origin + '/it"');
    expect(head).toMatch(/hrefLang="x-default"/);
  }
});

test('trip pages describe the tour, its offers and breadcrumbs', async ({
  request,
}) => {
  const page = await (
    await request.get('/en/t/ras-mohammed-white-island-boat')
  ).text();
  const nodes = [
    ...page.matchAll(
      /<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs,
    ),
  ].flatMap((m) => JSON.parse(m[1]!)['@graph'] ?? []);
  const byType = (type: string) => nodes.find((n) => n['@type'] === type);
  const trip = byType('TouristTrip');
  expect(trip.provider).toEqual({ '@id': origin + '/#organization' });
  expect(trip.itinerary['@type']).toBe('ItemList');
  for (const offer of trip.offers ?? [])
    expect(offer).toMatchObject({ priceCurrency: 'EUR' });
  expect(byType('TravelAgency')['@id']).toBe(origin + '/#organization');
  expect(
    byType('BreadcrumbList').itemListElement.map(
      (i: { position: number }) => i.position,
    ),
  ).toEqual([1, 2, 3]);
  expect(JSON.stringify(nodes)).not.toMatch(/aggregateRating|"review"/);
});

test('home metadata is localized and robots keeps private routes out', async ({
  request,
}) => {
  const page = await (await request.get('/en')).text();
  expect(page).toContain('<title>' + html(en.seoHomeTitle) + '</title>');
  expect(page).toContain('content="' + html(en.seoHomeDescription) + '"');
  expect(page).toContain('property="og:locale" content="en_GB"');
  const robots = await (await request.get('/robots.txt')).text();
  for (const path of ['/api/', '/*/request/', '/*/my-trip', '/*/preview'])
    expect(robots).toContain('Disallow: ' + path);
  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toMatch(/^# Stella Sharm Tours/);
});
