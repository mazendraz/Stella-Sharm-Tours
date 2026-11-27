# Technical SEO report

## 1. Metadata streamed into `<body>` (P1-1, fixed)

Next.js 15 streams metadata after `</head>` unless the user agent matches its
`HTML_LIMITED_BOT_UA_RE` list (Google special crawlers, Bingbot, Applebot,
social previewers…). AI search crawlers are not on that list.

Measured on production `/it`, 2026-11-27 (byte offset in the HTML):

| User agent                     | `</head>` ends | `<title>` at | canonical at |
| ------------------------------ | -------------: | -----------: | -----------: |
| generic (`StellaSeoCheck/1.0`) |          3 528 |       64 590 |       64 674 |
| `OAI-SearchBot/1.0`            |          3 528 |       64 590 |       64 674 |
| `PerplexityBot/1.0`            |          3 528 |       64 590 |       64 674 |
| `Bingbot/2.0`                  |          4 720 |        3 409 |        3 493 |

Fix: `htmlLimitedBots: /.*/` in `apps/web/next.config.mjs`. Every response now
carries metadata in `<head>`. Pages have no `loading.tsx` boundary and already
await the same React-cached API data for their body, so the head is not
delayed by extra work. Regression test: `tests/e2e/seo.spec.ts` ("metadata is
in `<head>` for AI search crawlers too").

## 2. Titles and descriptions

| Page           | Title pattern                                                    | Description source              |
| -------------- | ---------------------------------------------------------------- | ------------------------------- |
| Home           | `seoHomeTitle` (7 languages)                                     | `seoHomeDescription`            |
| Collection     | `seoCollectionTitle` → "{name}: excursions from Sharm El Sheikh" | collection subline → headline   |
| Trip / package | admin SEO title → trip title                                     | admin SEO description → summary |
| FAQ            | "Questions & answers"                                            | `seoFaqDescription`             |
| Contact        | "Contact"                                                        | `seoContactDescription`         |
| Legal          | page title (only when approved)                                  | —                               |

Rules in `apps/web/src/lib/seo.tsx`:

- ` | Stella Sharm Tours` is appended only when the result stays ≤ 65
  characters; Google shows the site name separately.
- Descriptions are whitespace-normalized and clipped at 170 characters on a
  word boundary.
- `robots`: `index, follow, max-image-preview:large, max-snippet:-1,
max-video-preview:-1` for indexable locales; `noindex, follow` otherwise.

## 3. Open Graph

`og:type=website`, `og:site_name`, `og:locale` as `language_TERRITORY`
(`en_GB`, `it_IT`, `es_ES`, `fr_FR`, `de_DE`, `ru_RU`, `tr_TR`, `ar_EG`; other
machine languages use the bare code) and `og:locale:alternate` for the other
indexable languages. Images: trip/collection cover, otherwise `/brand/og.jpg`.

## 4. Crawl and index controls

| Control               | State                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `robots.txt`          | `*` allowed except `/api/`, `/*/request/`, `/*/my-trip`, `/*/preview`; sitemap line. Optional `AI_TRAINING_CRAWLERS=block` adds a separate group for training-only tokens (verified locally).                                                                                                    |
| `sitemap.xml`         | Built from the published API only: home, contact, FAQ, approved legal pages, collections, trips × indexable locales, with `xhtml:link` alternates and (new) `image:image` for covers and up to 4 gallery photos. 503 + `Retry-After` when the API is down, so a partial sitemap is never served. |
| `/llms.txt`           | New, optional. Public catalogue index in English with links; excluded from middleware like robots/sitemap.                                                                                                                                                                                       |
| Admin / API / staging | `X-Robots-Tag: noindex` (Caddy and app). Preview route: `noindex, nofollow, noarchive`, `private, no-store`.                                                                                                                                                                                     |
| Status codes          | Unknown locale and unknown trip → 404; root → 307 to a locale; `http` → 308.                                                                                                                                                                                                                     |
| Parameters            | `?format=private` renders the private view; canonical stays the clean URL.                                                                                                                                                                                                                       |

## 5. Not changed, recommended

- **`www` host** — add DNS and a Caddy redirect (`EXTERNAL-ACTIONS-REQUIRED.md`).
- **`lastmod`** — expose `updated_at` on public trips/collections and emit it
  in the sitemap. Proposed because it changes the public API contract.
- **Visible breadcrumbs** on trip pages to match the JSON-LD trail.
- **IndexNow** for Bing/Yandex on publish — a worker job calling
  `api.indexnow.org` with a key file; needs an owner decision and key.
  Do not use Google's Indexing API (it is only for job postings and
  livestreams).

## 6. Performance (Core Web Vitals)

No new measurement was possible today (PageSpeed Insights quota exhausted;
no CrUX access). The latest recorded lab numbers are on the loopback fixture
(`docs/frontend-verification.md`): mobile `/en` Performance 90, LCP 3.62 s,
CLS 0.00086, TBT 40.5 ms; mobile trip page LCP 2.86 s; desktop `/en` LCP
1.24 s. The mobile LCP budget (≤ 2.5 s) is still open. This branch does not
change rendering cost, images or scripts, so no performance change is
claimed. Next step: run `scripts/verify-performance.mjs` on the Linux build
and PageSpeed Insights (with an API key) on production, then work the LCP
hero poster and font preload issues recorded in that document.
