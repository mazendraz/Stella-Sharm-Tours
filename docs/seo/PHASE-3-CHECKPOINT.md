# Phase 3 checkpoint (SEO content, verification, AI visibility)

Living recovery file. Update after every milestone. No secrets, no customer data.
Full details: [PHASE-3-REPORT.md](PHASE-3-REPORT.md) and
[PHASE-3-FINAL-READINESS.md](PHASE-3-FINAL-READINESS.md).

## Where things are (2026-11-28, completion session)

- Worktree `F:\stella-seo`, branch `feat/seo-content` (PR #20, base
  `feat/seo-foundation` = PR #19, base `main`). Nothing merged or deployed.
- Protected worktree `F:\stella-project-kit` (`feat/google-reviews`, HEAD
  `6f59b11`, 136 uncommitted status lines). Read-only; fingerprint recorded in
  the readiness report. Its running `stella-integration-verify` containers
  (ports 4983–4991) belong to it — do not stop or reuse them. Read its status
  only with `git --no-optional-locks`.
- Recovery ref of the earlier interrupted state:
  `refs/recovery/phase3-wip-2026-11-28` (`29d51a4`), local only.

## Toolchain

`.npmrc` has `engine-strict=true` (Node 22). Use the other worktree's
toolchain read-only: `PATH=F:\stella-project-kit\.tools\node_modules\node-win-x64\bin;...`.
Shell `cd` does not persist between tool calls: use absolute paths.

## Isolated QA stack used in this session (ignored files only)

| Piece      | Where                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| PostgreSQL | compose project `stella-seo-qa` (`infra/docker-compose.dev.yml`), `127.0.0.1:55471`        |
| Mailpit    | same project, SMTP `11071`, UI `18071`                                                     |
| API        | `apps/api`: `tsx src/server.ts` on `:4000`; worker `src/worker-main.ts` (translate = fake) |
| Admin      | `next start` on `:3001` (production build)                                                 |
| Web        | `next start --port 3070` (production build)                                                |
| Config     | `scripts/setup-local.ts` output with ports rewritten (55471, 11071, 3070)                  |

Admin suite against it:

```bash
STELLA_DEV_POSTGRES_PORT=55471 STELLA_DEV_SMTP_PORT=11071 \
STELLA_WEB_URL=http://localhost:3070 STELLA_API_URL=http://localhost:4000 \
node node_modules/@playwright/test/cli.js test --config playwright.admin.config.ts seo-content.spec.ts
```

Tear down: `docker compose -p stella-seo-qa -f infra/docker-compose.dev.yml down -v`,
stop the node processes, delete `.env`, `apps/api/.env*`, `apps/web/.env.local`,
`apps/admin/.env.local`.

## Status

| Area                                                           | State                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Admin browser tests (guides, verification, AI visibility, SEO) | **Done**: 9 passed, 6 skipped by design, 0 failed (390/768/1440 px, axe)                                           |
| Defects found and fixed                                        | phone zoom-out on AI visibility; 3 scroll areas not keyboard-reachable; unaudited create; broken `db:seed-content` |
| Trip → guide links, two-way page links                         | **Done** (+ e2e and integration assertions)                                                                        |
| Destination / activity pages                                   | Verified: same CMS and route, kind-specific rules and JSON-LD; drafts only                                         |
| FAQ re-verification (18)                                       | **Done**: 17 answers in 7 languages as drafts; #1 already live                                                     |
| Competitor research                                            | **Done**: 51 queries, 45 competitors                                                                               |
| Migrations                                                     | **Done**: 11 scenarios on disposable PostgreSQL                                                                    |
| Google Reviews conflict matrix                                 | **Done**: 30 files (unchanged)                                                                                     |
| External integrations                                          | Classified: all placeholders; blocked by accounts                                                                  |
| Unit tests                                                     | 503 passed                                                                                                         |
| Integration, performance, Linux build, final QA                | see the readiness report                                                                                           |

## Next exact action

Follow "Remaining" in `PHASE-3-FINAL-READINESS.md`. Do not merge Google
Reviews without the migration order in `INTEGRATION-AND-DEPLOYMENT.md` §0.
