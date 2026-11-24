// Cache-consistency check (audit 2026-11-24 BUG-06).
// Compares what the website renders with what the API serves for a sample of
// trips: availability (200/404) and the priced offers in the page's JSON-LD.
// Run inside the web container, which reaches both services directly:
//   docker exec -i <web> node --input-type=module - < infra/monitoring/cache-consistency.mjs
// Exit 0 = consistent; 1 = a mismatch persisted past the cache window; 2 = could not check.
const api = process.env.API_INTERNAL_URL ?? 'http://api:4000';
const web = 'http://127.0.0.1:' + (process.env.PORT ?? '3000');
const sample = Number(process.env.STELLA_CONSISTENCY_SAMPLE ?? 6);
// Longer than the web fetch cache window (revalidate 60 s) plus one refresh.
const graceMs = Number(process.env.STELLA_CONSISTENCY_GRACE_MS ?? 90000);
const timeout = () => AbortSignal.timeout(10000);

async function json(url) {
  const response = await fetch(url, { signal: timeout() });
  return {
    status: response.status,
    body: response.ok ? await response.json() : null,
  };
}
function pagePrices(html) {
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([^<]*)<\/script>/g,
  )) {
    try {
      const data = JSON.parse(match[1].replace(/\\u003c/g, '<'));
      if (data?.['@type'] === 'TouristTrip')
        return (data.offers ?? []).map((offer) => Number(offer.price));
    } catch {
      /* not this block */
    }
  }
  return null;
}
async function sampleSlugs() {
  const collections = await json(`${api}/v1/public/collections?locale=en`);
  if (collections.status !== 200)
    throw new Error('collections ' + collections.status);
  const slugs = new Set();
  for (const { slug } of collections.body) {
    const detail = await json(
      `${api}/v1/public/collections/${encodeURIComponent(slug)}?locale=en`,
    );
    for (const trip of detail.body?.trips ?? []) slugs.add(trip.slug);
  }
  // Rotate through the catalog so every trip is compared over a day of runs.
  const all = [...slugs].sort();
  const offset = all.length ? Math.floor(Date.now() / 300000) % all.length : 0;
  return [...all.slice(offset), ...all.slice(0, offset)].slice(0, sample);
}
async function compare(slug) {
  const expected = await json(
    `${api}/v1/public/trips/${encodeURIComponent(slug)}?locale=en`,
  );
  const page = await fetch(`${web}/en/t/${encodeURIComponent(slug)}`, {
    signal: timeout(),
  });
  const html = await page.text();
  if (expected.status === 404)
    return page.status === 404
      ? null
      : `withdrawn trip still served (page ${page.status})`;
  if (expected.status !== 200)
    throw new Error(`API ${expected.status} for ${slug}`);
  if (page.status !== 200) return `page ${page.status}, API 200`;
  const want = expected.body.prices
    .filter((p) => p.amount_eur !== null)
    .map((p) => Number(p.amount_eur));
  const got = pagePrices(html);
  if (!got) return 'page has no trip structured data';
  return JSON.stringify(want) === JSON.stringify(got)
    ? null
    : `price mismatch: API ${JSON.stringify(want)}, page ${JSON.stringify(got)}`;
}
async function mismatches(slugs) {
  const found = new Map();
  for (const slug of slugs) {
    const problem = await compare(slug);
    if (problem) found.set(slug, problem);
  }
  return found;
}

try {
  const slugs = await sampleSlugs();
  if (!slugs.length) throw new Error('no published trips to compare');
  let found = await mismatches(slugs);
  // A staff edit made seconds ago is allowed to take one cache window to show.
  if (found.size) {
    await new Promise((resolve) => setTimeout(resolve, graceMs));
    found = await mismatches([...found.keys()]);
  }
  if (found.size) {
    for (const [slug, problem] of found)
      console.error(`Website out of date: ${slug}: ${problem}`);
    process.exit(1);
  }
  console.log(`Website matches API for ${slugs.length} trips.`);
} catch (error) {
  console.error(
    'Cache consistency check unavailable: ' +
      (error instanceof Error ? error.message : 'unknown'),
  );
  process.exit(2);
}
