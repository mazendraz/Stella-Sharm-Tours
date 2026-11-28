#!/usr/bin/env node
/**
 * SEO regression check for the public website.
 *
 *   node scripts/seo-check.mjs --base http://localhost:3000
 *   node scripts/seo-check.mjs --base https://stellasharmtours.com --limit 60
 *
 * Reads robots.txt and sitemap.xml, then fetches every sitemap URL (or the
 * first --limit) and checks: HTTP 200, no noindex, <html lang>, one <h1>,
 * a unique title and meta description per language, a self-referencing
 * canonical on the expected origin, reciprocal hreflang with x-default,
 * parseable JSON-LD, <img> alt attributes and internal link status.
 * Private routes must stay out of the index.
 *
 * Errors exit 1 (deploy blockers); warnings are reported only. Read-only:
 * GET requests, four at a time. --json prints the full report.
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = new URL(opt('base', 'http://localhost:3000')).origin;
const origin = new URL(opt('origin', base)).origin;
const limit = Number(opt('limit', '0')) || Infinity;
const asJson = args.includes('--json');
const ua = 'StellaSeoCheck/1.0 (+site QA)';

const errors = [];
const warnings = [];
const err = (url, msg) => errors.push({ url, msg });
const warn = (url, msg) => warnings.push({ url, msg });

async function get(url, redirect = 'manual') {
  const res = await fetch(url, {
    redirect,
    headers: { 'user-agent': ua },
    signal: AbortSignal.timeout(30_000),
  });
  return { res, body: await res.text() };
}

const attr = (tag, name) =>
  new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'");
const local = (url) => url.replace(origin, base);

function parsePage(html) {
  // Read the whole document so streamed metadata is still found, then report
  // separately whether it was outside <head>.
  const headEnd = html.indexOf('</head>');
  const titleAt = html.search(/<title>/i);
  const head = html;
  const metas = [...head.matchAll(/<meta\s[^>]*>/gi)].map((m) => m[0]);
  const meta = (key, value) =>
    metas.find((t) => attr(t, key) === value)?.match(/content="([^"]*)"/)?.[1];
  const links = [...head.matchAll(/<link\s[^>]*>/gi)].map((m) => m[0]);
  return {
    metadataInBody: titleAt > headEnd && headEnd >= 0,
    lang: /<html[^>]*\slang="([^"]+)"/i.exec(html)?.[1],
    title: decode(/<title>([^<]*)<\/title>/i.exec(head)?.[1] ?? '').trim(),
    description: decode(meta('name', 'description') ?? '').trim(),
    robots: meta('name', 'robots') ?? '',
    ogImage: meta('property', 'og:image'),
    canonical: links
      .filter((t) => attr(t, 'rel') === 'canonical')
      .map((t) => attr(t, 'href'))[0],
    alternates: Object.fromEntries(
      links
        .filter((t) => attr(t, 'rel') === 'alternate' && /hreflang/i.test(t))
        .map((t) => [
          attr(t, 'hrefLang') ?? attr(t, 'hreflang'),
          attr(t, 'href'),
        ]),
    ),
    h1: (html.match(/<h1[\s>]/gi) ?? []).length,
    jsonld: [
      ...html.matchAll(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ].map((m) => m[1]),
    imgNoAlt: [...html.matchAll(/<img\s[^>]*>/gi)]
      .map((m) => m[0])
      .filter((t) => !/\salt="/i.test(t)).length,
    hrefs: [...html.matchAll(/<a\s[^>]*href="(\/[^"#?]*)/gi)].map((m) => m[1]),
  };
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await fn(items[n]);
      }
    }),
  );
  return out;
}

// robots.txt
const robots = await get(base + '/robots.txt');
if (robots.res.status !== 200)
  err('/robots.txt', 'status ' + robots.res.status);
if (
  /^Disallow:\s*\/\s*$/m.test(
    robots.body.split(/User-agent:\s*\*/i)[1]?.split(/User-agent:/i)[0] ?? '',
  )
)
  err('/robots.txt', 'the * group disallows the whole site');
if (!/Sitemap:\s*\S+/i.test(robots.body)) err('/robots.txt', 'no Sitemap line');

// sitemap.xml
const sitemap = await get(base + '/sitemap.xml');
if (sitemap.res.status !== 200) {
  err('/sitemap.xml', 'status ' + sitemap.res.status);
}
const entries = [...sitemap.body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
  (m) => ({
    loc: decode(/<loc>([^<]+)<\/loc>/.exec(m[1])?.[1] ?? ''),
    alternates: Object.fromEntries(
      [...m[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((a) => [
        a[1],
        decode(a[2]),
      ]),
    ),
  }),
);
if (!entries.length) err('/sitemap.xml', 'no <url> entries');
const offOrigin = entries.filter((e) => !e.loc.startsWith(origin + '/'));
if (offOrigin.length)
  err(
    offOrigin[0].loc,
    `${offOrigin.length} sitemap URLs are not on ${origin}`,
  );
const locs = entries.map((e) => e.loc);
if (new Set(locs).size !== locs.length) err('/sitemap.xml', 'duplicate <loc>');
for (const path of ['/request/', '/my-trip', '/preview', '/api/'])
  if (locs.some((l) => l.includes(path)))
    err('/sitemap.xml', 'private path in sitemap: ' + path);

// Pages
const pages = new Map();
await pool(entries.slice(0, limit), 4, async (entry) => {
  const url = entry.loc;
  let page;
  try {
    const { res, body } = await get(local(url));
    if (res.status !== 200) return err(url, 'status ' + res.status);
    if (/noindex/i.test(res.headers.get('x-robots-tag') ?? ''))
      err(url, 'X-Robots-Tag noindex on a sitemap URL');
    page = parsePage(body);
  } catch (e) {
    return err(url, 'fetch failed: ' + e.message);
  }
  pages.set(url, page);
  const locale = new URL(url).pathname.split('/')[1];
  if (page.lang !== locale)
    err(url, `html lang="${page.lang}", expected ${locale}`);
  if (/noindex/i.test(page.robots))
    err(url, 'meta robots noindex on a sitemap URL');
  if (page.metadataInBody)
    err(url, 'title/canonical/hreflang streamed into <body>, not <head>');
  if (!page.title) err(url, 'missing <title>');
  else if (page.title.length > 70)
    warn(url, `title is ${page.title.length} chars`);
  if (!page.description) warn(url, 'missing meta description');
  else if (page.description.length > 170)
    warn(url, `description is ${page.description.length} chars`);
  if (page.canonical !== url) err(url, `canonical ${page.canonical}`);
  if (page.h1 !== 1) warn(url, `${page.h1} <h1> elements`);
  if (!page.ogImage) warn(url, 'missing og:image');
  if (page.imgNoAlt) err(url, `${page.imgNoAlt} <img> without alt`);
  if (!page.jsonld.length) warn(url, 'no JSON-LD');
  for (const block of page.jsonld) {
    try {
      const data = JSON.parse(block);
      if (data['@context'] !== 'https://schema.org')
        err(url, 'JSON-LD without schema.org @context');
      if (/"(aggregateRating|review)"/.test(block))
        warn(url, 'review markup present: confirm it is genuine and visible');
    } catch {
      err(url, 'JSON-LD does not parse');
    }
  }
  const alts = page.alternates;
  if (alts[locale] !== url) err(url, 'hreflang does not reference itself');
  if (!alts['x-default']) err(url, 'no x-default hreflang');
  const expected = JSON.stringify(Object.entries(entry.alternates).sort());
  if (JSON.stringify(Object.entries(alts).sort()) !== expected)
    err(url, 'page hreflang set differs from the sitemap');
});

// Reciprocity and duplicates
const byLocale = {};
for (const [url, page] of pages) {
  for (const [lang, href] of Object.entries(page.alternates)) {
    if (lang === 'x-default') continue;
    const other = pages.get(href);
    if (other && !Object.values(other.alternates).includes(url))
      err(url, `hreflang ${lang} is not reciprocated by ${href}`);
  }
  const locale = new URL(url).pathname.split('/')[1];
  (byLocale[locale] ??= []).push([url, page]);
}
for (const [locale, list] of Object.entries(byLocale)) {
  for (const key of ['title', 'description']) {
    const seen = new Map();
    for (const [url, page] of list) {
      if (!page[key]) continue;
      if (seen.has(page[key]))
        warn(
          url,
          `duplicate ${key} in ${locale} (same as ${seen.get(page[key])})`,
        );
      else seen.set(page[key], url);
    }
  }
}

// Private routes stay out of the index
for (const path of ['/en/my-trip', '/en/preview']) {
  const { res, body } = await get(base + path);
  const indexable =
    res.status === 200 &&
    !/noindex/i.test(res.headers.get('x-robots-tag') ?? '') &&
    !/<meta name="robots" content="[^"]*noindex/i.test(body);
  if (indexable) err(path, 'private route is indexable');
}
const missing = await get(base + '/en/t/seo-check-missing-page');
if (missing.res.status !== 404)
  err(
    '/en/t/seo-check-missing-page',
    'missing trip returns ' + missing.res.status + ' (soft 404)',
  );

// Internal links found on the checked pages
const hrefs = [...new Set([...pages.values()].flatMap((p) => p.hrefs))];
const linked = new Set(hrefs.map((h) => origin + h.replace(/\/$/, '')));
await pool(hrefs, 4, async (href) => {
  try {
    const { res } = await get(base + href);
    if (res.status >= 400)
      err(base + href, `internal link returns ${res.status}`);
  } catch (e) {
    err(base + href, 'internal link failed: ' + e.message);
  }
});
for (const url of pages.keys())
  if (!linked.has(url) && !/\/[a-z]{2,3}$/.test(url))
    warn(url, 'no internal link found to this page from the checked pages');

const report = {
  base,
  origin,
  checked: pages.size,
  sitemapUrls: entries.length,
  internalLinks: hrefs.length,
  errors,
  warnings,
};
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `SEO check ${base}: ${pages.size}/${entries.length} sitemap URLs, ${hrefs.length} internal links`,
  );
  const group = (list) => {
    const counts = new Map();
    for (const { url, msg } of list) {
      const key = msg.replace(/\d+/g, 'N').replace(/\(same as .*\)/, '');
      const item = counts.get(key) ?? { n: 0, example: url, msg };
      item.n++;
      counts.set(key, item);
    }
    for (const { n, example, msg } of counts.values())
      console.log(`  ${n}× ${msg}  e.g. ${example}`);
  };
  console.log(`Errors: ${errors.length}`);
  group(errors);
  console.log(`Warnings: ${warnings.length}`);
  group(warnings);
}
process.exit(errors.length ? 1 : 0);
