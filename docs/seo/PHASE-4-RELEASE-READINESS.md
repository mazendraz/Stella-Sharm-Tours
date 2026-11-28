# Phase 4 — integration and release readiness

Date: 2026-11-28 · Written for the owner (release approval) and whoever runs
the release. **Nothing has been merged, published from the Google Reviews
work, deployed, or migrated on staging/production.**

## 1. CI status

| PR / branch                        | Head      | CI (`Checks / verify`)                                                                                                                                                                                                                                      |
| ---------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #19 `feat/seo-foundation` → `main` | `b318f0f` | **success**                                                                                                                                                                                                                                                 |
| #20 `feat/seo-content` → #19       | `2d35f4c` | see PR (re-running). Two earlier runs failed only in my new admin spec in the container stack (toast audited mid-animation; live check unreachable from inside the API container) — test defects, fixed in `584d656` and `2d35f4c`; no product code changed |
| #18 `fix/admin-publish-blocker`    | `74c64da` | **success**                                                                                                                                                                                                                                                 |
| `integration/phase4-candidate`     | local     | not on GitHub (contains unpublished Google Reviews/WhatsApp work); tested locally, §9                                                                                                                                                                       |

## 2. Branches and commits

- Candidate: `F:\stella-integration`, branch `integration/phase4-candidate`
  (local only), on top of `origin/main` `a3d6fdb`:
  `4dd26c9` merge PR #19+#20 · `91dc5af` merge PR #18 · `dd48bd3` merge
  Google Reviews + WhatsApp snapshot · `f27c84c` loading experience ·
  `cc95ed1`/`df48cbe` PR #20 test fixes · `690bbdc` OpenAPI snapshot ·
  `0ddfd40` WhatsApp/loading/home tests (+ this report).
- Google Reviews snapshot: local branch `candidate/google-reviews-whatsapp-snapshot`
  (`ad77014`, parent `6f59b11`) = the uncommitted worktree at 18:05 incl.
  untracked files. It contains `feat/why-stella` (`77e736a`, local-only).
- Recovery snapshot of the original worktree (local, not uploaded):
  `F:\stella-seo\.local\recovery\gr-20261128-180550\` with SHA256SUMS.
- The original `F:\stella-project-kit` worktree was not modified.
- **The original worktree kept changing after the snapshot.** At 18:17
  another session (or the owner) edited `AGENTS.md`, `docs/DECISIONS.md` and
  `docs/backend-verification.md` there (owner decision of 2026-11-28: the
  Private hero slide becomes the second slide, after "All of Egypt"); status
  is now 141 entries. These edits are **not** in the candidate. Because the
  tree is still being worked on, the publish step (§17, item 1) must take a
  fresh snapshot of the final, committed Google Reviews/WhatsApp work and
  re-run the conflict check (`git merge-tree`) and the test list in §9 before
  anything is merged.

## 3. Conflict analysis (recomputed with current data)

Against `main` + SEO + PR #18 the Google Reviews/WhatsApp snapshot produced
**31 conflicting files** (the previous 30 + `data/i18n/admin-rebuild.json`
from PR #18). The WhatsApp edits (`shell.tsx`, `tab-bar.tsx`, `store.ts`,
`trip-view.tsx`, `collection-view.tsx`, `globals.css`) merged without
conflicts except `collection-view.tsx`.

| File(s)                                                     | `main`                       | Google Reviews / WhatsApp                      | SEO                              | Resolution (combined behaviour)                                                                         | Tests                                    |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `search-panel.tsx`                                          | newer search (history entry) | older copy + display currency                  | —                                | main + `useCurrency` added                                                                              | `search.spec.ts` (all widths) ✓          |
| `search.spec.ts`, `search-golden.test.ts`, trip-search plan | newer                        | older copies (fewer lines)                     | —                                | main                                                                                                    | unit + e2e ✓                             |
| `0015_search_keywords.sql` + snapshot, `_journal.json`      | `IF NOT EXISTS` version      | older copy, own 0014/0016 chain                | 0017/0018                        | main's 0015; GR re-stamped as 0019/0020 (§7)                                                            | drizzle-kit check, drift, 11 scenarios ✓ |
| web dictionaries (7), `data/i18n/admin-rebuild.json`        | base                         | review, currency, WhatsApp keys                | SEO/guide/loading keys           | key-level 3-way merge, 0 value conflicts; admin dictionaries regenerated                                | messages tests ✓                         |
| admin dictionaries (7)                                      | generated                    | generated                                      | generated                        | regenerated from `data/i18n` (1 594 keys; GR's deliberate removal of `featuredMax4` kept, unused)       | admin messages test ✓                    |
| `CHANGELOG.md`                                              | entries                      | entries (older trip-search duplicate)          | entries                          | union, duplicate older entry dropped                                                                    | —                                        |
| `[locale]/layout.tsx`                                       | shell                        | `CurrencyProvider`                             | guides flag, site JSON-LD        | both                                                                                                    | e2e, SEO crawl ✓                         |
| `t/[slug]/page.tsx`                                         | page                         | JSON-LD offers in **visitor display currency** | connected graph, EUR, TripGuides | SEO graph with EUR offers kept (the stored price is EUR; markup must not vary per visitor) + TripGuides | `seo.spec.ts` ✓                          |
| `contact/page.tsx`                                          | page                         | WhatsApp line by language                      | metadata/JSON-LD                 | both                                                                                                    | e2e ✓                                    |
| `collection-view.tsx`                                       | grid                         | grouped "All of Egypt" sections                | hidden h2                        | GR sections + hidden h2 in the plain grid                                                               | frontend e2e ✓                           |
| `lib/api.ts`, `fixtures/server.mjs`                         | —                            | (no change in those hunks)                     | content API / fixture guide      | SEO                                                                                                     | ✓                                        |
| `runtime-privileges.ts`                                     | grants                       | `SELECT, UPDATE ON reviews`                    | content/visibility grants        | union                                                                                                   | grants verified on a fresh DB ✓          |
| `apps/api/src/app.ts` (PR #18)                              | —                            | —                                              | route imports                    | both (+ `ApiFailure`)                                                                                   | typecheck ✓                              |
| `tests/contracts/openapi.json`                              | snapshot                     | `currency` on requests                         | content routes                   | regenerated; diff = `currency` only                                                                     | contract test ✓                          |

## 4. Google Reviews — what exists and what does not

- **Exists and verified:** the home "Why Stella" section (in all languages)
  quotes three real 5-star Google reviews verbatim from the dated capture
  `data/google-reviews.json` (public listing, 2026-11-26: rating 5, 499
  reviews, 496 captured), with the rating/count and a link to the Google
  listing; quotes are checked byte for byte by `why-us-quotes.test.ts`.
  Server-rendered; **no `Review` / `AggregateRating` markup** (self-serving
  reviews are not eligible; checked on the live candidate HTML and by
  `seo.spec.ts`). Migration `0020` adds the reviews columns.
- **Not implemented** (the Google Reviews plan's tasks 2–6): the shared reviews
  contract, the `reviews:import` command, the public/admin reviews API, the
  admin **Reviews** moderation screen and the home/trip reviews section with
  moderation. Nothing writes to or reads the new columns yet. There is no live
  Google API connection (no retrieval, caching, rate-limit or API-failure path
  exists to test). **Classification: remaining technical implementation** —
  a feature, not an integration fix; it was not started in Phase 4 because
  the brief prioritises integration over new features.
- The rating/count are a dated snapshot ("as of 2026-11-26"); they will drift
  from the live listing until the import exists. Owner decision whether to
  keep the count visible until then.

## 5. Floating WhatsApp — verified

Numbers come only from the settings (`whatsapp_primary` / `whatsapp_secondary`;
the button hides if none is set); Italian, Russian and Turkish use the second
line. Messages are localized per page (general, trip with its link,
collection, My trip, request, FAQ). `whatsapp.spec.ts` (390/768/1440):
correct `wa.me` number per language and message per page, 56 px target, no
overlap with the tab bar or the booking bar, no horizontal scroll, layout
shift < 0.1, keyboard focusable, axe clean — **9/9 passed**.

## 6. Combined implementation status

All of: SEO foundation and content (metadata in head, 7 languages,
canonicals/hreflang, JSON-LD, sitemaps, crawler switches, llms.txt, Travel
guides CMS, destination/activity pages, Verification, AI visibility, CSV,
internal links, FAQ drafts, publication rules, audit), trip search (main),
PR #18 admin publish feedback, Why Stella, display currency, floating
WhatsApp, and the **loading experience**:

- slow-navigation bar (only after 150 ms; slow-connection notice + Try again
  after 8 s; gives up at 30 s; static under reduced motion; no percentages),
- one skeleton system (shared shimmer, final sizes, aria-hidden, one status
  label) for My trip and the story viewer,
- story viewer: branded loading state, error with **Try again** that
  refetches without closing the dialog (verified on the stack: skeleton →
  failure → retry → story; axe clean),
- broken images fall back to the brand placeholder with their alt text,
- existing: booking sheet "Sending…", disabled while sending, error + retry
  with server-side request receipts (no duplicate requests); search panel
  skeleton; error boundary with Try again.

**Deliberately not done:** route `loading.tsx` on public pages. A Suspense
fallback streams the page body behind a script swap; without JavaScript (and
for non-rendering crawlers) the body would sit in a hidden block. The
navigation bar gives feedback without touching server HTML. Verified: with
JavaScript disabled every tested page is complete and shows no loading state
(`loading.spec.ts`).

## 7. Database migration strategy

**Final sequence:** `0000–0013`, `0015_search_keywords` (main), `0017`,
`0018` (SEO), **`0019_request_display_currency`, `0020_google_reviews`**
(Google Reviews, re-stamped). Why re-stamped: GR's `0014` and `main`'s `0015`
share a parent snapshot — `drizzle-kit check` (run in CI) rejects that — and
GR's numbers sat before SEO's. GR's migrations were never applied to staging
or production (the work was never committed). SQL is verbatim; snapshots
regenerated by drizzle-kit on top of `0018`; `drizzle-kit check` OK;
`drizzle-kit generate` reports **no schema drift**. The skip guard is kept.

Rehearsed on disposable PostgreSQL 16 with the candidate's own migrate code
and runtime privileges:

| Scenario                                            | Result                                                                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh → combined                                    | 19 migrations; all tables/columns; worker function returns `currency`                                                                                                                                      |
| **Production-like `0013` (+data) → combined**       | ok; data kept                                                                                                                                                                                              |
| `main` (`0015`, +data) → combined                   | ok; data kept                                                                                                                                                                                              |
| PR #20 deployed first, then combined                | ok (0019/0020 are newer)                                                                                                                                                                                   |
| Combined twice                                      | no-op                                                                                                                                                                                                      |
| Local dev DB that ran GR's old 0014/0016 → combined | **fails safely** (columns exist; batch rolled back) — dev DBs only; procedure in `docs/RUNBOOK.md`                                                                                                         |
| Runtime grants after migrate (queues + privileges)  | API: `reviews` SELECT/UPDATE, `content_pages` SELECT/INSERT/UPDATE, `verification_facts` SELECT/INSERT/UPDATE, `visibility_measurements` SELECT/INSERT/DELETE; worker EXECUTE on the notification function |

Earlier (Phase 3) scenarios also showed plain Drizzle silently skipping
out-of-order files and the guard stopping it.

**Production/staging migration state:** could not be read — no database or
SSH access from this machine. Evidence: production serves no trip search, no
SEO metadata and no WhatsApp/Why Stella, consistent with `docs/RUNBOOK.md`
("environments at `0013` (production)"). The rehearsal covers both `0013`
and `0015`. **Confirm before deploying:** `select hash, created_at from
drizzle.__drizzle_migrations order by created_at;` on staging and production.

## 8. Production build

- **Linux (Docker, repository Dockerfile, standalone output unchanged):**
  `docker build -f infra/Dockerfile --target api|web|admin` of the candidate: **all three succeeded** (`stella-int-candidate/stella-api`, `-web`, `-admin`, local only, not pushed). Inspected: web and admin images contain the standalone `server.js` and `.next` build; the API image ships migrations `0015`–`0020`; Node 22.23.5. The build context excludes `.env*`, `.local` and `.git`.
- Windows: `next build` compiles all routes; only the standalone copy step
  fails (`EPERM symlink`, OS permission) — not used for releases.
- PR #19/#20 CI on Linux built the web/admin images from `.next/standalone`.

## 9. Combined test results (candidate, isolated stack)

Isolated stack: own PostgreSQL/Mailpit (compose project `stella-int-qa`),
API, worker (fake translation), production builds; disposable data only.

| Check                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format / lint / typecheck          | pass / pass / 6 of 6                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Unit                               | **523 passed** (40 files: incl. WhatsApp, currency, search golden set, why-us quotes, migration guard)                                                                                                                                                                                                                                                                                                                                       |
| Integration (real PostgreSQL)      | **77/77** (75 in the full run; the HEIC test needed the pinned fixture `pnpm test:prepare` provides, and the OpenAPI snapshot was regenerated — both re-run and passing)                                                                                                                                                                                                                                                                     |
| Admin browser (390/768/1440, axe)  | **15 passed, 6 skipped by design, 0 failed** (SEO content suite + dashboard)                                                                                                                                                                                                                                                                                                                                                                 |
| Public e2e (fixture, 3 widths)     | **108 passed, 12 skipped, 0 failed** (5.9 min): booking/request flows, private booking, search, routes, SEO (metadata in head, guides, sitemap, llms.txt, back-links), WhatsApp (9), loading experience (18: no overlay, slow-navigation bar + slow notice, no flash, reduced motion, no-JS complete pages, image fallback), home/trip axe at 3 widths. The 12 skips are the 6 HTTP-level SEO tests on tablet/desktop (run once, on mobile). |
| Story loading / retry (real stack) | pass (skeleton, error, retry, dialog stays open, axe clean)                                                                                                                                                                                                                                                                                                                                                                                  |
| Migrations                         | §7                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Secret scan                        | `scripts/security-source-scan.mjs`: exit 0 (667 files)                                                                                                                                                                                                                                                                                                                                                                                       |
| Caddy                              | `caddy validate` valid (Phase 3; `infra/Caddyfile` unchanged in Phase 4)                                                                                                                                                                                                                                                                                                                                                                     |

Defects found and fixed in Phase 4: migration snapshot collision (would fail
CI's `drizzle-kit check`); search panel would have lost main's history fix;
trip JSON-LD would have stated the visitor's display currency for EUR prices;
home accessibility audit false positive caused by placeholder geometry;
admin spec audit timing (CI).

## 10. SEO crawl

Candidate fixture build: **350/350 sitemap URLs, 428 internal links, 0
errors, 1 warning** (the human-written 74-character French title of
`water-activities`, kept on purpose).

## 11. Performance (lab, mobile Lighthouse 13.6, medians)

| Page       | SEO-only (Phase 3 after) |           Combined candidate (5 runs) |
| ---------- | -----------------------: | ------------------------------------: |
| Home       |       3.69 s (TBT 27 ms) | 3.67 s (FCP 1.21 → 1.36 s, TBT 79 ms) |
| Collection |       2.94 s (TBT 15 ms) |    3.16 s (runs 2.89–3.36, TBT 42 ms) |
| Trip       |       2.64 s (TBT 12 ms) |                    2.71 s (TBT 43 ms) |
| Guide      |                   1.06 s |                                1.06 s |

CLS ≤ 0.0015 everywhere. The combined release costs ~14 KB more HTML on the
home page (the Why Stella section in the HTML and the server-component
payload) and ~30–60 ms more main-thread work; LCP is unchanged on home and
+0.07–0.2 s elsewhere. The loading layer itself adds one small client
component. **The 2.5 s lab target is still not met**; measured post-launch
work is listed in `TECHNICAL-SEO-REPORT.md` §7. No field (CrUX) data exists.

## 12. Staging readiness

The release pipeline (`.github/workflows/release.yml`) deploys staging on a
push to `develop` and production on a `vX.Y.Z` tag of a commit contained in
both `main` and `develop`; production refuses a commit without a recorded
staging acceptance (`docs/RUNBOOK.md`). **Blockers:** `develop` does not
exist on GitHub, the release workflow has never run in this repository, and
`https://staging.stellasharmtours.com` does not answer over HTTPS from here
(connection error). The staging environment (separate DB, env, `noindex`
Caddy config `infra/Caddyfile.staging`) must be brought up by whoever holds
the server; then deploy the candidate commit there and accept it.

## 13. Production release checklist

1. Owner approval (§17). Confirm production's current commit (`/srv/stella`
   release record) and migration history (query in §7).
2. Publish: commit the Google Reviews/WhatsApp work on `feat/google-reviews`
   as reviewed here (or push the candidate's merge), open its PR; merge order
   **PR #19 → PR #20 → PR #18 → Google Reviews/WhatsApp/Why Stella (with the
   0019/0020 re-stamp) → loading experience**, each with green CI; create
   `develop` from that `main`.
3. Staging: push `develop` → staging deploy (images by SHA); on staging run
   `pnpm db:migrate` (guard), smoke test admin per role, booking request,
   WhatsApp, Why Stella, seven languages, guide publication workflow,
   `pnpm seo:check --base <staging>`; record acceptance.
4. Backup: `deploy-release.sh` takes the pre-deploy Postgres dump + restic
   snapshot; verify the dump restores into a scratch DB before production.
   Back up the production env files and Caddy config (the script snapshots
   proxy config per release).
5. Production: tag `vX.Y.Z` on the accepted SHA; the workflow (environment
   `production`, required reviewer) runs `deploy-release.sh production <sha>`:
   backup → migrations once (0015→0020, additive) → new API → web/admin/worker
   → health/heartbeat probes → automatic image/proxy restore on failure.
6. After deploy: `https://www.stellasharmtours.com/it/` → 308 to the apex
   (new Caddy `www` site, certificate issued on reload); `/robots.txt`,
   `/sitemap.xml`; `pnpm seo:check --base https://stellasharmtours.com` → 0
   errors; metadata in `<head>` for `OAI-SearchBot`; one booking request on
   staging only; admin login and a draft guide save; WhatsApp numbers per
   language; web cache revalidation (publish/unpublish a test draft on
   staging, not production).

## 14. Backup and rollback

- **Application:** `bash infra/deploy.sh production --rollback` restores the
  previous images and proxy snapshot. Old code ignores the new tables and
  columns (all additive, with defaults), so app rollback does not need a
  schema rollback.
- **Database:** rolling back code never reverses migrations. Only if the
  schema itself must go, after a fresh backup: drop `verification_facts`,
  `visibility_measurements`, `content_pages`; `ALTER TABLE reviews DROP
COLUMN external_id, lang, featured, sort, edited, captured_at`;
  `ALTER TABLE booking_requests DROP CONSTRAINT request_currency, DROP COLUMN
currency` (and recreate the previous `worker_request_notification`
  definition, last set by `0006_runtime_database_privileges`); delete the matching
  `drizzle.__drizzle_migrations` rows. Prefer restoring the pre-deploy dump.
- `search_keywords` (0015) is nullable and backfilled only where empty.

## 15. External accounts (owner actions)

Google Search Console, Bing Webmaster Tools, Google Business Profile, GA4
(only if chosen), PageSpeed Insights API key, Tripadvisor — why, access,
setup, data and missing code are in `EXTERNAL-ACTIONS-REQUIRED.md` §C and §F.
All six "Search data" cards are placeholders (no OAuth, no stored
credentials, no data); nothing is described as connected.

**AI crawlers (unchanged, owner decision D1):** `AI_SEARCH_CRAWLERS`,
`AI_TRAINING_CRAWLERS`, `GOOGLE_EXTENDED` default to `allow`; private paths
are disallowed in every group, but **protection comes from authentication**
(admin sessions, API guards), not from robots.txt.

## 16. Business approvals outstanding

343 tour facts (`TOUR-VERIFICATION-CHECKLIST.md`, recordable in Admin →
Verification); 42 owner/legal FAQ answers; **17 prepared FAQ answers (drafts,
not published)**; guide languages (Italian especially); inclusions /
exclusions / fees / pickup; legal pages (terms, privacy, cancellation);
licence and company details; 10 guide drafts and the destination/activity
drafts (`[CONFIRM]` items); AI-training crawler choice; whether to keep the
dated Google rating/count on the home page until the review import exists.

## 17. Release authorization needed (one approval)

To proceed, the owner approves **all** of:

1. Commit and publish the Google Reviews + WhatsApp + Why Stella work exactly
   as in `ad77014` (snapshot of 18:05), with migrations re-stamped to
   0019/0020 as in `dd48bd3`.
2. Merge PR #19, PR #20, PR #18, then the Google Reviews/WhatsApp PR and the
   loading-experience commit, into `main`; create `develop`.
3. Deploy that SHA to staging, run migrations there, accept it.
4. Tag and deploy to production (migrations 0015→0020), with the backup and
   rollback in §13–14.

Server/staging access (or a person with it) is required for steps 3–4.

## Classification

| Item                                                                                                                             | Class                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Conflict resolution, migration re-stamp and rehearsal, loading experience, WhatsApp tests, combined QA, CI test fixes            | **Completed**                                      |
| Candidate (SEO + PR #18 + GR/WhatsApp/Why Stella + loading)                                                                      | **Ready for release** (after approval and staging) |
| Publishing GR/WhatsApp, merges, staging/production deploy, production migrations                                                 | **Blocked by authorization**                       |
| Staging server down / no `develop` / no SSH from here                                                                            | **Blocked by external account access** (server)    |
| Tour facts, FAQs, legal, licence, guide drafts, AI-training choice                                                               | **Blocked by business information**                |
| Search Console, Bing, GBP, GA4, PageSpeed, Tripadvisor                                                                           | **Blocked by external account access**             |
| Google Reviews import/API/admin moderation/reviews section (plan tasks 2–6); mobile LCP ≤ 2.5 s; external-data integrations code | **Remaining technical implementation**             |
