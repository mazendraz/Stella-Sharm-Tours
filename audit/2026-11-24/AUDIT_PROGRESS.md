# Audit progress — Stella Sharm Tours

Audit start: 2026-11-24 · Commit under audit: `56a4319` (main, clean tree at start)
Workspace: `audit/2026-11-24/` (untracked; nothing committed, nothing deployed)

## Phases

| #   | Phase                          | Status                                                                     |
| --- | ------------------------------ | -------------------------------------------------------------------------- |
| 1   | Discovery & classification     | Done                                                                       |
| 2   | Governance review              | Done (AGENTS.md, README, docs/, prior audit `reports/`)                    |
| 3   | Environment & execution safety | Done — DB targets verified local; integration uses Testcontainers          |
| 4   | Baseline                       | Done — see evidence/                                                       |
| 5   | Architecture & inventory       | Done                                                                       |
| 6   | Code quality                   | Done (targeted: API core, auth, booking, media, jobs, infra)               |
| 7   | Security                       | Done (static + route sweep + header probes)                                |
| 8   | Functional workflows           | Done via existing integration suite + E2E (see coverage matrix)            |
| 9   | Database                       | Done — schema drift found (BUG-01)                                         |
| 10  | Scenario generation            | Done — 100,000 seeded price cases, 110-route auth sweep                    |
| 11  | Concurrency                    | Existing suite only (5-way idempotent submission); no new tests            |
| 12  | Failure injection              | Partial — existing suite (API outage 503, rollback sims); no new injection |
| 13  | UI / E2E                       | Done on mobile (390×844); tablet/desktop not re-run. Found BUG-05/06/07    |
| 14  | AI/ML                          | Not applicable                                                             |
| 15  | Performance                    | Done (local lab probe); no production/field data                           |
| 16  | CI/CD & infra                  | Done (static); VPS not accessible                                          |
| 17  | Verification & dedup           | Done                                                                       |
| 18  | Reports                        | Done                                                                       |

## Important discoveries

- BUG-05 (High, CONFIRMED): withdrawn trips/pages reappear after a web restart — persistent Next fetch cache + in-memory tag manifest + 200-only caching.
- BUG-06 (High impact, symptom CONFIRMED): long-running web process ignored revalidation; restart cleared it; trigger unknown.
- BUG-01 (Medium): Drizzle snapshot drift.
- Security: no medium+ vulnerabilities; 110/110 admin routes guarded.

## Side effects of the audit on the environment (all reverted or intended)

- 77 tracked screenshots under `docs/screens/` were overwritten by the repo's own E2E specs; restored with `git checkout -- docs/screens`.
- Local verification stack (`stella-integration-verify`): web container restarted 3×; trip `tiran-island-boat` price and `glass-bottom-boat` status changed temporarily and restored (verified); E2E created and removed its synthetic bookings/admin users per its own setup/teardown.
- `main` CI completed green during the audit.
- **Not made by the audit:** at 03:56–03:57 local time, `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` were changed in this checkout by another actor (vitest 3.2.7 → 4.1.12; `esbuild`/`minimatch` overrides citing the Dependabot advisories — i.e. a SEC-01 remediation in progress). Left untouched. All audit results above were produced on the unmodified `56a4319` dependency tree; the SEC-01 status must be re-checked once that change lands.

## Continuation plan (what a follow-up audit should run)

1. E2E on tablet (768) and desktop (1440) projects; admin Playwright suite (`pnpm test:e2e:admin`).
2. Install Playwright's pinned Chromium 1254 (`pnpm exec playwright install chromium`) and rerun with `PLAYWRIGHT_CHANNEL=chromium` to match CI exactly.
3. Lighthouse mobile on representative production media (Phase 6B of the repair plan is still open).
4. Staging/VPS: TLS, firewall, server-hardening, real SMTP, off-site restic restore, alert delivery.
5. Bring up the second environment on :4990 to run `runtime.spec.ts:131`.
