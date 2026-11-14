# File 07 · Scaffold — implementation audit and local gate

The user's 2026-11-11 instruction supersedes the older continuous-run prompt:
work through one execution file, phase by phase, then stop for the user before
starting another file. The user explicitly selected numerical file order:
00 overview, then 01 frontend, then 02 backend, followed by 03–07. The owner
authorized this file on 2026-11-13 after file 06. Stop before file 08.

The old checklist described an initial empty scaffold and was never reconciled
after implementation. This file now audits the existing applications; it does
not replace working products with empty shells or recreate the current database.
Local M0/tooling acceptance is distinct from remote Actions and launch approval.
Evidence: [scaffold verification](scaffold-verification.md).

## Phase 1 — Study and source boundaries

- [x] Read the overview, frontend, backend, integration, security, admin,
      decisions, build order, catalog, asset guidance and approved prototypes.
- [x] Inventory: 7 collections, 38 trips, 4 draft packages, 29 graded stock
      images, 19 cut videos. All catalog media paths exist.
- [x] Preserve `reference/mockup/` as layout/interaction reference only;
      rebuild in React, never ship its canvas runtime or `/_blob/` URLs.
- [x] Preserve `reference/flyers/` as data provenance only, never public assets.
- [x] Keep graded media in `assets/`; do not grade those files a second time.
      Original stock photos stay in `assets/images/stock-original/`.
- [x] Record inconsistencies and environment prerequisites in `QUESTIONS.md`.

## Phase 2 — Workspace and development tooling

- [x] Six original workspace packages plus the dedicated worker wrapper (seven
      packages total); strict TypeScript, Turbo, ESLint and Prettier.
- [x] Node 22/pnpm 10.34.9 constraints, frozen dependency lock and checked-in
      Next maintenance patch; native dependency install scripts stay disabled.
- [x] Editor settings, ignores, Husky and lint-staged; current source formatting
      is checked in CI. Generated Drizzle/OpenAPI snapshots remain generator-owned.

## Phase 3 — Existing applications and configuration

- [x] Actual web :3000/admin :3001 in EN/IT/ES/FR/DE/RU/TR with liveness/readiness;
      optional non-core locales remain provider/operator controlled.
- [x] API :4000: Hono health/readiness, safe errors and code-only JSON logging.
- [x] Per-app examples, separate worker overrides, Zod validation for API/web/
      worker, and the admin's fail-closed production runtime URL/readiness gate.
      Preserve runtime image promotion; do not demand production secrets at build.
- [x] Existing PostgreSQL 16/Mailpit development project; loopback DB/SMTP/inbox
      ports and separate migration/API/worker roles. Do not reseed or replace it.

## Phase 4 — Checks and handoff

- [x] CI artifacts: frozen install, format/typecheck/lint/tests/build, dependency
      audit and separate source/full-history secret scans; checkout credentials
      are not persisted or mounted into the scanner.
- [x] Real synthetic-history checks: clean history passes; deleted fake secret
      under a committed ignored path is detected; empty/shallow history fails.
- [x] Frozen offline install in an isolated seven-workspace snapshot; format,
      typecheck, lint, 105 unit tests and all four app builds pass.
- [x] All three apps run from the verified build/config; six health/readiness
      endpoints return 200. Existing public/admin previews remain available.
- [x] Original PostgreSQL is healthy; Mailpit HTTP/SMTP probes pass without
      sending messages. No database/config/volume was replaced or reseeded.
- [x] Source scan: 359 text files, no leaks detected; evidence, CHANGELOG and
      matching M0 tracker updated. Four history regressions and workflow lint pass.

## Completion boundary and external gates

- [ ] Actual remote Actions/PR/branch protection and production acceptance:
      no remote or root commit history exists in this checkout. Synthetic Git
      tests are not a scan of real project history, and an empty history never
      becomes a silent scanner pass.

UI/responsive/keyboard/seven-language evidence remains in the file-06 handoff;
file 07 changes tooling and mechanical formatting only. Its formatter touches
later-plan Markdown without implementing or signing off file 08. Strict mobile
LCP <2.5 s, real staff/device, legal/media and deployment gates remain open.
Complete and report this file's local phases, then wait before file 08.
