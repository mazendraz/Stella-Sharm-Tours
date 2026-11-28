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

| Step                                | State                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| CI PR #19 / #18                     | success / success                                                             |
| CI PR #20                           | re-running on `2d35f4c` (earlier failures were admin-spec test timing; fixed) |
| Recovery snapshot                   | done                                                                          |
| Conflict resolution (31 files)      | done (`dd48bd3`)                                                              |
| Migration re-stamp 0019/0020        | done; drizzle-kit check OK; no drift; 7 combined scenarios OK                 |
| Loading experience                  | done (`f27c84c`), tests in `loading.spec.ts`                                  |
| Unit / lint / typecheck / format    | 523 / ok / 6 of 6 / ok                                                        |
| Integration                         | 77/77                                                                         |
| Admin browser (3 widths)            | 15 passed, 6 skipped, 0 failed                                                |
| Public e2e (3 widths)               | 108 passed, 12 skipped, 0 failed                                              |
| SEO crawl                           | 350 URLs, 0 errors, 1 warning                                                 |
| Linux Docker images (api/web/admin) | built, inspected (local only)                                                 |
| Performance                         | measured; small regression documented; 2.5 s target not met                   |
| Release readiness report            | done                                                                          |

## Known gaps

- The source worktree changed again at 18:17 (AGENTS.md, DECISIONS.md,
  backend-verification.md: Private hero slide second). Not in the candidate;
  re-snapshot the final committed work before publishing.

- Google Reviews plan tasks 2–6 (import, API, admin moderation, reviews
  section) were never implemented in the source worktree.
- Staging unreachable; `develop` branch missing; no SSH/DB access here.

## Authorizations still required (do not do without them)

Publishing the Google Reviews/WhatsApp code (push), merging PRs, staging and
production deploys, production migrations. See the readiness report §17.

## Next exact action

Wait for the owner's single approval (readiness report §17). Then: commit
the Google Reviews/WhatsApp work as reviewed, open its PR, merge in the
order of §13, create `develop`, deploy to staging, accept, tag for
production. Until then, keep `F:\stella-integration` as is (local).
