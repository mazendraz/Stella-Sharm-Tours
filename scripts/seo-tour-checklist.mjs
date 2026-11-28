// Builds docs/seo/TOUR-VERIFICATION-CHECKLIST.md from the PUBLIC catalogue API:
// what each published tour already states, and what the owner must confirm
// before it can be written on the page. Read-only GETs, one at a time.
//
//   node scripts/seo-tour-checklist.mjs --api https://api.stellasharmtours.com
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fallback;
};
const api = new URL(opt('api', 'http://127.0.0.1:4100')).origin + '/v1/public';
const out = opt('out', 'docs/seo/TOUR-VERIFICATION-CHECKLIST.md');
const get = async (path) => {
  const res = await fetch(api + path, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
};

const collections = await get('/collections?locale=en');
const slugs = [];
for (const c of collections) {
  if (c.kind === 'private_virtual') continue;
  const { trips = [] } = await get(`/collections/${c.slug}?locale=en`);
  for (const t of trips)
    if (!slugs.some((s) => s.slug === t.slug))
      slugs.push({ slug: t.slug, collection: c.name.text });
}

const rows = [];
for (const { slug, collection } of slugs) {
  const en = await get(`/trips/${slug}?locale=en`);
  const it = await get(`/trips/${slug}?locale=it`);
  const items = (type) =>
    en.items.filter((i) => i.type === type).map((i) => i.text.text);
  const prices = en.prices
    .map(
      (p) =>
        (p.amount_eur === null ? 'on request' : `€${p.amount_eur}/${p.unit}`) +
        (p.label ? ` (${p.label.text})` : ''),
    )
    .join(', ');
  const has = {
    description: Boolean(en.description?.text),
    includes: items('include').length > 0,
    excludes: items('exclude').length > 0,
    bring: items('bring').length > 0,
    itinerary: en.itinerary.length > 0 || en.kind === 'package',
    price: en.prices.some((p) => p.amount_eur !== null),
    seo: Boolean(en.seo_title && en.seo_description),
    italian:
      it.title.lang === 'it' &&
      (!en.description || it.description?.lang === 'it'),
  };
  const confirm = [
    !has.description &&
      'Full description (2–4 paragraphs): what the day is like, who it suits.',
    !has.excludes &&
      'What is NOT included (park/marina fees, entrance tickets, drinks, tips, photos…) and the amounts paid on the spot.',
    !has.bring &&
      'What to bring (swimwear, towel, ID/passport, sun protection, warm layer, cash for fees…).',
    !has.itinerary && 'Step-by-step itinerary with approximate times.',
    'Pickup: which hotel areas are covered, pickup window, and whether pickup is free.',
    'Guide languages actually available on this trip (do not list Italian until confirmed).',
    'Minimum age / suitability for children, pregnancy, mobility limits, swimming ability.',
    'Cancellation and weather policy for this trip.',
    'Documents needed (passport for boats/Cairo; Sinai-only visa limits for trips outside South Sinai).',
    !has.price && 'Price, or confirm it stays "on request".',
    ['history', 'beyond'].some((k) => en.collection === k) &&
      'Which entrance tickets are included (museum, sites, monastery).',
    /boat|island|snork|tiran|ras-mohammed|glass|sea-scope|speed/.test(slug) &&
      !items('include').some((t) => /snork/i.test(t)) &&
      'Snorkelling equipment included? Life jackets? Non-swimmers welcome?',
  ].filter(Boolean);
  rows.push({ slug, collection, en, has, prices, confirm, items });
}

const tick = (v) => (v ? 'yes' : '**no**');
let md = `# Tour verification checklist

Generated ${new Date().toISOString().slice(0, 10)} from the public catalogue API
(\`node scripts/seo-tour-checklist.mjs --api <api origin>\`). It lists only what
the website already publishes and the facts the owner must confirm. **Nothing
below "To confirm" may be published until the owner (and, for policies, legal)
approves the wording.** Enter approved facts in the admin trip editor; the SEO
screen (Website → Search (SEO) → Tour pages) then shows the tour as complete.

| Tour | Collection | Description | Not included | Bring | Itinerary | Price | Own SEO texts | Italian |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows
  .map(
    (r) =>
      `| [${r.en.title.text}](#${r.slug}) | ${r.collection} | ${tick(r.has.description)} | ${tick(r.has.excludes)} | ${tick(r.has.bring)} | ${tick(r.has.itinerary)} | ${tick(r.has.price)} | ${tick(r.has.seo)} | ${tick(r.has.italian)} |`,
  )
  .join('\n')}
`;
for (const r of rows) {
  md += `
## ${r.en.title.text}
<a id="${r.slug}"></a>

Page: \`/en/t/${r.slug}\` · Duration: ${r.en.duration_label?.text ?? '—'} · Departure: ${r.en.departure_label ?? '—'} · Format: ${r.en.format} · Prices: ${r.prices || '—'}

- Published highlights: ${r.items('highlight').join('; ') || '—'}
- Published inclusions: ${r.items('include').join('; ') || '—'}
- Published exclusions: ${r.items('exclude').join('; ') || '—'}
- Published optional extras: ${r.items('optional').join('; ') || '—'}

To confirm:
${r.confirm.map((c) => `- [ ] ${c}`).join('\n')}
`;
}
await writeFile(out, md);
console.log(`Wrote ${out}: ${rows.length} tours`);
