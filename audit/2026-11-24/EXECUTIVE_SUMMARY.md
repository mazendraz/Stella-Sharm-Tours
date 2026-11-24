# Executive summary — Stella Sharm Tours audit

Commit `56a4319` (main) · 2026-11-24 · Read-only audit: no application code changed, nothing committed or deployed.

## Verdict: NOT READY for production; READY FOR STAGING once BUG-05 is fixed

The software is well engineered where it matters most: security, booking integrity and pricing. The blocking problem is in the **website's cache layer**. After every deploy or web restart, trips and pages that staff have **withdrawn reappear on the public site** (BUG-05, confirmed twice). Separately, a long-running web process was observed **ignoring price updates** until it was restarted (BUG-06, symptom confirmed, cause not yet found). Both contradict the project's core rule that the admin controls what visitors see. CI is green because it only tests a freshly started stack, where neither problem shows.

## The system

A booking-request website (no online payments) for a Sharm El Sheikh excursion company: Next.js 15 public site and admin, Hono API and pg-boss worker on Node 22, PostgreSQL 16, Caddy, Docker Compose on one VPS, GitHub Actions CI/CD. About 40.8k lines of TypeScript in a pnpm/Turborepo monorepo, 30 tables, 13 migrations, 15 public pages, 18 admin screens, about 125 API routes (110 admin/internal verified by enumeration, 2 public POST, 11 public GET handler registrations, plus health/media). No AI/ML components.

## What was run

| Check                                                                    | Result                                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Unit tests                                                               | **150/150 passed**                                                                                                     |
| PostgreSQL integration tests (fresh container, real seed, restore/scrub) | **70/70 passed**                                                                                                       |
| Lint, typecheck (uncached), formatting                                   | pass                                                                                                                   |
| Production dependency audit                                              | clean                                                                                                                  |
| Full dependency audit                                                    | 2 critical + 7 moderate, **dev tooling only**, not in images; Dependabot fixes failing                                 |
| New: unauthenticated sweep of all 110 admin/internal routes              | 0 unguarded                                                                                                            |
| New: price calculator vs written spec, 100,000 seeded cases              | 0 differences                                                                                                          |
| New: 11 HTTP security probes (CSRF, CORS, traversal, size limits…)       | all held                                                                                                               |
| Seeded browser journeys, mobile 390×844                                  | 14 pass / 1 fail (BUG-06) / 1 environment-blocked; after a web restart 12 pass / 1 fail (BUG-05) / 1 flaky / 1 blocked |
| Performance probe (427 requests, local)                                  | all 200; API catalog reads ~70 ms p50, homepage SSR 181 ms p50                                                         |
| `main` CI                                                                | green                                                                                                                  |

## Findings

| Severity | Count | Items                                                                                                                                                                       |
| -------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical |     0 | —                                                                                                                                                                           |
| High     |     2 | **BUG-05** withdrawn content resurrects after restart/deploy · **BUG-06** web stopped applying invalidations (cause unknown)                                                |
| Medium   |     1 | BUG-01 schema snapshots lag; next generated migration would fail                                                                                                            |
| Low      |     6 | BUG-02 tests overwrite docs, BUG-03 two English-only owner e-mails, BUG-04 1.7 GiB repo, BUG-07 flaky size test, SEC-01 dev advisories, SEC-02 no enforced staging sign-off |
| Info     |     4 | SEC-03 … SEC-06 hardening notes                                                                                                                                             |

**Confirmed security vulnerabilities of medium or higher severity: none.** Authentication (Argon2id, mandatory TOTP for owner/manager, `__Host-` cookies, HMAC-bound CSRF), authorization (all routes guarded, editors limited to drafts), input handling, upload validation, media rights, privacy/erasure and container hardening all held under testing.

## Earlier audit (18 Nov) re-checked

The fresh-seed blocker, bulk-price limit, request-filter/export scope and production picomatch advisory are **fixed** (verified by passing tests). Launch gates 6B (mobile LCP), 7B (alerting, SMTP, off-site restore) and 7C (VPS/HTTPS, legal approval, staff rehearsal) remain **open**.

## Top priorities

1. **BUG-05** — make the web data cache non-persistent (`tmpfs` instead of the `webcache` volume); add a restart regression to CI.
2. **BUG-06** — add a synthetic "API price = page price" monitor with a named recipient; investigate in a staging soak.
3. Close the repair plan's external launch gates (7B, 7C, 6B).
4. **BUG-01** — regenerate Drizzle snapshot; drift check in CI.
5. **SEC-01** — upgrade vitest/drizzle-kit; repair or replace Dependabot.
6. **SEC-02** — require approval on the production environment.
7. **BUG-03** — localize the two owner e-mails (mandatory seven-language rule).
8. **BUG-02** — stop tests writing into `docs/screens`; `git diff --exit-code` in CI.
9. **BUG-04** — untrack ignored media; fix `.dockerignore`.
10. **BUG-07** — fix sub-pixel flake.
11. Log revalidation outcomes in the web process.
12. Document the local toolchain (Node 22 from `.tools`, Playwright browser install).
13. PERF-01 — per-trip API reads before the catalog grows.
14. SEC-05 — `persist-credentials: false` in the deploy job.
15. SEC-03 — decide the staff-lockout policy.
16. SEC-06 — keep FFmpeg patched; consider probing in the worker.
17. Choose Renovate or Dependabot, not both.
18. ARCH-04/05 — co-locate contracts and handlers; one migration mode.
19. Re-run seeded E2E on tablet and desktop; run the admin Playwright suite.
20. Repeat this audit's restart scenario on staging after the fix.

## Not verified

The production VPS (firewall, TLS, hardening), real SMTP/Push/translation providers, GitHub environment protections, off-site backup restore, field performance, tablet/desktop E2E, the admin Playwright suite, and the second-environment runtime test (needs a stack on :4990).

## Where everything is

`audit/2026-11-24/`: this summary, `ARCHITECTURE_AUDIT.md`, `SECURITY_AUDIT.md`, `BUG_REPORT.md`, `TEST_COVERAGE_MATRIX.md`, `PERFORMANCE_REPORT.md`, `DEPENDENCY_AND_INFRASTRUCTURE_REPORT.md`, `PRODUCTION_READINESS_REPORT.md`, `FIX_PRIORITY_ROADMAP.md`, `AUDIT_PROGRESS.md`, `REPRODUCIBLE_TEST_CASES/` (5 scripts + README), `evidence/` (raw outputs).
