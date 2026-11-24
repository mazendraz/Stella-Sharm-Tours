# Remediation log — audit 2026-11-24

All fixes were merged into `main` as PRs #3–#13 (final `main` commit `d4e3996`, CI green); see "Final state" below. Work was prepared on `origin/main` @ `facd9c8`, which includes PR #2. SEC-01 was fixed by another session in PR #2 (merged); re-verified here: `pnpm audit` clean incl. dev, unit 154/154 on vitest 4.1.12, drift check passes under esbuild 0.25.12. Admin dashboard E2E (2/2) and the seeded suite leave no tracked or untracked changes.

| Phase | Item                                                | Outcome                                  | Change                                                                                                               | Verification                                                                                                                                                                                                     |
| ----- | --------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A    | BUG-05 withdrawn content after restart              | **Fixed**                                | `docker-compose.prod.yml`: web `.next/cache` on `tmpfs` (64 MB, uid 1000), `webcache` volume removed                 | Repro script: 404 after restart and +65 s (was 200). New CI regression `infra/tests/withdrawn-content-restart.sh` 6/6. `runtime.spec.ts:46` (legal sitemap) passes.                                              |
| 1B    | BUG-06 invalidation stopped in long-running process | **Mitigated** (root cause still unknown) | `infra/monitoring/cache-consistency.mjs` wired into `check.sh` (monitor + deploy gate); web logs `cache_revalidated` | Monitor exit 0 on consistent stack, exit 1 on injected stale price, 0 after restore (38 trips). Operations suite scenario "stale website → rollback". `admin.spec.ts` price/hero cache test passes on fix image. |
| 2A    | BUG-01 Drizzle snapshot drift                       | **Fixed**                                | `packages/db/drizzle/meta/0012_snapshot.json`; CI `scripts/check-schema-drift.sh`                                    | Probe: "No schema changes". `drizzle-kit check` OK. Check fails (exit 1) without the snapshot. No runtime migration.                                                                                             |
| 2B    | SEC-02 staging acceptance not enforced              | **Fixed (code)**                         | `infra/accept-staging.sh`; `deploy.sh` refuses unaccepted production SHAs (rollback exempt)                          | Operations suite: refused without acceptance, acceptance refused for a SHA staging isn't running, accepted SHA proceeds. GitHub environment reviewers remain a settings task.                                    |
| 3A    | BUG-03 English-only owner e-mails                   | **Fixed**                                | `packages/shared/src/i18n/price-report.ts` (7 languages + readable formatter); `jobs.ts` uses it                     | 4 new unit tests; integration "reports actual price changes" passes with readable-body assertions.                                                                                                               |
| 3B    | BUG-02 tests overwrite `docs/screens`               | **Fixed**                                | `tests/screens.ts`; 5 specs use it; CI `git diff --exit-code`                                                        | Seeded E2E run: 0 tracked files changed, 77 screenshots in `test-results/screens/`.                                                                                                                              |
| 3C    | BUG-07 sub-pixel touch-target flake                 | **Fixed (test)**                         | `minTarget = 43.99` in two specs                                                                                     | 7/7 language tests pass. Residual: cells < 44 px wide below 390 px viewport (recorded in security plan §11).                                                                                                     |
| 3D    | BUG-04 repository/build weight                      | **Partly fixed**                         | `.dockerignore`: excludes media/reports/research/audit; re-includes only 3 stock files                               | Build context 1.35 GB → 104 MB; api and web images build. Untracking/history rewrite left to owner (would delete media from other checkouts on pull).                                                            |
| 4     | SEC-05 persisted checkout token                     | **Fixed**                                | `persist-credentials: false` in both release jobs                                                                    | actionlint clean                                                                                                                                                                                                 |
| 4     | SEC-03, SEC-04, SEC-06                              | **Recorded decisions**                   | `docs/04-security-plan.md` §11                                                                                       | —                                                                                                                                                                                                                |
| 4     | Toolchain docs                                      | **Fixed**                                | README prerequisites (Node 22 from `.tools`, pnpm on PATH, Playwright browser, `UPDATE_SCREENS`)                     | —                                                                                                                                                                                                                |

## Full verification on the branch

| Check                                              | Result                                                         |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Prettier, ESLint, typecheck (6 tasks, uncached)    | pass                                                           |
| Unit tests                                         | 154 / 154 (150 + 4 new)                                        |
| PostgreSQL integration (Testcontainers)            | 70 / 70                                                        |
| Seeded browser suite, mobile, fix-branch web image | 15 passed, 1 environment-blocked (needs second stack on :4990) |
| Operations suite (Linux container)                 | 12 / 12 scenarios (2 new)                                      |
| shellcheck (CI file set + new scripts), actionlint | clean                                                          |
| Schema drift check                                 | clean                                                          |
| Docker images (api, web) with new `.dockerignore`  | build                                                          |

## Owner actions still open

1. Add required reviewers to the `production` GitHub environment.
2. After the first deploy with the new compose file: `docker volume rm stella-production_webcache stella-staging_webcache`.
3. Decide on removing the ~585 MB media from Git history (rewrite) and on the staff-lockout policy (SEC-03).
4. Design decision for 44 px calendar cells on phones narrower than 390 px.
5. BUG-06 root cause: staging soak with `NEXT_PRIVATE_DEBUG_CACHE=1`; the new monitor will alert if it recurs.

## Pull requests (one per fix, each from `main` @ `facd9c8`)

| PR  | Fix                                       | Branch                               |
| --- | ----------------------------------------- | ------------------------------------ |
| #3  | BUG-05 web cache in memory                | `fix/web-cache-tmpfs`                |
| #4  | BUG-06 website/API consistency monitor    | `fix/cache-consistency-monitor`      |
| #5  | BUG-01 Drizzle snapshot + drift check     | `fix/drizzle-schema-snapshot`        |
| #6  | SEC-02 staging acceptance gate            | `feat/staging-acceptance-gate`       |
| #7  | BUG-03 owner e-mails in seven languages   | `fix/owner-emails-seven-languages`   |
| #8  | BUG-02 screenshots out of `docs/screens`  | `fix/test-screenshots-out-of-docs`   |
| #9  | BUG-07 touch-target rounding              | `fix/touch-target-rounding`          |
| #10 | BUG-04 Docker build context               | `build/slim-docker-context`          |
| #11 | SEC-05 release checkout token             | `ci/release-no-persisted-token`      |
| #12 | Docs: toolchain + recorded risk decisions | `docs/toolchain-and-audit-decisions` |

Each branch was verified on its own before pushing. All ten add a CHANGELOG line at the same place; #4 and #6 also both bump the operations-suite count; #3, #5 and #8 touch `ci.yml` in different places. Later PRs need a rebase as earlier ones merge.

## Merge status

- **#3 merged** (`ccb1896`) after CI passed.
- PRs #4–#12 were stacked: each branch merges the previous one, with conflicts resolved to the verified cumulative tree, so they merge in order without rebases. Force-push was not used.
- CI on #5 and #9 exposed a pre-existing flake: "responsive screen inventory" ran 24 s of its 30 s budget on idle runners and 30.8–31.4 s under load. **#13** gives it 60 s, is merged into the chain, and merges first.
- The `production` GitHub environment already had required reviewers, so the SEC-02 settings item needs no change.

## Final state

All eleven PRs are merged into `main` (#3 `ccb1896`, #13 `7ec3198`, #4–#12 ending at `d4e3996`). The tree on `main` is identical to the CI-verified head of #12.

Issues found and fixed while merging:

- **#13** — pre-existing flaky "responsive screen inventory" test (24 s of a 30 s budget) given 60 s.
- **#8** — the new tree-clean guard caught CI's own `chmod +x infra/ci-*.sh`; the scripts are now stored as executable (100755).
- **#4** — failed once on the BUG-07 sub-pixel flake (fixed by #9, later in the chain); passed on re-run.

Owner decisions still open: Git-history media rewrite, SEC-03 lockout policy, calendar cells below 390 px, BUG-06 root-cause soak in staging, and removing the old `webcache` volume after the first deploy.
