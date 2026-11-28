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

| Page           | Title pattern                                                                       | Description source                                                                                        |
| -------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Home           | `seoHomeTitle` (7 languages)                                                        | `seoHomeDescription`                                                                                      |
| Collection     | `seoCollectionTitle` → "{name}: excursions from Sharm El Sheikh"                    | collection subline → headline                                                                             |
| Trip / package | admin SEO title → automatic: trip title + "from/in Sharm El Sheikh" when ≤ 60 chars | admin SEO description → automatic: published highlights, duration, departure time, DB price (≤ 158 chars) |
| FAQ            | "Questions & answers"                                                               | `seoFaqDescription`                                                                                       |
| Contact        | "Contact"                                                                           | `seoContactDescription`                                                                                   |
| Legal          | page title (only when approved)                                                     | —                                                                                                         |

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

| Control               | State                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `robots.txt`          | `*` allowed except `/api/`, `/*/request/`, `/*/my-trip`, `/*/preview`; sitemap line. Named groups for AI search/user fetchers, AI training crawlers and Google-Extended, each with its own switch (`AI_SEARCH_CRAWLERS`, `AI_TRAINING_CRAWLERS`, `GOOGLE_EXTENDED`; default allow). Named groups repeat the private-path rules because a named group overrides `*`. Unit-tested; verified on a production build. |
| `sitemap.xml`         | Built from the published API only: home, contact, FAQ, approved legal pages, collections, trips × indexable locales, with `xhtml:link` alternates and (new) `image:image` for covers and up to 4 gallery photos. 503 + `Retry-After` when the API is down, so a partial sitemap is never served.                                                                                                                 |
| `/llms.txt`           | New, optional. Public catalogue index in English with links; excluded from middleware like robots/sitemap.                                                                                                                                                                                                                                                                                                       |
| Admin / API / staging | `X-Robots-Tag: noindex` (Caddy and app). Preview route: `noindex, nofollow, noarchive`, `private, no-store`.                                                                                                                                                                                                                                                                                                     |
| Status codes          | Unknown locale and unknown trip → 404; root → 307 to a locale; `http` → 308.                                                                                                                                                                                                                                                                                                                                     |
| Parameters            | `?format=private` renders the private view; canonical stays the clean URL.                                                                                                                                                                                                                                                                                                                                       |

## 5. Hosts

- **`www`** (P2-2): DNS already resolves (CNAME of the apex, checked
  2026-11-28); HTTPS failed because Caddy had no site for the name. Fixed in
  `infra/Caddyfile`: `www.{$WEB_HOST}` gets its own certificate and
  308-redirects to `https://{$WEB_HOST}{uri}`. Validated with `caddy adapt`;
  effective after deploy.
- **Recommended, not built:** `lastmod` in the sitemap (needs
  `updated_at` in the public API contract); visible breadcrumbs on trip pages;
  IndexNow (owner decision D4). Never use Google's Indexing API for tours.

## 6. Performance (lab only — no field data)

PageSpeed Insights/CrUX were not available (no API key; keyless quota
exhausted on 2026-11-27). Measurements below are **Lighthouse 13 lab runs**
(mobile, simulated slow 4G, Moto G-class CPU), median of 3, on a production
build of this branch served locally against the test copy of the catalogue
(`tests/fixtures`), 2026-11-28. Images in the fixture are the stock JPGs,
not production's processed variants, so absolute LCP values differ from
production.

| Page                                   | Perf | A11y | SEO |    LCP |    FCP |   TBT |    CLS |
| -------------------------------------- | ---: | ---: | --: | -----: | -----: | ----: | -----: |
| `/en`                                  |   92 |  100 | 100 | 3.32 s | 1.08 s | 98 ms | 0.0015 |
| `/en/c/sea`                            |   90 |   98 | 100 | 3.62 s | 1.06 s | 44 ms |      0 |
| `/en/t/ras-mohammed-white-island-boat` |   92 |  100 | 100 | 3.40 s | 1.06 s | 32 ms | 0.0001 |
| `/it/t/quad-bike-safari`               |   93 |  100 | 100 | 3.24 s | 1.06 s | 31 ms | 0.0003 |

The 98 accessibility score on the collection page was a heading-order skip
(page `h1` straight to the `h3` trip cards). Fixed after this run with a
visually hidden `h2` ("Journeys", existing string in all seven languages);
re-measured in `SEO-QA-REPORT.md`.

**LCP is still above the 2.5 s target on every page.** What the traces show:
the LCP element is the hero/cover image on every page; it is already
discoverable in the HTML, eager, `fetchpriority=high`, and the server
responds in 40–110 ms. The gap between first paint (~1.06 s) and LCP is
simulated download time of the image competing with ~150 KB of JavaScript
chunks, the 25 KB font and (on trip pages) the next gallery slides, which
Chrome fetches early because horizontal scroll containers ignore the lazy
threshold. Three CSS files are render-blocking (~0.35 s estimated).

**Tried and rejected:** `experimental.inlineCss` (inline all CSS to remove
the render-blocking requests). Result: home LCP 3.78 s (worse), other pages
unchanged, HTML 300 KB. Reverted.

**Next experiments (measure each on production with an API key):**

1. Serve the hero poster at the exact mobile size from the media pipeline
   (AVIF/WebP ~480–640 w) and compare LCP.
2. Defer the next gallery slides' `src` until the first swipe, keeping a
   no-JS fallback (`<noscript>` or a link to the gallery).
3. Check the largest client chunks (54 KB and 46 KB) for code that only the
   modal/booking sheet needs, and load it on demand.
4. Confirm CrUX field data once Search Console has enough traffic; the target
   (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75) is judged on field data, not
   on these lab numbers.
