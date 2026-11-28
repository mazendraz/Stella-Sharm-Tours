# Phase 4 checkpoint (integration and release readiness)

Living recovery file — update after every milestone. No secrets.
Final report: [PHASE-4-RELEASE-READINESS.md](PHASE-4-RELEASE-READINESS.md).

## Where things are

| Item                    | Value                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration worktree    | `F:\stella-integration`, branch `integration/phase4-candidate` (**local only, not pushed**)                                                                                                           |
| Built from              | `origin/main` `a3d6fdb` + `feat/seo-content` `1e47a1a` (incl. PR #19) + `origin/fix/admin-publish-blocker` `74c64da` (PR #18) + Google Reviews/WhatsApp snapshot                                      |
| Google Reviews snapshot | local branch `candidate/google-reviews-whatsapp-snapshot` (`ad77014`, parent `6f59b11`), copy of `F:\stella-project-kit` at 18:05 incl. untracked files; contains `feat/why-stella` (`77e736a`) files |
| Recovery snapshot       | `F:\stella-seo\.local\recovery\gr-20261128-180550\` (staged/unstaged patches, untracked + worktree tars, SHA256SUMS). Local only.                                                                     |
| Original GR worktree    | untouched (read with `git --no-optional-locks` only). Last edit seen 17:42.                                                                                                                           |
| SEO worktree            | `F:\stella-seo`, `feat/seo-content` = PR #20 head `1e47a1a`                                                                                                                                           |

## Decisions taken in the candidate

- Trip search: `main` wins (Google Reviews carried an older copy); currency hook added to the search panel.
- Google Reviews migrations re-stamped `0014`→`0019`, `0016`→`0020` (never applied to staging/production; SQL verbatim; snapshots regenerated; `drizzle-kit check` OK; no drift). `docs/RUNBOOK.md` updated.
- Trip JSON-LD keeps EUR offers (stored currency), not the per-visitor display currency.

## Status

| Step                                  | State                         |
| ------------------------------------- | ----------------------------- |
| CI PR #19 / PR #20                    | success / in progress         |
| Recovery snapshot                     | done                          |
| Conflict resolution (31 files)        | done, committed `dd48bd3`     |
| Unit / lint / typecheck / format      | 523 passed / ok / 6 of 6 / ok |
| Premium loading experience            | next                          |
| Migrations on disposable DBs          | to do                         |
| Integration, admin, public e2e, crawl | to do                         |
| Linux build (Docker), performance     | to do                         |
| Release readiness report              | to do                         |

## Authorizations still required (do not do without them)

Publishing the Google Reviews/WhatsApp code (push), merging PRs, staging and
production deploys, production migrations. See the readiness report §17.

## Next exact action

Implement the loading experience in `F:\stella-integration`, then run the
combined QA list in the readiness report.
