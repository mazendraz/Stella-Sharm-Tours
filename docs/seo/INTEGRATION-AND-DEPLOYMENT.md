# Integration with Google Reviews, deployment and rollback

Prepared 2026-11-28. **Nothing has been merged or deployed.** Sections 1–8
were written for `feat/seo-foundation` (PR #19, no migrations). **Section 0
supersedes them for the combined release** (PR #19 + PR #20, which adds
migrations 0017/0018).

## 0. Phase 3 completion update (2026-11-28)

### 0.1 Migration scenarios — reproduced on disposable PostgreSQL 16

Run with the repository's real `migrateDatabase` (including the skip guard)
against a throwaway container (`stella-seo-migcheck`, removed afterwards).
Folders: `main` (0000–0013, 0015), `seo-content` (+0017, 0018), `gr-rebased`
(= Google Reviews rebased on `main`: main's 0015 + GR 0014 and 0016 with their
current numbers and journal times), `combined-naive` (all of them, GR
unchanged), `combined-restamped` (GR re-stamped as 0019/0020 with journal
times after 0018). The Google Reviews files come from a snapshot of the
uncommitted worktree, copied read-only into a separate scratch clone.

| #   | Scenario                                             | Result                                                                                                            |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Fresh database → `main`                              | ok, 15 migrations                                                                                                 |
| 2   | Fresh database → SEO content                         | ok, 17; content tables present                                                                                    |
| 3   | `main` database with data → SEO content              | ok, 15 → 17; existing rows kept                                                                                   |
| 4   | Google Reviews first, then SEO content (naive merge) | ok, 17 → 19; GR columns and content tables present                                                                |
| 5   | SEO content first, then GR with its current numbers  | **guard stops the deploy**: "0014_request_display_currency, 0016_google_reviews would be skipped"                 |
| 5b  | Same as 5 with plain Drizzle (no guard)              | **no error and GR's columns are missing** — the silent skip the guard exists for                                  |
| 6a  | SEO content first, then GR re-stamped (0019/0020)    | ok, 17 → 19, everything present                                                                                   |
| 6b  | Fresh database → re-stamped combined                 | ok, 19                                                                                                            |
| 6c  | `main` database → re-stamped combined                | ok, 15 → 19                                                                                                       |
| 6d  | GR already applied, then the re-stamped files        | **fails** on `ADD COLUMN "currency"` (GR's SQL is not idempotent); whole batch rolled back, 0017/0018 not applied |
| 6e  | Re-stamped combined run twice                        | second run is a no-op                                                                                             |

**Strategy (unchanged in substance, now evidenced):**

- **Preferred:** commit Google Reviews, rebase it on `main`, merge and deploy
  it **before** PR #19/#20 → scenario 4 (no renumbering needed).
- **Only if** SEO content reaches a shared database first **and** Google
  Reviews has never been applied anywhere: re-stamp GR's migrations as
  0019/0020 with journal `when` values after 0018 and regenerate their
  snapshots on top of 0018 → scenarios 6a–6c.
- **Never** re-stamp where GR already ran (6d): its SQL adds columns without
  `IF NOT EXISTS`. Never renumber applied migrations; never edit production
  migration history.
- Keep `main`'s `0015_search_keywords` (GR carries an older copy with a
  different hash and timestamp).
- Isolated successes are not proof of the final release: re-run the
  integration suite and the scenarios on the real combined branch.

### 0.2 Google Reviews conflict matrix (recomputed)

Recomputed with `git merge-tree` in a separate scratch clone (alternates
read-only) after copying the 136 uncommitted Google Reviews changes from the
protected worktree (read-only) into a snapshot commit there. The protected
worktree, its index and refs were not touched.

**30 conflicting files** against the pushed `feat/seo-content` (22 already
conflict with `main`; 8 come from the SEO branches) — identical to the earlier
dry run. This session's additions touch two of those 8 again
(`t/[slug]/page.tsx`: one import + one line; `lib/api.ts` is unchanged) and
append to `apps/web/src/app/globals.css` and the dictionaries.

| Path(s)                                                                                                                                                                 | `main` today                                    | Google Reviews                       | SEO branches                                                                | Intended combined behaviour                                                                                   | Migration dep. | Regression tests                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| `packages/db/drizzle/0015_search_keywords.sql`, `meta/0015_snapshot.json`, `meta/_journal.json`                                                                         | merged trip search (0015, `when` 1795711100000) | older copy of 0015 + 0014 + 0016     | + 0017, 0018                                                                | main's 0015; GR 0014/0016 (or 0019/0020, see 0.1); SEO 0017/0018; one journal                                 | yes            | migration scenarios, `migration-order.test.ts`, integration |
| `apps/web/src/components/search-panel.tsx`, `tests/e2e/search.spec.ts`, `packages/shared/src/search-golden.test.ts`, `docs/superpowers/plans/2026-11-26-trip-search.md` | newer trip search (PR #17)                      | older trip-search copy               | —                                                                           | **keep `main`** (do not overwrite newer search with the older copy)                                           | 0015           | `search.spec.ts`, search golden tests                       |
| `apps/web/messages/*.json` (7), `apps/admin/messages/*.json` (7)                                                                                                        | base keys                                       | review, currency keys                | SEO, guides, `tripGuides`, admin content keys                               | union of keys; admin dictionaries regenerated with `node scripts/admin-messages.mjs`                          | —              | `messages.test.ts` (admin + web), 7-language check          |
| `CHANGELOG.md`                                                                                                                                                          | —                                               | entries                              | entries                                                                     | keep both                                                                                                     | —              | —                                                           |
| `apps/web/src/app/[locale]/layout.tsx`                                                                                                                                  | shell                                           | reviews/"why us" + currency          | metadata, `guides` footer flag                                              | keep GR components **and** SEO metadata/flag                                                                  | —              | `seo.spec.ts`, `frontend.spec.ts`                           |
| `apps/web/src/app/[locale]/t/[slug]/page.tsx`                                                                                                                           | trip page                                       | reviews/currency on trip             | JSON-LD, `<TripGuides>` after `<TripView>`                                  | keep both; **no `Review`/`AggregateRating` markup** for first-party reviews                                   | —              | `seo.spec.ts` (guides back-links, JSON-LD), booking e2e     |
| `apps/web/src/app/[locale]/contact/page.tsx`                                                                                                                            | contact                                         | reviews block                        | metadata/JSON-LD                                                            | keep both                                                                                                     | —              | `seo.spec.ts`                                               |
| `apps/web/src/components/collection-view.tsx`                                                                                                                           | collection                                      | currency display                     | hidden `h2` heading-order fix                                               | keep both                                                                                                     | —              | `frontend.spec.ts`, axe                                     |
| `apps/web/src/lib/api.ts`                                                                                                                                               | public API client                               | reviews fetchers                     | content list/page fetchers                                                  | keep both                                                                                                     | —              | typecheck, e2e                                              |
| `packages/db/src/runtime-privileges.ts`                                                                                                                                 | grants                                          | grants for reviews columns/functions | grants for `content_pages`, `verification_facts`, `visibility_measurements` | union; re-run `applyRuntimePrivileges`                                                                        | yes            | integration (restricted API role)                           |
| `tests/contracts/openapi.json`                                                                                                                                          | snapshot                                        | review routes                        | content/verification/visibility routes, `related_trips` in content list     | regenerate: `vitest run --config vitest.integration.config.ts -t "OpenAPI contract" -u`, then review the diff | —              | OpenAPI contract test                                       |
| `tests/fixtures/server.mjs`                                                                                                                                             | fixture API                                     | reviews fixture                      | content fixture (`related_trips`)                                           | keep both                                                                                                     | —              | `pnpm test:e2e`                                             |

Booking functionality: neither side changes the request flow except GR's
display currency (`booking_requests.currency`, migration 0014). Run the
booking e2e and integration request tests on the combined branch.

**Blocked:** a real integration needs an authorised, committed Google Reviews
version. Nothing was merged.

## 1. Branch situation

|            | `feat/seo-foundation` (this work) | `feat/google-reviews`                                                                                                                     |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Where      | worktree `F:\stella-seo`          | `F:\stella-project-kit`                                                                                                                   |
| Base       | `origin/main` @ `a3d6fdb`         | `6f59b11` (older; `main` has 96 changed files since)                                                                                      |
| State      | 14 commits, clean tree            | **136 uncommitted files** (untouched by this work; checked before and after)                                                              |
| Migrations | none                              | adds `0014_request_display_currency`, `0016_google_reviews` (and an uncommitted copy of `0015_search_keywords`, which `main` already has) |

Large parts of the uncommitted Google Reviews tree (site search, keyword
migration 0015, search tests) already landed on `main` through PR #17. Those
files will conflict with `main` regardless of this branch.

## 2. Files touched by both

26 files changed on this branch are also modified in the Google Reviews
working tree:

| Group                  | Files                                                                                                | Expected conflict                                                                                                    | Resolution                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated dictionaries | `apps/admin/messages/*.json` (7), `apps/web/messages/*.json` (7)                                     | additive keys at the end                                                                                             | Keep both sides' keys. For admin, regenerate with `node scripts/admin-messages.mjs` after merging `data/i18n/*.json`; the admin test checks every key against the sources.                                                                                                      |
| Contracts              | `apps/api/src/admin-contracts.ts`, `tests/contracts/openapi.json`                                    | both add routes                                                                                                      | Keep both contract entries, then regenerate the snapshot: `vitest run --config vitest.integration.config.ts -t "OpenAPI contract" -u`.                                                                                                                                          |
| Wiring                 | `apps/api/src/app.ts`, `apps/admin/src/components/admin-app.tsx`                                     | one-line imports/registrations                                                                                       | Keep both.                                                                                                                                                                                                                                                                      |
| Tests                  | `apps/api/src/backend.integration.test.ts`                                                           | separate `it(...)` blocks                                                                                            | Keep both.                                                                                                                                                                                                                                                                      |
| Web pages              | `[locale]/layout.tsx`, `[locale]/page.tsx`, `contact/page.tsx`, `t/[slug]/page.tsx`, `middleware.ts` | Google Reviews adds the "why us"/reviews and currency components; this branch changes `generateMetadata` and JSON-LD | Keep Google Reviews' rendered components **and** this branch's metadata/JSON-LD. Rule: no `Review`/`AggregateRating` markup for Google reviews (the SEO crawl and e2e test fail on it). In `middleware.ts`, keep both matcher exclusions (`llms\.txt`, any search-index route). |
| Docs                   | `CHANGELOG.md`, `docs/01-frontend-plan.md`                                                           | both add entries                                                                                                     | Keep both.                                                                                                                                                                                                                                                                      |

No migration numbers collide: this branch adds no migration.

## 3. Safe order (recommended)

1. **Google Reviews first**: commit its working tree on its own branch
   (owner/author of that work), rebase it on current `main`, resolve against
   PR #17 (search), open its PR, merge.
2. **Then this branch**: `git rebase origin/main` in `F:\stella-seo`, resolve
   the 26 files with the table above, regenerate dictionaries and the
   OpenAPI snapshot, run section 5, open the PR.

The other order also works (this branch is smaller and already on `main`'s
base), but then the Google Reviews author resolves the same 26 files.
Never stash, reset or check out over the Google Reviews working tree to do
either step.

## 4. Deployment

**Database:** no migration on this branch. **New env vars (all optional, web
container):** `AI_SEARCH_CRAWLERS`, `AI_TRAINING_CRAWLERS`, `GOOGLE_EXTENDED`
(default `allow`). **Infra:** `infra/Caddyfile` gains the `www` site — Caddy
requests a certificate for `www.stellasharmtours.com` on reload (DNS already
points there).

Steps (existing runbook, `infra/deploy-release.sh`):

1. Backup: the standard pre-deploy Postgres dump and restic snapshot
   (`infra/backup`, `docs/RUNBOOK.md`) — no schema change, but take it anyway.
2. Deploy to **staging** first; run the gate (`scripts/verify-staging-gate.mjs`)
   and `pnpm seo:check --base <staging origin> --origin https://stellasharmtours.com`.
3. Production deploy (web, api, admin, caddy reload).
4. Production verification (section 6).

## 5. Pre-merge checks (all run on this branch, see `SEO-QA-REPORT.md`)

`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`, the
integration suite (`pnpm test:integration`), the mobile e2e suites including
`tests/e2e/seo.spec.ts`, and the SEO crawl of a production build.

## 6. Production verification checklist (after deploy)

- [ ] `pnpm seo:check --base https://stellasharmtours.com` → 0 errors.
- [ ] `curl -A "OAI-SearchBot/1.0" https://stellasharmtours.com/it | head -c 5000` contains `<title>` and `rel="canonical"` (inside `<head>`).
- [ ] `curl -I https://www.stellasharmtours.com/it/` → `308`, `location: https://stellasharmtours.com/it/`.
- [ ] `https://stellasharmtours.com/robots.txt` shows the named AI groups with the private paths disallowed.
- [ ] One trip page in EN and IT: title and description are the new localized ones.
- [ ] Admin → Search (SEO): overview loads; **Run check** reports 0 broken links, 0 unpublished trips listed, metadata in head.
- [ ] Booking regression: submit one request on staging (never on production with a fake customer); WhatsApp prefill opens.
- [ ] Rich Results Test on one trip page; Search Console → sitemap resubmitted.

## 7. Rollback

All changes are code and config: redeploy the previous release
(`infra/deploy-release.sh` with the previous image tag) and restore the
previous `infra/Caddyfile` (the `www` block is self-contained; removing it
returns `www` to the current failing state). No data to roll back. If only the
robots switches cause concern, set the env vars back to `allow` (or unset) and
restart the web container.

## 8. Remaining approvals before content work is published

See `EXTERNAL-ACTIONS-REQUIRED.md` (decisions D1–D6, business facts),
`TOUR-VERIFICATION-CHECKLIST.md` (343 items) and `FAQ-CANDIDATES.md`
(42 answers needing owner/legal input).
