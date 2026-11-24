# Fix priority roadmap — Stella Sharm Tours

No fixes were applied during this audit. Each item lists the regression test that proves it fixed. Per AGENTS.md: one item per PR, CHANGELOG entry, seven-language copy where text changes.

## P0 — before production traffic

| Item                                                                                                   | Type                        | Change                                                                                                                                                                                                                                                                                     | Side effects / protected behaviour                                                               | Regression test                                                                                                              | Approval                  |
| ------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **BUG-05** withdrawn content resurrects after restart/deploy                                           | Functional / data integrity | Replace `webcache` named volume with `tmpfs` (e.g. `/app/apps/web/.next/cache:size=256m`) in `docker-compose.prod.yml` (+ verify/staging overlays); remove the volume definition                                                                                                           | First request per page/locale after restart goes to the API (~70–100 ms). PB-01, PB-15 restored. | `withdrawn-content-resurrection.sh` in the seeded CI job: unpublish → revalidate → restart web → 404 and absent from sitemap | Owner (deployment change) |
| **BUG-06** long-running web stopped applying invalidations                                             | Reliability                 | (1) Synthetic monitor: every 5 min compare one trip's primary price from `/v1/public/trips/:slug` with the rendered page; alert after 2 consecutive mismatches. (2) Staging soak with `NEXT_PRIVATE_DEBUG_CACHE=1` to find the trigger. (3) Re-assess the local Next patch / upgrade path. | None for the monitor.                                                                            | Monitor fires in a staging drill where the web container is paused from revalidation                                         | Owner (alert recipient)   |
| Open launch gates from the repair plan (6B LCP, 7B notifications/off-site restore, 7C VPS/HTTPS/legal) | Operations                  | As documented in `reports/Release repair plan.md`                                                                                                                                                                                                                                          | —                                                                                                | As documented there                                                                                                          | Owner, legal              |

## P1 — high priority

| Item                                                     | Type                       | Change                                                                                                                                        | Regression test                        |
| -------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **BUG-01** schema snapshot drift                         | Reliability / dev workflow | Create a matching `meta/0013_snapshot.json` + journal entry with a no-op SQL body; add `schema-drift-probe.sh` (or `drizzle-kit check`) to CI | CI step fails on any generated diff    |
| **SEC-01** dev-dependency advisories, failing Dependabot | Security hygiene           | Upgrade `vitest` ≥ 4.1.12 and `drizzle-kit` (drop `@esbuild-kit`); fix the Dependabot failure or disable it in favour of Renovate             | `pnpm audit --audit-level high` passes |
| **SEC-02** staging acceptance not enforced               | Process                    | Required reviewers on the `production` GitHub environment, or SHA-bound staging acceptance check in the deploy job                            | Tag deploy blocks without approval     |

## P2 — medium

| Item                                      | Type                  | Change                                                                             |
| ----------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| **BUG-02** tests overwrite `docs/screens` | Test hygiene          | Write to ignored dir unless `UPDATE_SCREENS=1`; CI `git diff --exit-code`          |
| **BUG-03** English-only owner e-mails     | i18n (mandatory rule) | Seven-language copy + readable price diff body                                     |
| **BUG-04** repository/media weight        | Operations            | `git rm -r --cached` ignored media; extend `.dockerignore`; optional LFS           |
| **BUG-07** flaky touch-target check       | Test reliability      | Integer rounding in assertion                                                      |
| PERF-01 full-catalog reads per request    | Performance (future)  | Per-trip query or revision-keyed memo                                              |
| Observability of revalidation             | Operations            | Log `/api/revalidate` tag counts and outcomes in web; expose a cache-health metric |

## P3 — low / hardening

| Item                               | Change                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------- |
| SEC-03 staff account lockout DoS   | Decide policy; optionally exempt TOTP-enabled accounts from persistent lock |
| SEC-04 in-memory limiter eviction  | Accept; add Caddy rate limit if abuse appears                               |
| SEC-05 deploy checkout credentials | `persist-credentials: false`                                                |
| SEC-06 FFmpeg on uploads           | Track Debian security updates; optionally probe in worker                   |
| ARCH-04 large route modules        | Gradual co-location of contract + handler                                   |
| Toolchain docs                     | README: use `.tools` Node 22 / pnpm, Playwright browser install step        |
| Pick Renovate **or** Dependabot    | Avoid duplicate update PRs                                                  |

## By category

- **Security remediation:** SEC-01, SEC-02, SEC-05, SEC-06 (no medium+ vulnerabilities found).
- **Functional fixes:** BUG-05, BUG-03.
- **Reliability:** BUG-06, BUG-01, monitoring.
- **Performance:** PERF-01, repair-plan 6B.
- **Architecture:** ARCH-01 (cache design), ARCH-04, ARCH-05, ARCH-06.
- **Technical debt:** BUG-02, BUG-04, BUG-07, toolchain docs.
