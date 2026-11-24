# Reproducible test cases (audit 2026-11-24)

All scripts are deterministic and safe by construction. Run from the repository root with Node 22 (`.tools/node_modules/node-win-x64/bin` on Windows) and the repo's `node_modules`.

| ID        | File                                        | Needs                                                | What it shows                                                                               | Result on `56a4319`                                                                 |
| --------- | ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| AUDIT-T01 | `route-auth-sweep.ts`                       | nothing (DB stub)                                    | Every `/v1/admin/*` route rejects unauthenticated calls before touching the DB              | 110 routes, 0 unguarded (`/internal/media-access` open by design, blocked at Caddy) |
| AUDIT-T02 | `price-differential-fuzz.ts [seed] [cases]` | nothing                                              | `estimateTrip` vs an independent implementation of the written pricing spec                 | 5 seeds × 20,000 = 100,000 cases, 0 diffs                                           |
| AUDIT-T03 | `schema-drift-probe.sh`                     | nothing (works on a temp copy)                       | Drizzle snapshot drift → BUG-01                                                             | DRIFT DETECTED (exit 1)                                                             |
| AUDIT-T04 | `perf-probe.mjs [n] [concurrency]`          | local verification stack                             | Latency/throughput of public endpoints (loopback-only guard)                                | see PERFORMANCE_REPORT                                                              |
| AUDIT-T05 | `withdrawn-content-resurrection.sh [slug]`  | local verification stack (`pnpm infra:verify:setup`) | BUG-05: unpublished trip returns after a web restart. Always re-publishes the trip on exit. | S1=404, S2=200, S3=200                                                              |

Commands:

```sh
node_modules/.bin/tsx audit/2026-11-24/REPRODUCIBLE_TEST_CASES/route-auth-sweep.ts
node_modules/.bin/tsx audit/2026-11-24/REPRODUCIBLE_TEST_CASES/price-differential-fuzz.ts 20261124 20000
bash audit/2026-11-24/REPRODUCIBLE_TEST_CASES/schema-drift-probe.sh
node audit/2026-11-24/REPRODUCIBLE_TEST_CASES/perf-probe.mjs 60 6
bash audit/2026-11-24/REPRODUCIBLE_TEST_CASES/withdrawn-content-resurrection.sh glass-bottom-boat
```

BUG-06 (stuck invalidation) has no standalone script: it needs a web process in the long-running state observed during the audit. Its reproduction steps (DB price change → `POST /api/revalidate` from the worker container → page unchanged) are in `BUG_REPORT.md`; the same steps after a restart are the control.

Existing repository suites used: `pnpm test`, `pnpm test:integration`, `PLAYWRIGHT_CHANNEL=chrome node scripts/test-integration-browser.mjs --project mobile`. Note: the browser suites overwrite tracked files in `docs/screens/` (BUG-02); run `git checkout -- docs/screens` afterwards.
