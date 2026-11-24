// AUDIT-T04 — Bounded latency probe against the LOCAL verification stack only.
// Read-only GETs. Total requests per endpoint are kept well under the API's
// 600/min per-address public read limit so the probe never measures 429s.
// Usage: node audit/2026-11-24/REPRODUCIBLE_TEST_CASES/perf-probe.mjs [n] [concurrency]
const n = Number(process.argv[2] ?? 60);
const concurrency = Number(process.argv[3] ?? 6);
const targets = [
  ['api /healthz', 'http://127.0.0.1:4984/healthz'],
  [
    'api /v1/public/locales',
    'http://127.0.0.1:4984/v1/public/locales?locale=en',
  ],
  ['api /v1/public/site', 'http://127.0.0.1:4984/v1/public/site?locale=en'],
  [
    'api /v1/public/collections',
    'http://127.0.0.1:4984/v1/public/collections?locale=en',
  ],
  [
    'api /v1/public/trips/quad-bike-safari',
    'http://127.0.0.1:4984/v1/public/trips/quad-bike-safari?locale=en',
  ],
  ['web /en (SSR, via Caddy)', 'http://localhost:4983/en'],
  [
    'web /en/t/quad-bike-safari (SSR)',
    'http://localhost:4983/en/t/quad-bike-safari',
  ],
];
for (const host of new Set(targets.map(([, u]) => new URL(u).hostname)))
  if (!['127.0.0.1', 'localhost'].includes(host))
    throw new Error('loopback only');
const pct = (xs, p) =>
  xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
const results = [];
for (const [name, url] of targets) {
  // one cold request first
  const c0 = performance.now();
  const cold = await fetch(url);
  await cold.arrayBuffer();
  const coldMs = performance.now() - c0;
  const times = [];
  const statuses = {};
  let bytes = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < n) {
        next++;
        const s = performance.now();
        const r = await fetch(url);
        const b = await r.arrayBuffer();
        times.push(performance.now() - s);
        bytes = b.byteLength;
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      }
    }),
  );
  const wall = performance.now() - t0;
  times.sort((a, b) => a - b);
  results.push({
    endpoint: name,
    cold_status: cold.status,
    cold_ms: +coldMs.toFixed(1),
    n,
    concurrency,
    statuses,
    p50_ms: +pct(times, 50).toFixed(1),
    p95_ms: +pct(times, 95).toFixed(1),
    max_ms: +times.at(-1).toFixed(1),
    rps: +((n / wall) * 1000).toFixed(1),
    body_bytes: bytes,
  });
}
console.table(results);
console.log(JSON.stringify(results));
