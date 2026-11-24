# Stella Sharm Tours: production readiness audit, executive summary

**Date:** 2026-11-23 · **Scope:** the whole repository working tree on branch `admin-rebuild` (HEAD `b3f7fac` plus 166 modified and 103 untracked files) and the local production-like verification stack (`stella-integration-verify`, images built 2026-11-19).
**Method:** Phase 1 was read-only. No application code, configuration, migration or environment file was changed. No production system or data was touched. Secrets were not read or printed (only environment variable _names_ were listed).

## Verdict: **NOT READY**

The application code is unusually well-engineered for this stage. Authentication, CSRF, RBAC, least-privilege database roles, upload validation, hardened containers, backup-before-migrate and automatic deploy rollback are all in place and backed by tests that pass. The verdict is driven by **release-process and launch blockers**, not by a broken core:

1. The code being released is not under version control in any reproducible way. There is no Git remote, the working tree has 269 uncommitted changes, and `HEAD` alone does not build: `apps/api/src/app.ts` imports the untracked `booking-quote.ts`. CI and the release pipeline have never run.
2. The end-to-end browser checks do not cover the current source. The running verification images predate today's booking-form changes, and the booking journey fails against them.
3. Launch prerequisites that the project itself lists in `QUESTIONS.md` are still open: domain and VPS, production SMTP, an off-site backup with a restore drill, an external alerting channel, legal entity and privacy policy, media rights, and native-speaker review.

After items 1–2 are closed and CI is green on a pushed branch, the codebase would be at **READY FOR STAGING**. Production also needs item 3 plus the Medium fixes in the remediation plan.

## What was actually executed (evidence, not claims)

| Check                                                                     | Result                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` (7 packages)                                             | Pass                                                                                                                           |
| `pnpm lint` (`--max-warnings 0`)                                          | Pass                                                                                                                           |
| `pnpm test` (vitest unit)                                                 | **140/140 passed** (17 files)                                                                                                  |
| `pnpm test:integration` (real PostgreSQL 16 via testcontainers)           | **68/68 passed** (2 files)                                                                                                     |
| `pnpm audit --prod --audit-level moderate`                                | No known vulnerabilities                                                                                                       |
| Playwright integration journeys, mobile 390×844, against the verify stack | **10 passed, 3 failed**: 2 from image/source skew (QA-01), 1 needs a second environment on :4990 that was not running          |
| HTTP probes of the verify stack                                           | `/v1/openapi.json` 401, `/v1/admin/me` 401, security headers present, per-IP limiter returns 429 after 600 requests per minute |
| Rate-limit abuse reproduction (local stack only)                          | **Confirmed SEC-01**: 173 of 5,000 requests to the public web proxy got 503 once the shared trusted bucket was spent           |

**Not executed:** admin write e2e suites, tablet and desktop Playwright projects, Lighthouse, ZAP, and anything against a real VPS. The project's own documents report mobile LCP at about 3.1 s, above the 2.5 s budget. That figure was not re-measured here.

## Findings by severity

| Severity      | Count | IDs                                                                                                        |
| ------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| Critical      | 1     | PR-01                                                                                                      |
| High          | 2     | PR-02, QA-01                                                                                               |
| Medium        | 7     | SEC-01, SEC-02, SEC-10, OPS-01, INF-01, INF-02, DB-01 (DB-01, SEC-10 and INF-02 share a backup root cause) |
| Low           | 12    | SEC-03 … SEC-08, BUG-02, BUG-03, DB-02, DB-04, INF-03, CI-01                                               |
| Informational | 11    | SEC-09, SEC-I1…I3, BUG-04, QUAL-01…03, DB-03, DB-05, QA-02                                                 |

No Critical or High **code vulnerability** was found. No SQL injection, XSS, IDOR, authentication bypass or privilege escalation was confirmed. Every route registered under `/v1/admin/*` was checked for a guard and a permission.

## Release blockers (explicit)

| ID             | Blocker                                                               | Owner action                                                            |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| PR-01          | No remote, uncommitted tree, `HEAD` does not build, CI never run      | Commit in reviewable PRs, push, protect branches, get CI green          |
| QA-01          | Booking journey unverified on current source                          | Rebuild images from the committed SHA and run the full CI browser suite |
| PR-02 / INF-02 | Off-site backup and restore drill not done                            | Configure restic, perform and record a restore                          |
| PR-02 / INF-01 | No external alerting or uptime monitor                                | Configure the webhook and an off-host uptime check                      |
| PR-02          | Legal entity, privacy policy, media rights, SMTP, DNS/VPS             | Owner decisions and credentials                                         |
| SEC-01         | Public proxy can exhaust the shared catalog-reader quota (reproduced) | Fix before public launch                                                |

## Report index

- [ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md): system map, dependency map, architectural risks
- [BUGS-AND-QUALITY.md](BUGS-AND-QUALITY.md): runtime, logic and maintainability findings
- [SECURITY-AUDIT.md](SECURITY-AUDIT.md): OWASP and ASVS review, confirmed and suspected issues
- [DATABASE-AUDIT.md](DATABASE-AUDIT.md): schema, grants, migrations, indexes, backups
- [WORKFLOW-AND-QA.md](WORKFLOW-AND-QA.md): journeys, test results, coverage gaps
- [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md): infrastructure, CI/CD, operations checklist
- [REMEDIATION-PLAN.md](REMEDIATION-PLAN.md): ordered fix plan, waiting for approval

Earlier report, still relevant for context: `reports/Stella Sharm release audit.md` (2026-11-18).
