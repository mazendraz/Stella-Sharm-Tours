import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Fixed disposable local target: never send a scan to a customer's live site.
const origin = 'http://localhost:4983';
const args = process.argv.slice(2);
const count = Number(args[0] ?? 3);
if (args.length > 1 || ![1, 3, 5].includes(count))
  throw new Error(
    'Usage: node scripts/verify-performance.mjs [1, 3 or 5 runs]',
  );
for (const port of [4984, 4985]) {
  const response = await fetch(`http://localhost:${port}/readyz`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Local verification stack is not ready');
}
const directory = resolve('.local/build-order/performance');
await mkdir(directory, { recursive: true });
const cli = resolve('node_modules/lighthouse/cli/index.js');
const rows = [];
for (const [name, path, desktop] of [
  ['home-mobile', '/en', false],
  ['trip-mobile', '/en/t/quad-bike-safari', false],
  ['home-desktop', '/en', true],
]) {
  const runs = [];
  for (let run = 1; run <= count; run++) {
    const file = resolve(directory, `${name}-${run}.json`);
    await new Promise((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          cli,
          origin + path,
          '--only-categories=performance,accessibility',
          '--output=json',
          '--output-path=' + file,
          '--chrome-flags=--headless --no-sandbox',
          '--quiet',
          ...(desktop ? ['--preset=desktop'] : []),
        ],
        { stdio: 'inherit' },
      );
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? done() : reject(new Error('Lighthouse failed: ' + code)),
      );
    });
    const report = JSON.parse(await readFile(file, 'utf8'));
    if (report.runtimeError) throw new Error(report.runtimeError.code);
    const row = {
      time: report.fetchTime,
      performance: Math.round(report.categories.performance.score * 100),
      accessibility: Math.round(report.categories.accessibility.score * 100),
      lcp: Math.round(report.audits['largest-contentful-paint'].numericValue),
      cls: report.audits['cumulative-layout-shift'].numericValue,
      tbt: Math.round(report.audits['total-blocking-time'].numericValue),
    };
    runs.push(row);
    console.log(name, run, JSON.stringify(row));
  }
  const median = (key) =>
    runs.map((run) => run[key]).sort((a, b) => a - b)[Math.floor(count / 2)];
  const summary = {
    name,
    runs,
    performance: median('performance'),
    accessibility: median('accessibility'),
    lcp: median('lcp'),
    cls: median('cls'),
    tbt: median('tbt'),
  };
  summary.scoresPass =
    summary.performance >= (desktop ? 95 : 90) &&
    runs.every((run) => run.accessibility === 100);
  summary.budgetPass = summary.cls < 0.05 && (desktop || summary.lcp < 2500);
  rows.push(summary);
}
await writeFile(
  resolve(directory, 'summary.json'),
  JSON.stringify({ origin, count, rows }, null, 2) + '\n',
);
console.table(
  rows.map(
    ({
      name,
      performance,
      accessibility,
      lcp,
      cls,
      tbt,
      scoresPass,
      budgetPass,
    }) => ({
      name,
      performance,
      accessibility,
      lcp,
      cls,
      tbt,
      scoresPass,
      budgetPass,
    }),
  ),
);
// A score pass never silently hides a failed, stricter rendering budget.
if (rows.some((row) => !row.scoresPass || !row.budgetPass))
  process.exitCode = 1;
