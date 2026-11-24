# Performance report — Stella Sharm Tours

## Environment

| Item    | Value                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host    | Windows 11 workstation, 20 logical CPUs, Docker Desktop 29.6.2 (WSL2)                                                                                               |
| Stack   | Local verification stack (`stella-integration-verify`): production images built 2026-11-23 18:38 UTC, PostgreSQL 16, Caddy, seeded with the real catalog (38 trips) |
| Limits  | Production compose limits applied (web/api 768 MiB, etc.)                                                                                                           |
| Network | Loopback; no TLS, no WAN latency                                                                                                                                    |

**These are lab numbers, not production numbers.** They show relative cost and bottlenecks, not what a guest in Sharm El Sheikh on 4G experiences.

## Method

`REPRODUCIBLE_TEST_CASES/perf-probe.mjs 60 6`: per endpoint, 1 cold request, then 60 requests at concurrency 6. Read-only GETs, under the API's 600/min per-address limit (all 427 responses were 200). Web pages were requested through Caddy (`:4983`) shortly after a web container restart, so the first requests include cache fills.

## Measurements

| Endpoint                                 | Cold ms | p50 ms | p95 ms | Throughput (req/s) |        Body |
| ---------------------------------------- | ------: | -----: | -----: | -----------------: | ----------: |
| API `/healthz`                           |    81.4 |    3.3 |   10.9 |              1,231 |        31 B |
| API `/v1/public/locales` (settings only) |     4.2 |    7.1 |    9.1 |                828 |      1.3 KB |
| API `/v1/public/site`                    |    17.2 |   79.8 |  100.8 |                 74 |       50 KB |
| API `/v1/public/collections`             |    12.5 |   70.4 |   79.1 |                 83 |       19 KB |
| API `/v1/public/trips/quad-bike-safari`  |    10.8 |   68.0 |   90.0 |                 85 |      3.3 KB |
| Web `/en` (SSR via Caddy)                |    81.8 |  181.2 |  272.5 |                 32 | 156 KB HTML |
| Web `/en/t/quad-bike-safari` (SSR)       |    38.5 |   94.7 |  117.9 |                 63 |  53 KB HTML |

Resources right after the probe: web 141 MiB, API 130 MiB, worker 99 MiB, PostgreSQL 82 MiB; CPU near idle.

## Findings

| ID      | Observation                                                                                                                                                | Assessment                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERF-01 | Single-trip, collection and site reads all cost ~70–80 ms on the API and saturate at ~80 req/s at concurrency 6, regardless of payload (3 KB vs 50 KB).    | Each call rebuilds the full catalog (`loadCatalog`). Fine at this traffic level **because the web data cache absorbs reads**. This makes the cache-correctness defects (BUG-05/06) more consequential: disabling persistence is safe, but disabling caching would not be. |
| PERF-02 | Homepage SSR p50 181 ms / p95 273 ms with 156 KB HTML; every page is dynamically rendered (per-request CSP nonce) with `Cache-Control: private, no-store`. | Acceptable on a single VPS for the expected traffic. HTML size is dominated by the 18-locale `hreflang`/inline data; worth checking with Lighthouse on real media.                                                                                                        |
| PERF-03 | Making the web data cache ephemeral (BUG-05 fix) costs one ~70 ms API read per (resource, locale) after each restart.                                      | Negligible; recommended.                                                                                                                                                                                                                                                  |
| PERF-04 | Web fetch-cache volume held **7,820 entries (39 MB)** after ~12 days of local testing, with no eviction.                                                   | Production growth is bounded by (resources × locales) but stale keys (renamed slugs, removed locales) accumulate forever on a persistent volume. Another reason for an ephemeral cache.                                                                                   |

## Not measured

Real-device mobile Lighthouse with production media (the 19 Nov repair plan records homepage/trip median LCP of 3.27 s vs a 2.5 s target, phase 6B still open); field Core Web Vitals; PostgreSQL under realistic concurrent bookings (the integration suite covers 5 concurrent submissions for correctness, not throughput); media pipeline throughput for large videos; behaviour under the VPS's actual CPU/RAM.

## Recommendations

1. Fix BUG-05 with a `tmpfs` cache and re-measure cold-start page latency (expect +70–100 ms on the first view per page per locale).
2. Before the catalog grows significantly, give `/v1/public/trips/:slug` a per-trip query path or a short in-process memo keyed by the catalog revision.
3. Close repair-plan phase 6B (LCP) with three cold mobile Lighthouse runs on production-like media.
