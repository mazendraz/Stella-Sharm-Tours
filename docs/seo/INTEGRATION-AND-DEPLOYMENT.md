# Integration with Google Reviews, deployment and rollback

Prepared 2026-11-28. **Nothing has been pushed, merged or deployed.**

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
