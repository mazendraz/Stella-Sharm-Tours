// Monthly search and AI-visibility benchmark (manual collection, no scraping).
//
//   node scripts/visibility-benchmark.mjs template 2026-12
//     → docs/seo/benchmark/results/2026-12.csv with one row per prompt ×
//       platform, result columns empty, for a person to fill in.
//   node scripts/visibility-benchmark.mjs summary
//     → per month and platform: rows tested, mention / citation /
//       recommendation rates (non-branded prompts), top competitors named.
//
// Rows left blank are "not tested" and are excluded from every rate, so a
// partial run never looks like a zero.
import { readFile, readdir, writeFile, access } from 'node:fs/promises';

const dir = 'docs/seo/benchmark';
const columns = [
  'month',
  'id',
  'kind',
  'lang',
  'branded',
  'platform',
  'prompt',
  'tested_on',
  'tester',
  'ai_answer_shown',
  'mentioned',
  'cited_url',
  'recommended_position',
  'organic_position',
  'competitors',
  'sources',
  'notes',
];
const csv = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function parse(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') endCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (cell || row.length) endRow();
  const [head, ...body] = rows.filter((r) => r.some(Boolean));
  return body.map((r) =>
    Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])),
  );
}

const [command, month] = process.argv.slice(2);
const spec = JSON.parse(await readFile(`${dir}/prompts.json`, 'utf8'));

if (command === 'template') {
  if (!/^\d{4}-\d{2}$/.test(month ?? ''))
    throw new Error('Usage: template YYYY-MM');
  const file = `${dir}/results/${month}.csv`;
  if (
    await access(file).then(
      () => true,
      () => false,
    )
  )
    throw new Error(file + ' exists; not overwriting recorded results');
  const lines = [columns.join(',')];
  // Classic results: search engines only. AI prompts: every platform.
  for (const q of spec.searchQueries)
    for (const platform of ['google-search', 'bing'])
      lines.push(
        [month, q.id, 'search', q.lang, q.branded, platform, q.text]
          .map(csv)
          .join(',') + ','.repeat(columns.length - 7),
      );
  for (const p of spec.aiPrompts)
    for (const platform of spec.platforms.filter(
      (x) => x !== 'google-search' && x !== 'bing',
    ))
      lines.push(
        [month, p.id, 'ai', p.lang, p.branded, platform, p.text]
          .map(csv)
          .join(',') + ','.repeat(columns.length - 7),
      );
  await writeFile(file, lines.join('\n') + '\n');
  console.log(`Wrote ${file} (${lines.length - 1} rows to fill)`);
} else if (command === 'summary') {
  const files = (await readdir(`${dir}/results`))
    .filter((f) => /^\d{4}-\d{2}\.csv$/.test(f))
    .sort();
  if (!files.length) console.log('No results recorded yet.');
  for (const f of files) {
    const rows = parse(await readFile(`${dir}/results/${f}`, 'utf8')).filter(
      (r) => r.tested_on && r.branded !== 'true',
    );
    console.log(`\n${f.slice(0, 7)} — ${rows.length} non-branded rows tested`);
    const by = new Map();
    for (const r of rows)
      by.set(r.platform, [...(by.get(r.platform) ?? []), r]);
    for (const [platform, list] of by) {
      const rate = (pred) =>
        Math.round((100 * list.filter(pred).length) / list.length) + '%';
      console.log(
        `  ${platform.padEnd(20)} n=${String(list.length).padStart(3)}  mentioned ${rate((r) => r.mentioned === 'y')}  cited ${rate((r) => Boolean(r.cited_url))}  recommended ${rate((r) => Boolean(r.recommended_position))}  top-3 organic ${rate((r) => r.organic_position && Number(r.organic_position) <= 3)}`,
      );
    }
    const named = new Map();
    for (const r of rows)
      for (const c of r.competitors
        .split(';')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean))
        named.set(c, (named.get(c) ?? 0) + 1);
    const top = [...named].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top.length)
      console.log(
        '  competitors named: ' + top.map(([c, n]) => `${c} (${n})`).join(', '),
      );
  }
} else {
  console.log(
    'Usage: node scripts/visibility-benchmark.mjs template YYYY-MM | summary',
  );
}
