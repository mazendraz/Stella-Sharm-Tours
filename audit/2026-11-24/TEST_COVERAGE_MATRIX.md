# Test coverage matrix — Stella Sharm Tours

Legend: ✅ covered and passed in this audit · ⚠️ covered but failed/flaky · ◻ covered by an existing test that was not run in this audit · ✖ no automated coverage found

## Execution summary (this audit)

| Suite                                                        |     Executed |    Passed |                                         Failed |                    Blocked | Evidence                                           |
| ------------------------------------------------------------ | -----------: | --------: | ---------------------------------------------: | -------------------------: | -------------------------------------------------- |
| Unit (Vitest, 20 files)                                      |          150 |       150 |                                              0 |                          0 | `evidence/unit-tests.txt`                          |
| Integration (Vitest + PostgreSQL 16 Testcontainers, 2 files) |           70 |        70 |                                              0 |                          0 | `evidence/integration-tests.txt`                   |
| Lint / typecheck (6 tasks) / format                          |     3 checks |         3 |                                              0 |                          0 | `evidence/lint.txt`, `typecheck.txt`, `format.txt` |
| Dependency audit (prod / all)                                |            2 |         1 |                                   1 (dev-only) |                          0 | `evidence/audit-*.txt`                             |
| **New:** admin route auth sweep                              |   110 routes |       110 |                                              0 |                          0 | `evidence/route-auth-sweep.txt`                    |
| **New:** price differential fuzz (5 seeds × 20,000)          |      100,000 |   100,000 |                                              0 |                          0 | `evidence/price-fuzz.txt`                          |
| **New:** HTTP security probes                                |           11 |        11 |                                              0 |                          0 | `evidence/http-probes.txt`                         |
| **New:** schema drift probe                                  |            1 |         0 |                                     1 (BUG-01) |                          0 | `evidence/schema-drift.txt`                        |
| Seeded E2E, mobile, run 1                                    |           16 |         0 |                                              0 | 16 (browser build missing) | superseded                                         |
| Seeded E2E, mobile, run 2 (system Chrome)                    |           16 |        14 |                                     1 (BUG-06) |                  1 (:4990) | `evidence/e2e-integration-mobile.txt`              |
| Seeded E2E, `admin.spec` isolated reruns                     |            2 |         0 |                                     2 (BUG-06) |                          0 | `evidence/e2e-admin-cache-rerun*.txt`              |
| Seeded E2E, trigger run after web restart                    |           15 |        12 |                       2 (BUG-05, BUG-07 flaky) |                  1 (:4990) | `evidence/e2e-trigger-run.txt`                     |
| **New:** cache-layer reproductions                           |            4 |         — | 2 reproduce BUG-06/BUG-05, 2 control runs pass |                          0 | `evidence/cache-layer-probe.txt`, BUG_REPORT       |
| **New:** performance probe                                   | 427 requests | 427 × 200 |                                              0 |                          0 | `evidence/perf-probe.txt`                          |

Unique scenarios: 150 + 70 + 110 + 11 + 1 + 16 distinct E2E tests + 4 reproductions ≈ **362**, plus 100,000 generated price inputs (one property). Repeated executions are the E2E reruns and the 427 performance requests.
Not run: fixture browser suite (`pnpm test:e2e`), admin Playwright suite (`pnpm test:e2e:admin`), tablet/desktop seeded projects, Lighthouse, `infra/tests/operations.sh`, restic restore, gitleaks scans (CI runs all of these).

## Protected behaviours

| ID    | Behaviour (source)                                                            | Components                                 | Coverage                                                                                         | Gap / added                                                                                |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| PB-01 | Prices come only from the DB; admin changes them without a deploy (AGENTS.md) | API prices, worker revalidation, web cache | ✅ API/DB · ⚠️ **web display**                                                                   | BUG-05, BUG-06; add restart + long-uptime regression                                       |
| PB-02 | No online payments; bookings are requests + WhatsApp hand-off                 | `requests.ts`, booking UI                  | ✅ integration + seeded private booking                                                          | —                                                                                          |
| PB-03 | Price calculation per documented rules                                        | `shared/price.ts`, `booking-quote.ts`      | ✅ unit + integration + **100k fuzz**                                                            | fuzz added                                                                                 |
| PB-04 | Booking validation, quote-change 409, idempotent retry                        | `requests.ts`                              | ✅ integration (5 concurrent submissions)                                                        | —                                                                                          |
| PB-05 | Private tours first-class; private-only trips cannot be booked as group       | quote/booking                              | ✅ integration + seeded E2E                                                                      | —                                                                                          |
| PB-06 | Never invent content; "On request" for missing values                         | web components                             | ✅ grep audit + unit                                                                             | —                                                                                          |
| PB-07 | Seven core languages complete for all user-facing text                        | i18n, messages, seed                       | ✅ unit + seeded languages E2E (7/7, one flaky size check)                                       | BUG-03 (two owner e-mails)                                                                 |
| PB-08 | Hero slides admin-controlled, independent of collections                      | homepage API                               | ✅ integration + real-API admin E2E (not reached due to BUG-06 failure earlier in the same test) | —                                                                                          |
| PB-09 | Auth: Argon2id, MFA for owner/manager, sessions, CSRF                         | `auth.ts`                                  | ✅ integration + **route sweep**                                                                 | —                                                                                          |
| PB-10 | RBAC per role                                                                 | `admin-contracts.ts`, guards               | ✅ integration + route sweep (unauthenticated only)                                              | Authenticated cross-role matrix is covered by integration tests, not by this audit's sweep |
| PB-11 | Upload validation (magic bytes, limits, no SVG)                               | `media.ts`                                 | ✅ integration (HEIC, video, SVG rejection)                                                      | —                                                                                          |
| PB-12 | Media with unknown/withdrawn rights never public                              | `serve-media.ts`, Caddy                    | ✅ integration + seeded runtime E2E                                                              | —                                                                                          |
| PB-13 | No customer data to translation provider                                      | `translate.ts`                             | ✅ integration                                                                                   | —                                                                                          |
| PB-14 | Retention 18 months; erasure survives restore                                 | `privacy.ts`, jobs                         | ✅ unit + integration (restore/scrub)                                                            | —                                                                                          |
| PB-15 | Unpublished content not public / not in sitemap                               | web + API                                  | ✅ API · ⚠️ **web after restart**                                                                | BUG-05                                                                                     |
| PB-16 | WCAG 2.2 AA, 44 px targets                                                    | web/admin                                  | ✅ seeded E2E (axe, sizes) · ⚠️ flaky sub-pixel                                                  | BUG-07                                                                                     |
| PB-17 | Mobile first (390×844)                                                        | all UI                                     | ✅ mobile project                                                                                | tablet/desktop not re-run                                                                  |

## Interfaces and workflows

| Interface / workflow                                                                                          | Existing tests                                                           | This audit                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| 11 public GET routes                                                                                          | integration, fixture + seeded E2E                                        | probes (dup params, traversal, locale injection), perf |
| `POST /v1/requests`, `/v1/requests/quote`                                                                     | integration (validation, rate limits, origin, quote change, idempotency) | origin/content-type/size probes                        |
| 110 admin/internal routes                                                                                     | integration (security + real mutations)                                  | unauthenticated sweep                                  |
| Web route handlers (`/api/revalidate`, `/api/trips`, `/api/trip-story`, `/api/client-error`, sitemap, robots) | fixture E2E, seeded runtime                                              | revalidate exercised directly (BUG-05/06)              |
| Worker jobs (12 types, 6 crons)                                                                               | integration (outbox, notifications, purge, media, translation budget)    | —                                                      |
| Deployment scripts                                                                                            | `infra/tests/operations.sh` (simulated)                                  | static review only                                     |
| Backup/restore                                                                                                | integration restore/scrub; restic fixture in CI                          | —                                                      |
| State machines: request status, publication (draft → review → published), media processing                    | integration                                                              | —                                                      |
| Migrations                                                                                                    | fresh migrate + seed twice (integration)                                 | drift probe (BUG-01)                                   |

## Untested areas

- Behaviour of the web tier across **restarts and long uptimes** (now covered by `withdrawn-content-resurrection.sh`; nothing in CI).
- Real SMTP, Web Push to real browsers, translation provider (mocked/injected in tests).
- VPS-level configuration (firewall, TLS, server hardening).
- Load beyond a single client; database throughput under concurrent bookings.
- Authenticated role × route matrix as a generated test (currently hand-written cases).
