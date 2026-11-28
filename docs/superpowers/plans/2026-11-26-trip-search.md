# Trip Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A header search button that opens a panel with suggestions and finds the intended trip from a query in any language, with typos, instantly on phones.

**Architecture:** The API builds one compact multilingual search index (all published trips, packages and collections; text from every live locale plus staff-edited keywords). The web app proxies and caches it, the browser downloads it on first open of the search panel, and a pure shared module (normalization + MiniSearch) ranks results locally on every keystroke. A golden query table built from the repo's seed data is the quality contract.

**Tech Stack:** TypeScript, Hono API, Drizzle/PostgreSQL, Next.js (App Router) + next-intl, Zod 4, MiniSearch, Vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-26-trip-search-design.md`

## Global Constraints

- Node `>=22 <23` and pnpm 10 (root `engines`); run every command under Node 22 (the machine default is Node 24 and pnpm refuses it).
- No hosted search/BaaS; only new runtime dependency allowed: `minisearch` (exact pinned version, MIT) in `@stella/shared`.
- Prices only from the DB: `from_price_eur` comes from the trip's primary price; `null` renders the existing `onRequest` string.
- Never show draft, hidden or archived trips/collections; never invent "popular" — suggestions are `site.featured_trips` order.
- Query text is never sent anywhere: not analytics, not logs, not the translation provider, not the WhatsApp link.
- Keywords are never displayed and never machine-translated.
- Every new UI string in all 7 files `apps/web/messages/{en,it,es,fr,de,ru,tr}.json` and admin strings in `apps/admin/messages/*.json` (CI key-parity check). Authored text, no EN fallback.
- Mobile first 390×844; also 768 and 1440. WCAG 2.2 AA, 44px targets, visible focus, `prefers-reduced-motion`, CSS logical properties (RTL `ar`).
- Index payload ≤ 80 KB gzip for the seeded catalog with 10 auto locales.
- Matching thresholds: tokens ≤ 3 chars exact; 4–6 chars 1 edit; ≥ 7 chars 2 edits. Boosts: title 5, keywords 3, places 2, collection 1. Max 8 results, max 2 collections.
- Keyword validation: ≤ 30 per locale and in `extra`, each trimmed 1–60 chars, deduplicated case-insensitively.
- Small PRs: each task below is one commit; update `CHANGELOG.md` in the last task.

## Review Focus

1. **Same words in many trips** ("ras mohammed" matches 3 trips, "cairo" 6): the visitor expects every one of them in the top results, the exact-title one first — golden cases with `top: 3` and rank-1 cases on full titles (Task 3).
2. **Arabic when no auto-translation provider is configured** (auto locales off → no Arabic titles in the index): Arabic queries must still hit via `extra` keywords (Task 3 golden cases run with core locales only).
3. **Visitor on an auto locale whose text fell back to EN** (e.g. `/pl` with a missing translation): result title must carry `lang="en"` and still be found (Task 4 API test, Task 6 render).
4. **Index download fails or is slow** (hotel Wi-Fi): panel stays usable — chips render from page data, skeleton then Retry; typing before the index arrives keeps the query and searches once it lands (Task 6 unit test).
5. **Mixed/odd input**: emoji, 200-char paste, only spaces, digits ("7in1", "5 in 1"), punctuation ("st. catherine"): no crash, sane results (Task 1 tests).

---

### Task 1: Shared normalization and matching engine

**Files:**
- Create: `packages/shared/src/search.ts`
- Test: `packages/shared/src/search.test.ts`
- Modify: `packages/shared/package.json` (add `minisearch`), `pnpm-lock.yaml`

**Interfaces:**
- Produces:
  - `normalize(text: string): string`
  - `tokenize(text: string): string[]` (normalized tokens; CJK/Thai runs also emit char bigrams; Arabic tokens of ≥ 4 letters lose a leading `ال`)
  - `searchIndexSchema` (Zod) and `type SearchIndex`, `type SearchEntry` exactly as spec §5.2 (`Text`, `Media` from `public-contract.ts`; `fields` arrays hold already-normalized strings)
  - `createSearch(index: SearchIndex): (query: string) => SearchEntry[]`

- [ ] **Step 1: Write failing tests** — `describe('normalize')`, one `it` per rule:
  `normalize('Égypte') === 'egypte'`, `'Straße'→'strasse'`, `'Ёлка'→'елка'`, `'İSTANBUL'`/`'ışık'` → `'istanbul'`/`'isik'`, `'Œuvre'→'oeuvre'`, `'رَأْسُ مُحَمَّدٍ'→'راس محمد'`, `'الأهرامات'` tokenizes to `['اهرامات']`, `'مدينة'→'مدينه'`, `'مستشفى'→'مستشفي'`, `'٣ أيام'→'3 ايام'`, `'St. Catherine — Dahab'→'st catherine dahab'`, `'  '→''`, emoji-only → `''`, 200-char input does not throw.
  `describe('createSearch')` with a 4-entry inline fixture: prefix (`'pyra'` hits pyramids entry), 1-edit typo at 5 chars (`'tiren'`), 2-edit at 9 chars (`'snorkling'`→ keyword `snorkeling`), no fuzz at 3 chars (`'spx'` returns nothing), title outranks keyword-only match, AND→OR fallback (`'tiran xyzzy'` still returns Tiran), empty/whitespace query returns `[]`, collections capped at 2, total capped at 8, ties ordered by `suggested` then index order, `'5 in 1'` and `'5in1'` both find `super-safari-5in1`.

- [ ] **Step 2: Run** `pnpm vitest run packages/shared/src/search.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** in `search.ts`. Normalization order: NFKD → strip `\p{M}` and Arabic tatweel `ـ` → map table (`ß ss`, `æ ae`, `œ oe`, `ø o`, `ı i`, `ё е`, `أإآٱ→ا`, `ة→ه`, `ى→ي`, `ؤ→و`, `ئ→ي`, Arabic-Indic `٠-٩` and Persian `۰-۹` → `0-9`) → `toLowerCase()` (no locale arg) → `[^\p{L}\p{N}]+` → space → trim. Also split letter↔digit boundaries so `5in1` ≡ `5 in 1`. MiniSearch: `fields: ['title','keywords','places','collection']`, `storeFields` none (look entries up by id), `tokenize` = `tokenize`, `processTerm` = identity (already normalized), `searchOptions: { prefix: true, fuzzy: (term) => term.length <= 3 ? 0 : term.length <= 6 ? 1 : 2, boost: {title:5, keywords:3, places:2, collection:1}, combineWith: 'AND' }`, retry with `'OR'` when empty.

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** `feat(shared): search normalization and matching engine`

---

### Task 2: Pure index builder

**Files:**
- Modify: `packages/shared/src/search.ts`
- Test: `packages/shared/src/search.test.ts` (new `describe('buildSearchIndex')`)

**Interfaces:**
- Consumes: `normalize`, `SearchIndex` (Task 1), `SearchKeywords` (below).
- Produces:
  - `type SearchKeywords = Partial<Record<'en'|'it'|'es'|'fr'|'de'|'ru'|'tr', string[]>> & { extra?: string[] }`
  - `type SearchSource` = `{ locale: string; suggested: string[]; collections: SourceCollection[]; trips: SourceTrip[] }` where
    `SourceCollection = { slug; type: 'collection'; names: string[] /* every locale's name + short name */; keywords: SearchKeywords | null; display: { title: Text; thumb: Media | null } }` and
    `SourceTrip = { slug; type: 'trip' | 'package'; collection: string; titles: string[]; places: string[] /* highlight items, every locale */; collectionNames: string[]; keywords: SearchKeywords | null; display: { title: Text; collection_name: Text | null; thumb: Media | null; from_price_eur: number | null; duration: Text | null } }`
  - `buildSearchIndex(source: SearchSource): SearchIndex` — normalizes and de-duplicates every field array, flattens keywords (all locales + `extra`), `version` = FNV-1a 64-bit hex of the canonical JSON of entries (sync, no `node:crypto`, so the module stays browser-safe).

- [ ] **Step 1: Failing tests:** duplicates across locales collapse (`['Tiran Island','Isola di Tiran','tiran island']` → 2 normalized strings); keywords from `it` and `extra` both land in `fields.keywords`; collections come before trips only in index order as given; `version` differs when one title changes and is equal for identical input; output parses with `searchIndexSchema`.
- [ ] **Step 2: Run** `pnpm vitest run packages/shared/src/search.test.ts` — FAIL.
- [ ] **Step 3: Implement** `buildSearchIndex` (pure, no I/O).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(shared): build multilingual search index`

---

### Task 3: Search keywords data, DB column, seed, golden set

**Files:**
- Create: `data/search-keywords.json`, `packages/db/drizzle/0015_search_keywords.sql` (+ generated `meta/0015_snapshot.json`, `_journal.json` entry via `pnpm db:generate`)
- Modify: `packages/db/src/schema.ts` (trips, collections), `packages/db/src/seed-data.ts` (apply keywords), `packages/shared/src/admin.ts` (schemas)
- Create: `packages/shared/src/search-golden.test.ts`, `packages/shared/src/search-golden.fixture.ts` (builds a `SearchSource` from repo data)
- Test: `packages/shared/src/search-golden.test.ts`, keyword coverage test in the same file

**Interfaces:**
- Produces:
  - DB: `search_keywords jsonb` nullable on `trips` and `collections`; Drizzle `searchKeywords: jsonb('search_keywords').$type<SearchKeywords>()`.
  - `searchKeywordsSchema` in `packages/shared/src/admin.ts`: strict object, optional keys `en,it,es,fr,de,ru,tr,extra`, each `z.array(z.string().trim().min(1).max(60)).max(30)` with a refine rejecting case-insensitive duplicates. Added as `searchKeywords: searchKeywordsSchema.nullable().optional()` to `seoSchema` and `collectionEditSchema`.
  - `data/search-keywords.json`: `{ "trips": { "<slug>": SearchKeywords }, "collections": { "<slug>": SearchKeywords } }`.
  - `buildRepoSearchSource(options: { locales: string[] }): SearchSource` in the fixture: reads `data/catalog.json` (EN titles, highlights, collection names), `data/i18n/core-source.json` + `core-content.json` (source string → `[it,es,fr,de,ru,tr]`), and `data/search-keywords.json`.

- [ ] **Step 1: Author `data/search-keywords.json`** for all 44 trips, 4 packages and 7 collections: per core language 3–12 words people use (activity, place, animals, vehicle, common misspellings), and `extra` with the Arabic place name(s) and main activity (both spellings with and without hamza where common), plus Arabizi forms for well-known places (`ras mo7amed`). No prices, no claims. Examples: `dolphin-show.extra: ["دولفين","دلافين","عرض الدلافين"]`; `quad-bike-safari.de: ["Quad","Quadfahren","Wüstensafari"]`; `sea-scope-submarine.en: ["submarine","semi submarine","sea scope","seascope"]`.

- [ ] **Step 2: Write the golden test (failing — fixture missing).** Table type `{ q: string; expect: string; top?: 1 | 3; locales?: 'core' | 'all' }`, ≥ 120 rows, asserting `results.slice(0, top ?? 1).map(e => e.slug)` contains `expect`. Required coverage (each line is several rows):
  - Every trip's full EN title → rank 1. Every collection's EN name → rank 1 among collections.
  - For 10 trips (incl. `tiran-island-boat`, `dolphin-show`, `quad-bike-safari`, `mount-sinai-st-catherine`, `petra-bus-ferry`, `luxor-plane-1-day`, `sea-scope-submarine`, `spa-turkish-bath`, `aqua-park`, `dahab-day-trip`): the title in IT, ES, FR, DE, RU, TR, lower-case, accents stripped.
  - Typos: `piramds`→ a `cairo-*` (top 3), `snorkling`→ a `ras-mohammed-*` (top 3), `ras mohamed` (top 3), `tiren`→`tiran-island-boat`, `sinia`→`mount-sinai-st-catherine`, `dolfin`→`dolphin-show`, `quadd`→`quad-bike-safari`, `submarin`→`sea-scope-submarine`.
  - Arabic, run with `locales: 'core'` (no auto text): `دلافين`, `الدلافين`, `رأس محمد` and `راس محمد` (top 3), `الأهرامات` and `اهرامات` (top 3), `سفاري` (top 3), `جزيرة تيران`/`جزيره تيران`, `حمام تركي`.
  - Intent words: `schnorcheln`, `snorkeling`, `сафари`, `tekne`, `cammello` / `camel`, `horse`/`cavallo`/`лошадь`, `museum`/`museo`/`музей` (top 3), `7in1`, `5 in 1`.
  - Cross-language: a German title queried while `index.locale === 'en'`.
  - Negatives: `xqzt` → `[]`; every slug whose catalog status is not `published` never appears for its own title.
  Plus a coverage `it`: every published trip and collection in `data/catalog.json` has a non-empty array for all 7 core keys and for `extra`, and at least one `extra` keyword contains an Arabic letter.

- [ ] **Step 3: Run** `pnpm vitest run packages/shared/src/search-golden.test.ts` — Expected: FAIL.
- [ ] **Step 4: Implement the fixture builder**; iterate on keywords (not on test expectations) until green. A failing row may only be changed if the expectation itself is wrong for a visitor; record any such change in the commit message.
- [ ] **Step 5: Schema + migration:** add the columns, `pnpm db:generate`, rename output to `0015_search_keywords.sql`; add the schema fields above; extend `apps/api/src/admin.ts` `tripChanges('seo', …)` and the collection PATCH so `searchKeywords` is written (check `requireCoreCopy` ignores this non-`Localized` field, and the content-draft path keeps it). Seed: `seedCatalog` writes `search_keywords` from `data/search-keywords.json` for trips/packages/collections by slug, without overwriting a non-null DB value (repeatable seed).
- [ ] **Step 6: Run** `pnpm vitest run packages/shared` and `pnpm test:integration` (seed runs) — Expected: PASS.
- [ ] **Step 7: Commit** `feat(db): search keywords per trip and collection with golden search set`

---

### Task 4: Public API `GET /v1/public/search-index`

**Files:**
- Create: `apps/api/src/search-index.ts`
- Modify: `apps/api/src/app.ts` (route next to `/v1/public/collections`), `tests/contracts/openapi.json`
- Test: `apps/api/src/backend.integration.test.ts` (new `describe('search index')`), `apps/api/src/backend.test.ts` (query validation)

**Interfaces:**
- Consumes: `buildSearchIndex`, `SearchSource`, `searchIndexSchema` (Tasks 1–2); `loadCatalog`, `loadLiveLocales` from `catalog.ts`.
- Produces: `loadSearchSource(db: Reader, locale: string, mediaOrigin: string): Promise<SearchSource>`; route returns `searchIndexSchema`-valid JSON.

- [ ] **Step 1: Failing tests:** 422 on unknown/duplicate query keys; 404 `LOCALE_NOT_FOUND` for a non-live locale; response parses with `searchIndexSchema`; a draft trip and an archived collection are absent; a trip with an IT translation row in `content_translations` has the Italian title in `fields.title` while `locale=en`; an enabled auto locale's machine row is included, a disabled one is not; a row whose `source_hash` no longer matches the EN value is excluded; `suggested` equals `site.featured_trips` slugs in order; `from_price_eur` equals the primary price and becomes `null` for `on_request`; on `locale=pl` with no PL title the entry `title.lang === 'en'`; gzip of the seeded response ≤ 80 KB (`zlib.gzipSync`).
- [ ] **Step 2: Run** `pnpm test:integration -t "search index"` — FAIL.
- [ ] **Step 3: Implement** `loadSearchSource`: display fields from one `loadCatalog(db, locale, mediaOrigin)` call (smallest rendition for `thumb`); multilingual texts from one query on `trips`/`collections`/`trip_items` (type `highlight`) raw jsonb plus one query on `content_translations` filtered to `entity in ('trip','collection','trip_item')`, `field in ('title','name','short_name','text')`, `locale in liveLocales`; keep a row only if its `source_hash` matches the current EN (reuse the existing hash helper used by `resolveText`). Route: same query validation as `/v1/public/locales` plus `locale`, `Cache-Control: public, max-age=60`.
- [ ] **Step 4: Run** — PASS; then `pnpm --filter @stella/api typecheck`.
- [ ] **Step 5: Commit** `feat(api): public multilingual search index`

---

### Task 5: Web proxy route and client index loader

**Files:**
- Create: `apps/web/src/app/api/search-index/route.ts`, `apps/web/src/lib/search-client.ts`
- Modify: `apps/web/src/lib/api.ts` (`getSearchIndex`)
- Test: `apps/web/src/lib/search-client.test.ts`

**Interfaces:**
- Consumes: `searchIndexSchema`, `createSearch` (Task 1).
- Produces:
  - `getSearchIndex(locale: string, reader: Reader)` in `api.ts` via `read('search-index?locale=…', searchIndexSchema, ['site','collections','locales'], reader)`.
  - Route `GET /api/search-index?locale=xx`: same validation and error mapping as `app/api/trips/route.ts` (`limitCaller`, 400/429/503), response header `Cache-Control: public, max-age=60, stale-while-revalidate=600`.
  - `loadSearch(locale: string): Promise<(q: string) => SearchEntry[]>` — memoized per locale for the session; a failed load clears the memo so Retry refetches; validates with `searchIndexSchema`.

- [ ] **Step 1: Failing tests** (mock `fetch`): second call reuses the first promise; rejected fetch → next call fetches again; invalid JSON shape rejects.
- [ ] **Step 2: Run** `pnpm vitest run apps/web/src/lib/search-client.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(web): search index proxy and client loader`

---

### Task 6: Search button and panel (UI + 7 languages)

**Files:**
- Create: `apps/web/src/components/search-panel.tsx`, `apps/web/src/components/search-panel.css`
- Modify: `apps/web/src/components/shell.tsx` (button in `.nav-tools` before `<details className="languages">`), `apps/web/messages/{en,it,es,fr,de,ru,tr}.json`, `packages/shared/src/analytics.ts` (events)
- Test: `apps/web/src/components/search-panel.test.tsx` (if the web package has a DOM test setup; otherwise cover in Task 8 e2e), `tests/e2e/search.spec.ts`

**Interfaces:**
- Consumes: `loadSearch` (Task 5); `site.featured_trips`, `collections` already available in `shell.tsx`.
- Produces: `<SearchButton />` (renders the icon button and lazily mounts `<SearchPanel>`); analytics events `search_open`, `search_select` `{ type, slug, position }`, `search_no_results` — added to the analytics allow-list with no free-text property.

Messages (all 7 files, authored): `search` ("Search trips"), `searchPlaceholder` ("Search trips, places, activities"), `searchClear` ("Clear search"), `searchClose` ("Close search"), `searchSuggested` ("Suggested"), `searchCollections` ("Collections"), `searchResults` (ICU plural: "{count, plural, =0 {No results} one {# result} other {# results}}"), `searchNoResults` ("No trip matches “{query}”"), `searchAskWhatsapp` ("Ask us on WhatsApp"), `searchLoadFailed` ("Search couldn't load."). Reuse existing `retry`, `onRequest`, `from`.

Behavior (spec §5.5, sketch there):
- Button: lucide `Search`, 44×44, `aria-label={t('search')}`, `aria-haspopup="dialog"`, prefetch `loadSearch(locale)` on `pointerdown`/`focus`; visible on every public page including over the hero.
- Panel: native `<dialog>` opened with `showModal()`; full screen < 1024px, centered max-inline-size 640px ≥ 1024px. Opening pushes a history entry (`history.pushState({ search: true }, '')`); `popstate` closes; Esc and the back arrow close via `history.back()`. Focus returns to the button. Body scroll locked while open. Fade/slide 200ms, none under reduced motion.
- Input: `type="search"`, `enterkeyhint="search"`, autofocus, `maxLength={100}`, clear button. Combobox: input `role="combobox"`, `aria-expanded`, `aria-controls` = listbox id, `aria-activedescendant`; ↑/↓ wrap; Enter opens active option; options are `<Link>`s with `role="option"`. Polite live region announces `searchResults`.
- Empty query: collection chips (links `/{locale}/c/{slug}`) + suggested list from `site.featured_trips` (rendered from page data, so it works before the index loads).
- Results: thumbnail 56px, title (`lang` when `title.lang !== locale`), `collection_name · duration · from €X | onRequest`. Use the existing price formatting helper used by `TripCard` (no new price code).
- Select: close panel, then `router.push` to `/{locale}/t/{slug}` (trip/package → intercepted overlay) or `/{locale}/c/{slug}`.
- Loading: 3 skeleton rows; typing before load keeps the query and runs it when the index resolves. Error: `searchLoadFailed` + Retry button.
- No results: `searchNoResults` + WhatsApp button (existing `wa` URL, unchanged — no query text) + suggested list; fire `search_no_results` once per distinct empty state, debounced 800ms.

- [ ] **Step 1: Failing e2e** `tests/e2e/search.spec.ts` at 390×844: open via button → suggested list visible; type `tiren` → first option is Tiran; ↓ + Enter opens the trip overlay; Back closes overlay; reopen, Esc closes, focus on button; `xqzt` → no-results + WhatsApp link with no `xqzt` in its href; axe has no violations with the panel open; repeat open/select in `ru` and `ar` (dir=rtl) and at 1440.
- [ ] **Step 2: Run** `pnpm test:e2e tests/e2e/search.spec.ts` — FAIL.
- [ ] **Step 3: Implement** component, CSS (logical properties only), messages ×7, shell wiring, analytics events.
- [ ] **Step 4: Run** the e2e — PASS; `pnpm lint && pnpm typecheck`; messages key-parity test passes (`packages/shared/src/messages.test.ts`).
- [ ] **Step 5: Commit** `feat(web): header search with suggestions`

---

### Task 7: Admin "Search keywords" editor

**Files:**
- Modify: `apps/admin/src/screens/trip-editor.tsx` (inside the existing SEO / "Search appearance" section), `apps/admin/src/screens/packages.tsx` (same section), `apps/admin/src/screens/collections.tsx`, `apps/admin/src/lib/diff.ts` (`searchKeywords` label), `apps/admin/messages/*.json` ×7 (and `data/i18n/admin-ui.json` if admin strings are generated from it via `pnpm admin:messages`)
- Test: `tests/admin/editor.spec.ts` (new case)

**Interfaces:**
- Consumes: `searchKeywordsSchema` in `seoSchema`/`collectionEditSchema` (Task 3); existing PATCH `/v1/admin/trips/:id/seo` and `/v1/admin/collections/:id`.
- Produces: `<KeywordChips value: string[]; onChange; label; lang />` local to the admin (Enter/comma adds, × removes, Backspace on empty removes last, enforces the 30/60 limits with the existing field-error UI).

Admin strings ×7: `searchKeywords` ("Search keywords"), `searchKeywordsHelp` ("Words visitors might type to find this. Not shown on the site."), `searchKeywordsOther` ("Other languages & spellings"), `searchKeywordAdd` ("Add keyword").

- [ ] **Step 1: Failing admin e2e:** open a trip, add `snorkel` under IT and `سنوركل` under Other, save, reload → chips persist; 31st keyword shows the limit error and save is blocked; editor-role save on a published trip creates a draft (existing draft banner).
- [ ] **Step 2: Run** `pnpm test:e2e:admin -g "search keywords"` — FAIL.
- [ ] **Step 3: Implement** (one chip input per core locale + Other; RTL `dir="auto"` on chips).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(admin): edit search keywords for trips and collections`

---

### Task 8: Verification, docs, changelog

**Files:**
- Modify: `docs/01-frontend-plan.md` (search section, ticked), `docs/02-backend-database-plan.md` (column + endpoint), `docs/05-admin-dashboard-plan.md` (keywords), `CHANGELOG.md`

- [ ] **Step 1:** `pnpm test && pnpm lint && pnpm typecheck && pnpm test:integration && pnpm test:e2e` — all PASS.
- [ ] **Step 2:** `pnpm verify:performance` (Lighthouse mobile home ≥ 90 perf / 100 a11y; the search chunk must not be in the initial home bundle — confirm in the Next build output that `search-panel` is a separate chunk).
- [ ] **Step 3:** Manual pass at 390/768/1440 in all 7 core locales + `ar`: open, suggestions, one typo query, one other-language query, select, back. No console errors.
- [ ] **Step 4:** Update the three docs and `CHANGELOG.md`.
- [ ] **Step 5: Commit** `docs: trip search`
