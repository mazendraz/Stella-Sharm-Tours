# Remediation plan (proposed, waiting for approval; nothing has been implemented)

Order matters: R1–R3 restore a trustworthy release path, and every later fix depends on them. Each item lists its finding IDs, scope, and how it will be verified. Each step is one small PR, following `AGENTS.md` (one task per PR, CHANGELOG updated).

## Stage A: Release blockers (engineering)

| #   | Action                                                                                                                                                                                                                                        | Findings       | Effort | Verification                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ---------------------------------------------------------------------------------------- |
| R1  | Stop concurrent edits. Add `Stella-Videos/` (and media under `reports/`) to `.gitignore`. Commit the working tree as reviewable commits on `admin-rebuild`: API (booking-quote, publication languages), web, admin, infra and CI, tests, docs | PR-01, QUAL-03 | S      | `git status` clean; `git clone` + `pnpm i --frozen-lockfile` + `pnpm typecheck` succeeds |
| R2  | Create the GitHub remote. Push `main`, then create `develop`. Protect both (PR review, required `Checks`). Configure `staging` and `production` environments with branch rules and reviewers. Set the deploy secrets                          | PR-01, SEC-05  | S      | GitHub settings screenshot or API output                                                 |
| R3  | Open a PR from `admin-rebuild` to `develop` and get the full CI green, including integration-browser, admin dashboard e2e, secret scans and the audit                                                                                         | PR-01, QA-01   | M      | A green CI run on the SHA                                                                |
| R4  | Fix SEC-01: rate-limit the web `/api/trips` and `/api/trip-story` proxies per client and stop using the trusted header for them. Add a regression test                                                                                        | SEC-01         | S      | Repeat the reproduction burst: SSR stays 200, attacker gets 429                          |
| R5  | Fix SEC-02: LRU eviction in the public bucket map, with the trusted key always admitted. Normalise IPv6 to /64 (SEC-03 code part)                                                                                                             | SEC-02, SEC-03 | S      | Unit tests for map saturation and /64                                                    |
| R6  | Fix OPS-01: log a sanitised error name, message, stack, route and PG code in the API and worker                                                                                                                                               | OPS-01         | S      | Unit test with an injected logger                                                        |
| R7  | Pin GitHub Actions to SHAs and fix the CI concurrency group                                                                                                                                                                                   | SEC-04, CI-01  | S      | grep, plus two pushes to `develop`                                                       |

## Stage B: Staging gate (engineering and operator)

| #   | Action                                                                                                                                                                                | Findings      | Verification                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ |
| R8  | Deploy `develop` to staging on the real VPS. Verify client IP fidelity for IPv4 and IPv6 behind Docker, and fix it (disable AAAA, or enable Docker IPv6 with `userland-proxy: false`) | SEC-03        | Caddy and API see real client IPs                |
| R9  | Configure restic off-site backup, remove `OFFSITE_BACKUP=pending`, and run a restore drill (`restore-snapshot.sh` → `restore-to-staging.sh`). Record it in `docs/RUNBOOK.md`          | INF-02, DB-01 | Dated drill record; `check.sh production` passes |
| R10 | Make the alert webhook mandatory for production and add an external uptime and TLS monitor                                                                                            | INF-01        | Stop web on staging and receive an alert         |
| R11 | Add the per-role DB timeouts (`statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`) in `applyRuntimePrivileges`                                                 | DB-02         | `pg_roles.rolconfig`                             |
| R12 | Run the authenticated ZAP scan on staging, the admin e2e suites, Lighthouse mobile, and manual accessibility on real devices                                                          | QA-01, PR-02  | Reports attached to the release PR               |

## Stage C: Owner-side launch prerequisites

| #   | Action                                                                                    | Findings      |
| --- | ----------------------------------------------------------------------------------------- | ------------- |
| R13 | Domain and DNS, VPS operator, production SMTP, VAPID keys                                 | PR-02         |
| R14 | Legal entity, privacy policy (7 languages) including backup retention and erasure wording | PR-02, SEC-10 |
| R15 | Media rights and source records for every public asset, plus missing real imagery         | PR-02         |
| R16 | Native-speaker review of the IT, ES, FR, DE, RU and TR dictionaries and seeded content    | PR-02         |

## Stage D: Post-launch hardening (not blocking)

| #   | Action                                                                                                                                    | Findings                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| R17 | Erasure re-application after restore (hashed erasure ledger)                                                                              | SEC-10, DB-01           |
| R18 | Move media rendering outside the DB transaction; clean up orphaned originals on upload failure                                            | BUG-02, BUG-03          |
| R19 | Cache the media authorization decision; add a Caddy edge rate limit                                                                       | INF-03                  |
| R20 | Purpose-specific AAD and HMAC prefixes (with read fallback)                                                                               | SEC-06                  |
| R21 | Additive index migration (sessions.user_id, rate_buckets.expires_at, outbox partial, booking_request_items.trip_id, audit_log.created_at) | DB-04                   |
| R22 | Spam heuristics: signed form token; per-phone limit that excludes spam-marked requests                                                    | SEC-07, SEC-08          |
| R23 | Escape `%` and `_` in admin search; unify the poster regexes; move pnpm settings to `pnpm-workspace.yaml` with `engine-strict`            | SEC-09, BUG-04, QUAL-02 |
| R24 | Mobile LCP work toward under 2.5 s                                                                                                        | PR-02                   |

## Readiness after each stage

- After **A**: **READY FOR STAGING**
- After **B and C**: **PRODUCTION CANDIDATE**
- After a successful staging soak (about 1 week of real traffic and alerts): production launch

**Approval needed:** confirm Stage A (R1–R7) before any change is made. R1 and R2 need the owner's decision on the GitHub organisation or repo and branch policy, and R1 changes no code, only commits what exists.
