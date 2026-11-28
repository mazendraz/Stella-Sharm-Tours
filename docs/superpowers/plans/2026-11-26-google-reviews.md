# Google Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the 496 captured Google reviews into the existing `reviews` table, let staff curate them in the admin, and show the published ones (plus the overall rating and count) on the home page and trip pages.

**Architecture:** One migration extends `reviews`; a shared module (`@stella/shared/reviews`) owns the import-file schema, the public DTO, the language heuristic and the ordering rule, so the import script, API and web agree on one contract. The API serves `GET /v1/public/reviews` behind the existing public middleware (rate limit, ETag, cache headers) and admin CRUD under `/v1/admin/reviews*` with `auth.guard('content')`, `recordChange` (audit + revision + outbox revalidation with the new `reviews` tag). The web reads it through `lib/api.ts` like the catalog and renders a server component on home and a summary line inside `TripView`.

**Tech Stack:** PostgreSQL + drizzle-orm 0.45 / drizzle-kit 0.31, Hono API, zod 4, Next.js (next-intl) web, Next.js admin with react-query, vitest 4, Playwright with the :4100 fixture API, testcontainers for integration tests.

**Spec:** `docs/superpowers/specs/2026-11-26-google-reviews-design.md`

## Global Constraints

- Review `text`, `author`, `rating` are stored and rendered byte-for-byte as in `data/google-reviews.json`. No trim, no normalisation, no truncation in storage, no translation. Clamping is CSS only.
- `text` column holds exactly one key: `{ "<lang>": text }` or `{ "und": text }`; a review with no text is stored as `{ "und": "" }` (or `{ "<lang>": "" }` once staff set a language).
- `source = 'google'`, `source_url = meta.listingUrl`, new rows `status = 'hidden'`, `visit_month = visitMonth + '-01'`.
- Settings key `reviews` = `{ rating: number, count: number, listingUrl: string, writeReviewUrl: string, updatedAt: string(ISO) }`; seeded with `rating 5`, `count 499`, both URLs = `meta.listingUrl`; seed never overwrites an existing row.
- Every new UI string ships in EN/IT/ES/FR/DE/RU/TR. `reviews.leave` EN text is exactly "Leave us a review on Google" (table in spec §7 for the other six).
- No Google scripts, iframes, fonts or API calls. External links: `target="_blank" rel="noopener"`.
- Mobile first 390×844, then 768/1440. WCAG 2.2 AA: stars carry a text alternative ("5 out of 5"), 44px targets, visible focus, logical CSS properties only (`margin-inline`, `inset-inline-start`, …).
- Public site renders nothing (no section, no trip line) when zero reviews are published.
- Never edit an applied migration. The new migration is `0016_google_reviews` (0013–0015 belong to other uncommitted work in the tree and stay untouched).
- Commit only this feature's hunks on branch `feat/google-reviews`; the tree's other uncommitted work (currency, search, admin) must not be reverted, reformatted or committed. For files that already carry other work, stage only this feature's hunks (`git diff` of a pre-edit snapshot → `git apply --cached`).

**Deliberate deviation from the spec text:** the spec writes `GET /v1/reviews`. Every public read in this API lives under `/v1/public/*`, where the rate limiter, the trusted-reader HMAC, ETag and `Cache-Control` middleware are mounted; a route outside it would bypass them (security plan). The endpoint is therefore `GET /v1/public/reviews`.

**Placement:** home has no FAQ section. The reviews section goes after the last trip section (the "build your trip" block) and before "How it works", i.e. after trips and before the information blocks.

## Review Focus

1. A re-import after staff curation must not unpublish, unfeature, reorder or re-language anything; only `text/author/rating/edited/visit_month/captured_at` refresh (test in Task 3).
2. Hidden reviews must never leak through the public endpoint, the ETag, or the home HTML (test in Task 4, `hidden text never appears`).
3. Text containing a zero-width space, `"…"`, emoji, newlines or RTL script renders unchanged: the byte-for-byte check uses the first captured review, which starts with U+200B (test in Task 6).
4. A trip page served in a locale with no reviews in that language still shows the summary line and the home section still shows featured/newest reviews in other languages (ordering test in Task 2).
5. `rating`/`count` edits by an `editor` role are refused (owner/manager only per spec §6) while publish/hide/feature by an editor succeed (test in Task 4).

---

### Task 1: Migration, schema, grants

**Files:**

- Modify: `packages/db/src/schema.ts` (the `reviews` table, lines ~439–448)
- Create: `packages/db/drizzle/0016_google_reviews.sql`, `packages/db/drizzle/meta/0016_snapshot.json` (via `pnpm db:generate`), journal entry in `packages/db/drizzle/meta/_journal.json`
- Modify: `packages/db/src/runtime-privileges.ts` (api role: `SELECT, UPDATE ON reviews`; worker: none)

**Interfaces:**

- Produces: `s.reviews` columns `externalId: text('external_id')`, `lang: text('lang')`, `featured: boolean('featured').notNull().default(false)`, `sort: integer('sort').notNull().default(0)`, `capturedAt: timestamp('captured_at', { withTimezone: true })`, `edited: boolean('edited').notNull().default(false)`, plus unique index `reviews_external_id_unique` on `external_id` (partial `where external_id is not null`) and index `reviews_published_order` on `(status, featured, sort)`.

- [ ] **Step 1:** `git switch -c feat/google-reviews` (keeps the working tree and index as they are). Snapshot every file this plan modifies that already has uncommitted changes into the scratchpad `base/` folder before the first edit to it.
- [ ] **Step 2:** Add the columns to `reviews` in `schema.ts`, run `pnpm db:generate`, rename the generated file to `0016_google_reviews.sql` (and its journal tag). Expected SQL: four/five `ALTER TABLE "reviews" ADD COLUMN …` plus the two `CREATE INDEX`/`CREATE UNIQUE INDEX`, nothing touching other tables. If drizzle-kit emits anything else, the snapshot is out of sync: stop and inspect.
- [ ] **Step 3:** Add `reviews` to the api grants. Run `pnpm db:migrate` against the dev DB; expected: applies 0016 only.
- [ ] **Step 4:** `pnpm typecheck` green. Commit (`feat(db): extend reviews for Google import`).

### Task 2: Shared reviews contract

**Files:**

- Create: `packages/shared/src/reviews.ts`, `packages/shared/src/reviews.test.ts`
- Modify: `packages/shared/package.json` exports only if the package does not already export `./*`

**Interfaces:**

- Produces:
  - `reviewFileSchema` (zod): `{ meta: { listingUrl: url, capturedAt: iso datetime, ratingAtCapture: number 1–5, reviewCountAtCapture: int ≥ 0, … passthrough }, reviews: Array<{ externalId: string 1–400, author: string 1–200, rating: int 1–5, visitMonth: /^\d{4}-(0[1-9]|1[0-2])$/, edited: boolean, text: string ≤ 20000, notEnglish: boolean, ownerReplied: boolean }> }` with unique `externalId`. Strings are validated, never transformed (no `.trim()`).
  - `reviewsSettingsSchema` (`{ rating: number 1–5 step 0.1, count: int 0–1e7, listingUrl: https url, writeReviewUrl: https url, updatedAt: iso }`) and `type ReviewsSettings`.
  - `publicReviewSchema = { id: uuid, author: string, rating: 1–5, text: string, lang: string|null, visit_month: 'YYYY-MM' | null }` and `publicReviewsSchema = { rating, count, listingUrl, writeReviewUrl, items: publicReviewSchema[] }`, `type PublicReviews`.
  - `detectLang(text: string): string | null` — script heuristic: Cyrillic → `ru`, Arabic → `ar`; Latin text scored by stop-word lists for `en/it/es/fr/de/tr` plus diacritics (`ğış` → tr, `ß äöü` → de, `ñ ¿¡` → es, `àèìòù` + it words → it, `çéèêœ` + fr words → fr); returns null for empty text, < 3 words with no distinctive script, or a tie.
  - `orderReviews<T extends { featured: boolean; sort: number; lang: string|null; visitMonth: string|null; capturedAt: Date|string|null }>(rows: T[], locale: string): T[]` — featured first by `sort` asc, then `lang === locale` first, then `visitMonth` desc, then `capturedAt` desc. Stable.

- [ ] **Step 1: Failing tests** in `reviews.test.ts`:
  - `reviewFileSchema accepts data/google-reviews.json` (parses the real file; 496 reviews).
  - `reviewFileSchema rejects duplicate externalId, rating 6, visitMonth "2026-13"`.
  - `reviewFileSchema keeps text byte-for-byte` — parsed `reviews[0].text` `===` raw JSON value and starts with `'​'`.
  - `detectLang`: `detectLang('Отличная экскурсия, всем советую')==='ru'`, `'Excursión increíble, el guía fue muy amable y todo perfecto'→'es'`, `'Escursione bellissima, la guida era molto gentile e tutto perfetto'→'it'`, `'Super Ausflug, der Guide war sehr nett und alles war perfekt'→'de'`, `'Excursion incroyable, le guide était très gentil et tout était parfait'→'fr'`, `'Harika bir tur, rehber çok ilgiliydi, herkese tavsiye ederim'→'tr'`, `'Great trip, the guide was very friendly and everything was perfect'→'en'`, `detectLang('')===null`, `detectLang('👍👍')===null`, `detectLang('ok')===null`.
  - `orderReviews puts featured by sort, then visitor language, then newest` with five rows covering each tie-break.
- [ ] **Step 2:** `pnpm vitest run packages/shared/src/reviews.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `reviews.ts`.
- [ ] **Step 4:** Same command → PASS. Also run `detectLang` over the real file and print the distribution; spot-check ≥ 10 rows of each detected language by eye and check no row flagged `notEnglish:false` is detected as non-`en` unless its text clearly is. Adjust word lists, not tests.
- [ ] **Step 5:** Commit (`feat(shared): reviews contract, language heuristic, ordering`).

### Task 3: Import command and settings seed

**Files:**

- Create: `packages/db/src/reviews-import.ts`, `scripts/import-reviews.ts`, `apps/api/src/reviews.integration.test.ts` (shared by Task 4)
- Modify: `package.json` (script `"reviews:import": "tsx --env-file-if-exists=.env scripts/import-reviews.ts"`), `packages/db/src/seed-data.ts` (seed the `reviews` settings row)

**Interfaces:**

- Consumes: `reviewFileSchema`, `detectLang`, `reviewsSettingsSchema` (Task 2).
- Produces:
  - `importReviews(db: Database, input: unknown, now = new Date()): Promise<{ created: number; updated: number; unchanged: number }>` — validates with `reviewFileSchema` (throws `ZodError` on bad input, writes nothing), runs in one transaction, `insert … on conflict (external_id) do update` touching only `author, rating, text, edited, visit_month, captured_at, source_url` and only when one of them differs; `lang` = existing lang ?? `detectLang(text)`; the text key is that lang or `und`. `captured_at = meta.capturedAt`.
  - `reviewsSettingsFromMeta(meta): ReviewsSettings` (rating `ratingAtCapture`, count `reviewCountAtCapture`, both URLs `listingUrl`, `updatedAt = capturedAt`).
  - CLI: `pnpm reviews:import [file]`, default `data/google-reviews.json`, uses `MIGRATION_DATABASE_URL ?? DATABASE_URL` like `scripts/seed.ts`, prints `Reviews: N new, N updated, N unchanged`. The import does not touch the `reviews` settings row.
  - Seed: `seedCatalog` adds `reviews: reviewsSettingsFromMeta(meta)` to its insert-if-absent defaults when `data/google-reviews.json` exists next to the catalog (`new URL('google-reviews.json', catalogPath)`); it never imports reviews.

- [ ] **Step 1: Failing integration tests** in `apps/api/src/reviews.integration.test.ts` (own `PostgreSqlContainer('postgres:16')`, migrate only, no catalog seed):
  - `imports every captured review as hidden` → result `{ created: 496, updated: 0, unchanged: 0 }`; `count(*) where status='hidden'` = 496; first row's stored text value `===` the file text; `source='google'`; `source_url` = listingUrl; `visit_month` = `'YYYY-MM-01'`.
  - `is idempotent` → second run `{ created: 0, updated: 0, unchanged: 496 }`, row count still 496.
  - `keeps status, featured, sort and lang on re-import` → set one row `status='published', featured=true, sort=3, lang='it'`, change its text in the input copy, re-import → `{ updated: 1 }`, those four values unchanged, text refreshed under the `it` key.
  - `rejects an invalid file without writing` → `rating: 9` → throws, row count unchanged.
- [ ] **Step 2:** `pnpm vitest run --config vitest.integration.config.ts apps/api/src/reviews.integration.test.ts` → FAIL.
- [ ] **Step 3:** Implement `importReviews`, `reviewsSettingsFromMeta`, the CLI script, the root script, the seed default.
- [ ] **Step 4:** Same command → PASS. Then `pnpm reviews:import` against the dev DB → `496 new`; run again → `496 unchanged`.
- [ ] **Step 5:** Commit (`feat(db): pnpm reviews:import and reviews settings seed`).

### Task 4: Public and admin API

**Files:**

- Create: `apps/api/src/reviews.ts`
- Modify: `apps/api/src/app.ts` (call `registerReviews(app, db, cfg, auth)` next to `registerHomepage`; public route is registered inside it but after the `/v1/public/*` middleware, which is mounted before), `apps/api/src/admin-contracts.ts` (contracts below), `apps/api/src/jobs.ts` and `apps/web/src/app/api/revalidate/route.ts` (allow tag `reviews` in both tag regexes), `tests/contracts/openapi.json` (snapshot update), `apps/api/src/reviews.integration.test.ts`

**Interfaces:**

- Consumes: `orderReviews`, `publicReviewsSchema`, `reviewsSettingsSchema` (Task 2); `recordChange` (`admin.ts`), `auth.guard`, `auth.parse`, `fail`.
- Produces:
  - `GET /v1/public/reviews?locale=xx&limit=n` (`limit` 1–24, default 12) → `PublicReviews`. With no published rows it returns 200 `{ …settings, items: [] }`. When the `reviews` settings row is missing it returns 404 `REVIEWS_UNAVAILABLE` (the web treats that as "render nothing"). Items carry `text` = the single value of the `text` jsonb, unmodified.
  - `GET /v1/admin/reviews` (content) → `{ settings: ReviewsSettings | null, items: AdminReview[] }` where `AdminReview = { id, author, rating, text, lang, visitMonth, status, featured, sort, edited, capturedAt }`, all rows, ordered `featured desc, sort, visit_month desc`. Filtering is client-side (≤ ~500 rows).
  - `PATCH /v1/admin/reviews/:id` (content) body `strictObject({ status?: 'published'|'hidden', featured?: boolean, lang?: /^[a-z]{2,3}$/ | null })` — no text/author/rating fields exist. Setting `featured:true` puts the row at `max(sort)+1`.
  - `POST /v1/admin/reviews/order` (content) body `{ ids: uuid[] (1–100, unique) }` → sets `sort = index` for featured rows, 422 `NOT_FEATURED` if any id is not featured.
  - `POST /v1/admin/reviews/publish-bulk` (content) body `{ lang: /^[a-z]{2,3}$/ }` → publishes hidden rows with `rating = 5`, non-empty text and that `lang`; returns `{ published: n }`.
  - `PUT /v1/admin/reviews/settings` (**publish** permission = owner, manager) body `reviewsSettingsSchema` without `updatedAt` (server sets it).
  - Every write calls `recordChange(tx, c, cfg, 'review' | 'review_settings', id, before, after, action, ['reviews'])` (`action`: `'update'`, `'reorder'`, `'bulk_publish'`). Entity names are not `settings` so `recordHumanFields` never queues URLs or numbers for translation.
  - Web tag `reviews`; web reads tag it `['catalog', 'reviews']`.

- [ ] **Step 1: Failing tests** appended to `reviews.integration.test.ts` (create the app with `configSchema.parse` as in `backend.integration.test.ts`, run `applyRuntimePrivileges` with a throwaway api role so grants are exercised, log in owner/editor via inserted `adminUsers` rows):
  - `serves only published reviews in order` → publish 3 (one featured sort 0, one `lang='it'`, one `lang='en'` newer), `GET /v1/public/reviews?locale=it` → ids in order [featured, it, en]; `rating 5`, `count 499`, both URLs = listingUrl.
  - `hidden text never appears` → response body string does not contain the text of any hidden row; `Cache-Control` is `public, s-maxage=60, stale-while-revalidate=600`.
  - `returns no items when nothing is published` → `items: []`.
  - `editor can publish, feature and reorder; cannot change rating` → editor PATCH 200, order 200, settings PUT 403; owner settings PUT 200 and `updatedAt` changes.
  - `writes audit rows and queues revalidation` → after one PATCH: one `audit_log` row `entity='review'`, one `outbox` row `name='revalidate.web'` with `tags: ['reviews']`.
  - `refuses text edits` → PATCH with `{ text: 'x' }` → 422; stored text unchanged.
  - `bulk publishes 5-star reviews with text in one language` → count matches a direct SQL count.
- [ ] **Step 2:** Run the integration file → FAIL.
- [ ] **Step 3:** Implement `reviews.ts`, contracts, tag regexes.
- [ ] **Step 4:** Run the integration file → PASS. Run the OpenAPI snapshot test in `backend.integration.test.ts` with `-u` scoped to it, and confirm the snapshot diff only adds `/v1/admin/reviews*` paths.
- [ ] **Step 5:** Commit (`feat(api): public and admin reviews endpoints`).

### Task 5: Admin — More → Reviews

**Files:**

- Create: `apps/admin/src/screens/reviews.tsx`, `data/i18n/admin-reviews.json`
- Modify: `apps/admin/src/components/admin-app.tsx` (`case 'reviews': guard('content', <Reviews />)`), `apps/admin/src/components/ui/app-shell.tsx` (nav item `{ id: 'reviews', href: '/reviews', icon: Star, permission: 'content' }` in the `navWebsite` group), `scripts/admin-messages.mjs` and `apps/admin/src/lib/messages.test.ts` (read the new source file), regenerated `apps/admin/messages/*.json` (`pnpm admin:messages`), `apps/admin/src/screens/activity.tsx` if it maps entity labels

**Interfaces:**

- Consumes: the admin endpoints of Task 4; existing `useAdmin`, `useData`, `PageHeader`, `FilterBar`, `StatusBadge`, `Callout`, `EmptyState`, `useConfirm`.

- [ ] **Step 1:** Before regenerating, run `pnpm admin:messages` on the untouched tree and `git diff --stat apps/admin/messages`; if it changes anything, the other work edited the dictionaries by hand — then add the new keys to the dictionaries by appending, instead of regenerating, and still keep `admin-reviews.json` as the source.
- [ ] **Step 2:** Author `admin-reviews.json` (`{ key: [en, it, es, fr, de, ru, tr] }`) for: `reviews`, `reviewsSummary`, `reviewsRating`, `reviewsCount`, `reviewsListingUrl`, `reviewsWriteUrl`, `reviewsUpdated`, `reviewsVerbatimNote`, `reviewsFilterStatus`, `reviewsFilterRating`, `reviewsFilterLang`, `reviewsWithText`, `reviewsPublish`, `reviewsHide`, `reviewsFeature`, `reviewsUnfeature`, `reviewsMoveUp`, `reviewsMoveDown`, `reviewsBulkPublish` (with `{lang}`), `reviewsBulkDone` (with `{n}`), `reviewsNoText`, `reviewsLangUnknown`, `reviewsStars` (`{n} out of 5`), `reviewsEmpty`, `reviewsFeatured`. `messages.test.ts` must pass (all seven present, non-blank).
- [ ] **Step 3:** Build the screen: summary card (rating, count, URLs, "Last updated"; form only when `can(role,'publish')`), filter bar (status / rating / language / with text), list rows (author, stars with `aria-label`, month, language, two-line clamp of text, status chip), row actions Publish/Hide, Feature/Unfeature, ↑/↓ among featured (buttons, 44px), bulk publish with a language select and a confirm dialog. Text is shown, never in an input. A `Callout` carries `reviewsVerbatimNote`.
- [ ] **Step 4:** `pnpm vitest run apps/admin` and `pnpm typecheck` green. Manually in the dev admin at 390 and 1440: publish 6 reviews (EN, IT, RU, DE…), feature 2, reorder, edit nothing else.
- [ ] **Step 5:** Commit (`feat(admin): Reviews screen`).

### Task 6: Website — home section and trip line

**Files:**

- Create: `apps/web/src/components/reviews.tsx` (server component `ReviewsSection`, client child `ReviewText` for "Read more", `ReviewsSummaryLine`), `apps/web/src/components/reviews.test.ts`
- Modify: `apps/web/src/lib/api.ts` (`getReviews(locale, limit = 12)`, tags `['reviews']`), `apps/web/src/app/[locale]/page.tsx`, `apps/web/src/app/[locale]/t/[slug]/page.tsx`, `apps/web/src/app/[locale]/@modal/(.)t/[slug]/page.tsx`, `apps/web/src/components/trip-view.tsx` (optional prop `reviews?: { rating: number; count: number; listingUrl: string } | null`, rendered right after the price block's `childrenAsk` line), `apps/web/src/app/globals.css`, `apps/web/messages/{en,it,es,fr,de,ru,tr}.json`, `tests/fixtures/server.mjs` (serve `/v1/public/reviews` from the first three published-eligible reviews of `data/google-reviews.json` plus meta; `items: []` when env `FIXTURE_NO_REVIEWS=1`), `tests/e2e/reviews.spec.ts`

**Interfaces:**

- Consumes: `publicReviewsSchema`, `PublicReviews` (Task 2), `GET /v1/public/reviews` (Task 4).
- Produces: web message keys `reviewsTitle`, `reviewsOnGoogle` (`{count} reviews on Google`, ICU plural), `reviewsReadAll`, `reviewsLeave` (= spec's `reviews.leave`; flat key to match the existing flat dictionaries), `reviewsReadMore`, `reviewsReadLess`, `reviewsStars` (`{n} out of 5`), `reviewsGoogle` ("Google"), `reviewsSummary` (`{rating} · {count} Google reviews`).

- [ ] **Step 1: Failing tests**
  - `apps/web/src/components/reviews.test.ts` (renders with `renderToStaticMarkup`, passing a `t` stub): `renders nothing with zero items` (`''`), `stars have a text alternative` (`role="img"` + `aria-label="5 out of 5"`), `renders review text byte-for-byte` (output contains `escape(reviews[0].text)` of the real first review, U+200B included), `external links open in a new tab with rel=noopener` (every `href^="https://www.google.com"` anchor has both attributes). If vitest cannot render the `.tsx` import, move these four checks into `tests/e2e/reviews.spec.ts` and note it in the plan.
  - `tests/e2e/reviews.spec.ts` (fixture API, all three projects): `home shows the reviews section after trips` in all seven locales (title text from that locale's dictionary, rating `5.0`, `499`), `trip page shows the Google summary under prices`, axe has no violations in `#reviews`, and screenshots `reviews-home-{project}-{locale}.png` into `test-results/`.
- [ ] **Step 2:** Run both → FAIL.
- [ ] **Step 3:** Implement. Section markup: `<section id="reviews" aria-labelledby="reviews-heading">`, header with big rating + link, `<ul>` of cards (scroll-snap row < 768px, 3-column grid ≥ 1024px), card = stars, `<blockquote lang={lang ?? undefined}>` (text inside `<bdi>`-free `dir="auto"` paragraph, CSS line-clamp 6, "Read more" button toggles `aria-expanded`), author, month (`Intl.DateTimeFormat(locale,{month:'long',year:'numeric'})`), "Google" label, card links to `listingUrl`. Buttons "Read all reviews on Google" and "Leave us a review on Google". Rating formatted with `Intl.NumberFormat(locale,{minimumFractionDigits:1})`, count with `Intl.NumberFormat(locale)`.
  - Home fetches `getReviews(locale)` alongside site/collections, but a reviews failure must not take the page down: `.catch(() => null)`.
  - Trip pages pass `reviews={data.items.length ? summary : null}`.
- [ ] **Step 4:** Both test files PASS; then `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- [ ] **Step 5:** Manual: with the dev stack and the reviews published in Task 5, open home and one trip page in all seven locales at 390 and 1440; hide all reviews and confirm both disappear after revalidation.
- [ ] **Step 6:** Commit (`feat(web): Google reviews on home and trip pages`).

### Task 7: Docs and wrap-up

**Files:**

- Modify: `docs/DECISIONS.md` (row: "Review text — third-party quote, stored and shown in its original language only; never translated; the seven-language rule covers the UI around it"), `QUESTIONS.md` (open owner question from spec §9), `CHANGELOG.md` (one Unreleased entry), this plan (tick tasks)

- [ ] **Step 1:** Write the three doc entries.
- [ ] **Step 2:** Full gate: `pnpm test && pnpm lint && pnpm typecheck` and the reviews integration file. All green, output recorded in the report.
- [ ] **Step 3:** Commit (`docs: Google reviews decision, question, changelog`).
