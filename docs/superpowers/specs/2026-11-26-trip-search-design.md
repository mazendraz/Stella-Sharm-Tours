# Trip search — design

Status: draft for owner approval · 2026-11-26

## 1. Intent

Visitors (mostly on phones, often on weak hotel Wi-Fi) have no way to find a
specific trip except browsing collections. The owner wants a search button in
the header that opens a search panel with trip suggestions, and that finds the
trip the visitor means **whatever language they type in**, including typos.
The owner's bar is "a search with no mistakes": a visitor who types a
reasonable query for a trip we sell must get that trip at the top.

## 2. Goals, non-goals, anti-goals

Goals

- Search icon in the header on every public page (mobile and desktop).
- Opening it shows, before typing: collection chips and suggested trips
  (the admin's featured trips, in the admin's order).
- While typing: results update on every keystroke, instantly, with no network
  round trip per keystroke.
- A query in any core language (EN/IT/ES/FR/DE/RU/TR), any enabled auto
  language (e.g. AR, PL, NL), or a mix, finds the trip regardless of the
  site language the visitor is on.
- Tolerates typos, missing accents, letter case, and Arabic spelling variants.
- Finds trips by what people call them, not only by their titles
  ("snorkeling", "dolphins", "quad", "سنوركل") via per-trip search keywords that
  staff edit in the admin.
- Measurable quality: a golden test set of real queries that CI runs.

Non-goals

- Full-text search of descriptions, FAQ or legal pages.
- Filters (price range, date, duration) inside search.
- Server-side search or a search service.
- Cross-script transliteration beyond what keywords cover (e.g. typing Russian
  words in Latin letters).

Anti-goals (fail even if it "works")

- A price, rating or "popular" badge that does not come from the database.
- Sending a visitor's query text anywhere (analytics, translation provider,
  logs). Queries can contain names or phone numbers.
- Search slowing down page load: the index is not in the initial bundle.
- Showing a draft, hidden or archived trip.
- A result list that a keyboard or screen-reader user cannot operate.

## 3. Constraints (from AGENTS.md and the plans)

- No hosted BaaS / search SaaS; nothing new on the VPS.
- Prices only from the DB; the admin can change them without a deploy.
- Every new UI string in all 7 `messages/*.json`; every new content field
  authored in all 7 core languages in the seed.
- Mobile first at 390×844; WCAG 2.2 AA; 44px targets; `prefers-reduced-motion`;
  CSS logical properties (RTL for `ar`).
- Security plan applies to the new public endpoint (input validation, rate
  limit, no PII).

## 4. Approaches considered

1. **Client-side index (chosen by the owner).** On first open of the search
   panel the browser downloads one compact, cached index of all published
   trips, packages and collections with their searchable text in every live
   language; matching runs in the browser. Instant per keystroke and works on
   weak connections after one small download. Trade-off: the index grows with
   the catalog; at ~40 trips × ~17 languages it is well within budget.
2. **Server-side PostgreSQL search** (`pg_trgm` + `unaccent` over trips and
   `content_translations`, debounced request per keystroke). Scales to large
   catalogs, but every keystroke waits on the network, needs a new
   per-keystroke public endpoint with rate limiting, and loads the client's
   VPS. Rejected: our catalog is tiny and our users are on phones.
3. **Search engine (Meilisearch/Typesense/Algolia).** Rejected: hosted options
   break the no-BaaS rule; self-hosted adds a container for 38 trips.

## 5. Design

### 5.1 Data: search keywords

- New nullable jsonb column `search_keywords` on `trips` (covers packages) and
  `collections`, typed `Partial<Record<CoreLocale, string[]>> & { extra?: string[] }`.
  - Per core locale: words visitors use for this trip in that language
    (activities, places, animals, synonyms, common misspellings).
  - `extra`: language-independent aliases (Arabic and other auto-language
    words, Arabizi like "ras mo7amed", brand names like "Wishwash").
- Keywords are matching aids only: never displayed, never machine-translated,
  never sent to the translation provider.
- Drizzle migration `0014_search_keywords`. Validation: ≤ 30 keywords per
  locale, each 1–60 chars, trimmed, deduplicated case-insensitively.
- Seed: author keywords for every trip and collection in all 7 core languages
  plus `extra` (Arabic at minimum), in `packages/db/src/seed-data.ts`.
  Arabic titles exist only when an auto-translation provider is configured
  (no key → auto locales off), so the Arabic words in `extra` must stand on
  their own: the trip's place names and main activity in Arabic.
- The index builder needs every locale's text at once, while `loadCatalog`
  resolves one locale. Write a dedicated loader that reads the raw localized
  jsonb columns plus `content_translations` rows for enabled auto locales
  (current `source_hash` only), and reuses `loadCatalog(locale)` for the
  display fields.

### 5.2 API: `GET /v1/public/search-index?locale=xx`

- Built from the same `loadCatalog` data as other public endpoints (published,
  non-archived only; respects media rights rules for thumbnails).
- Validation like `/v1/public/locales`: only `locale`, no duplicate keys,
  locale must be live (404 otherwise). Public rate limit as other public routes.
- Response (zod schema in `packages/shared/src/search.ts`, added to
  `tests/contracts/openapi.json`):

```ts
{
  version: string,              // hash of the content, for client caching
  locale: string,               // display locale of `title` etc.
  suggested: string[],          // trip slugs in featured order
  entries: Array<{
    type: 'trip' | 'package' | 'collection',
    slug: string,
    collection: string | null,  // collection slug (trips/packages)
    title: Text,                // in requested locale (resolver + EN fallback w/ lang)
    collection_name: Text | null,
    thumb: Media | null,        // smallest rendition only
    from_price_eur: number | null, // primary price from DB; null → "On request"
    duration: Text | null,
    fields: {                   // normalized search text, every live locale merged
      title: string[],          // titles in all locales (+ collection short name for collections)
      keywords: string[],       // search_keywords, all locales + extra
      places: string[],         // highlight items, all locales
      collection: string[],     // parent collection names, all locales
    }
  }>
}
```

- Field text is normalized on the server with the same shared `normalize()`
  the client uses (5.4), deduplicated across locales, to keep the payload
  small. Budget: ≤ 80 KB gzip for the seeded catalog with 10 auto locales;
  a test asserts the budget.

### 5.3 Web: proxy and caching

- Next route `apps/web/src/app/api/search-index/route.ts` mirrors
  `api/trips/route.ts`: validates `locale`, calls the API with
  `next: { revalidate: 60, tags: ['catalog', 'search'] }`, returns with
  `Cache-Control: public, max-age=60, stale-while-revalidate=600`.
- Revalidation: the existing `catalog` tag already fires on trip/collection/
  price saves, so prices and keywords update without a deploy.
- Client fetches the index on the first `pointerdown`/`focus` of the search
  button (prefetch), keeps it in memory for the session; never in the initial
  JS bundle.

### 5.4 Matching (in `packages/shared/src/search.ts`, pure, unit-tested)

Normalization `normalize(s)`:

- Unicode NFKD, strip combining marks, lower-case (locale-independent).
- `ß→ss`, `ё→е`, Turkish `ı/İ→i`, `æ→ae`, `ø→o`, `œ→oe`.
- Arabic: strip tashkeel and tatweel; `أ إ آ ٱ → ا`; `ة → ه`; `ى → ي`;
  `ؤ → و`; `ئ → ي`; Arabic-Indic and Persian digits → ASCII; strip a leading
  `ال` from tokens of 4+ letters (index and query alike).
- Punctuation and dashes → space; collapse spaces.

Tokenizing: split on spaces; for scripts without spaces (CJK, Thai) also index
character bigrams.

Engine: MiniSearch (MIT, ~7 KB gzip, no deps) with our `normalize` as
`processTerm`, prefix search on, fuzzy by token length (≤ 3 chars: exact;
4–6: 1 edit; ≥ 7: 2 edits), `combineWith: 'AND'` with a fallback to `'OR'`
when AND returns nothing. Field boosts: `title` 5, `keywords` 3, `places` 2,
`collection` 1. Ties: entries in `suggested` first, then catalog sort order.

Results shown: top 8; collections at most 2 and only when they match on
title/keywords.

If adopting MiniSearch is rejected in review, a ~150-line in-house scorer
(prefix + Damerau-Levenshtein per token with the same thresholds and boosts)
is acceptable; the golden test set is the contract either way.

### 5.5 UI

```
mobile 390                         after typing "piramid"
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ←  [🔍 Search trips, places ✕]│   │ ←  [🔍 piramid           ✕]  │
│                              │   │ ┌──┐ Giza Pyramids by plane  │
│ Collections                  │   │ └──┘ History · 1 day · €129  │
│ (Sea)(History)(Desert)(Priv.)│   │ ┌──┐ Cairo by bus            │
│                              │   │ └──┘ History · 1 day · €55   │
│ Suggested                    │   │ ┌──┐ History & Temples  ›    │
│ ┌──┐ Ras Mohammed by boat    │   │ └──┘ Collection · 9 trips    │
│ └──┘ Sea · 1 day · from €35  │   │                              │
│ ┌──┐ ...                     │   │                              │
└──────────────────────────────┘   └──────────────────────────────┘
```

- Header: icon button (`Search` lucide icon, 44px) in `.nav-tools` before the
  language switcher, `aria-label` = "Search trips". Shown on all public pages,
  including over the home hero.
- Panel: full-screen sheet on mobile, centered dialog (max 640px) at ≥ 1024px.
  Native `<dialog>` with focus trapped, `Esc` and the back button close it
  (pushes a history entry; reuses the overlay/panel history pattern),
  focus returns to the icon. Opens with a short fade/slide; none under
  reduced motion.
- Input: `type="search"`, `enterkeyhint="search"`, autofocus, clear ✕ button.
  ARIA combobox pattern: input `role="combobox"` with `aria-controls` to a
  `role="listbox"`; options are links; ↑/↓ moves `aria-activedescendant`,
  Enter opens; a polite live region announces "N results".
- Empty query: collection chips (links to `/c/<slug>`) + "Suggested" list =
  `suggested` trips.
- Result row: thumbnail, title (site language; `lang` attr when it fell back
  to EN), collection name · duration · "from €X" or "On request". Matched
  substring is not highlighted (matches may come from another language).
- Selecting a trip opens the existing trip overlay (`/t/<slug>`, intercepted
  modal); a collection opens `/c/<slug>`. The panel closes first.
- No results: "No trip matches “…”" + "Ask us on WhatsApp" button (existing
  WhatsApp link, without the query text) + the suggested list.
- Index loading: skeleton rows; if the index fails to load: message with a
  Retry button, collection chips still shown (they come from the page data).
- Analytics: `search_open`, `search_select` {type, slug, position},
  `search_no_results` — **never** the query text.

### 5.6 Admin

- Trip editor and collection editor get a "Search keywords" section: one
  chip-input per core language + "Other languages & spellings" (`extra`).
  Same save/revision/audit path as other trip fields; role as trip editing.
- All new admin strings in the 7 admin message files.

### 5.7 i18n

New web keys in `apps/web/messages/{en,it,es,fr,de,ru,tr}.json`:
`search`, `searchPlaceholder`, `searchClose`, `searchClear`, `suggested`,
`collections`, `searchResults` (ICU plural), `searchNoResults`,
`searchAskWhatsapp`, `searchLoadFailed`, `retry` (reuse if present). Auto
locales receive them through the existing `ui` translation job.

## 6. Quality: the golden set

`packages/shared/src/search.golden.test.ts` builds the index from the seed and
asserts the expected slug is **rank 1** (or within top 3 where stated) for a
table of ≥ 120 queries, including at least, per trip family:

- the title in each of the 7 core languages, lower-case, without accents;
- one typo per query family (`piramds`, `snorkling`, `ras mohamed`, `tiran`
  → `tiran island`);
- Arabic with and without hamza/ta-marbuta/`ال` (`الاهرامات`, `اهرامات`,
  `رأس محمد`, `راس محمد`);
- intent words through keywords (`dolphins`, `quad`, `submarine`, `сафари`,
  `tekne`, `schnorcheln`);
- a query in a language different from the display locale.

Negative cases: nonsense (`xqzt`) returns nothing; a draft trip never appears.
Unit tests also cover `normalize()` per rule and the payload-size budget.
Playwright: open/close, keyboard navigation, select → trip overlay, at 390,
768 and 1440, in `en`, `ru` and `ar` (RTL); axe passes.

## 7. Docs and housekeeping

Update `docs/01-frontend-plan.md` (search section), `docs/02-backend-database-plan.md`
(column + endpoint), `docs/05-admin-dashboard-plan.md` (keywords section),
`CHANGELOG.md`, `tests/contracts/openapi.json`.

## 8. Calls made by Claude (owner may override)

- Suggestions = admin's featured trips (no invented "popular").
- Keywords edited by staff, per core language plus an "other" list; not
  machine-translated.
- Query text is never logged or sent to analytics.
- Search covers trip titles, keywords, highlights and collection names, not
  descriptions (descriptions add noise and false matches).
- MiniSearch as the matching library.
- Top 8 results; collections included but capped at 2.
