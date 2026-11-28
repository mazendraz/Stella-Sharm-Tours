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

## 7. Mobile performance work (2026-11-28, phase 3 completion)

**Method.** Lighthouse 13.6 (repo dev dependency), mobile defaults (simulated
slow 4G, 4× CPU, Moto G-class viewport), headless Chrome, same machine, same
data, nothing else running. Target: a local **production build** of this
branch (`next start`) against an isolated stack — real API, seeded catalogue
(38 trips), media processed by the worker into renditions (the API serves
AVIF/WebP by content negotiation). This is a **new baseline**: the earlier
3.2–3.6 s figures were measured against the fixture API with stock JPEGs and
are not comparable. Median of 3 runs (5 where noted). Lab data only — field
LCP/INP/CLS at p75 can only come from CrUX/Search Console (E2, E8).

| Page                                     | Baseline LCP | After E1 |                    After E1+E2 |    FCP |        TBT |    CLS |     TTFB |
| ---------------------------------------- | -----------: | -------: | -----------------------------: | -----: | ---------: | -----: | -------: |
| `/en` (home)                             |       3.93 s |   3.69 s |     3.69 s (5 runs: 3.42–3.70) | 1.21 s | 67 → 27 ms | 0.0015 | 58–85 ms |
| `/en/c/sea` (collection)                 |       3.19 s |   2.94 s |                         2.94 s | 1.06 s | 19 → 15 ms |      0 | 42–59 ms |
| `/en/t/ras-mohammed-white-island-boat`   |       3.10 s |   3.09 s | **2.64 s** (5 runs: 2.63–2.65) | 1.06 s | 14 → 12 ms | 0.0001 | 26–51 ms |
| `/en/t/quad-bike-safari`                 |            — |        — |                         2.87 s | 1.06 s |      12 ms | 0.0001 |    52 ms |
| `/en/guides/perf-test-guide` (synthetic) |       1.06 s |   1.06 s |                              — | 1.06 s |      15 ms | 0.0006 |    33 ms |

Performance scores after: home 89, collection 95, trips 95–97, guide 100.

**What the traces show.** The LCP element is the hero/cover `<img>` on every
page. Lighthouse's own checks pass: discoverable in the HTML,
`fetchpriority=high`, not lazy. The observed (unthrottled) LCP phases are
small: TTFB 35–70 ms, load delay 13–31 ms, load duration 11–20 ms, render
delay 130–220 ms. The 2.6–3.7 s values come from the **simulated** slow-4G
download of everything that starts before the paint: the HTML (home 43 KB,
including the React Server Components payload), ~19 KB render-blocking CSS
(3 files, estimated saving 170–200 ms), ~150 KB of framework JavaScript and
two preloaded fonts (40 KB). The LCP image itself is already small (home
65 KB AVIF; trip 26 KB).

**Experiments (each built and measured on its own):**

| #   | Change                                                                                                                                              | Result                                                                                                               | Decision     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------ |
| E1  | `trip-story.tsx` loads the story schema (and Zod, a 28 KB chunk) only when a story is opened, instead of in the first bundle of home and collection | home −0.24 s, collection −0.25 s, TBT 67 → 32 ms; trip/guide unchanged; same validation                              | **kept**     |
| E2  | Trip gallery: slides after the first use the existing deferred `Media` mode (load right after hydration, 200 px margin; `<noscript>` fallback)      | trip −0.45 s (3.09 → 2.64 s), CLS unchanged; gallery, swipe and video slides unchanged                               | **kept**     |
| E3  | Do not preload the Marcellus display font                                                                                                           | 3 runs looked better on home (3.22 s) but 5-run recheck = 3.69 s (no change); trip noise ±0.15 s; risk of later swap | **reverted** |
| —   | `experimental.inlineCss` (previous session)                                                                                                         | worse (home 3.78 s), not repeated without new evidence                                                               | not repeated |

**Status against the target (LCP ≤ 2.5 s lab is a proxy only):** not met.
Closest: trip pages 2.64–2.87 s, collection 2.94 s; home 3.4–3.7 s and
bimodal between runs (the simulated graph changes with which requests start
before the observed paint; the hero video request starts at ~0.9 s, after
LCP, so it is not the cause). CLS ≤ 0.1 is met everywhere (≤ 0.0015). INP
cannot be measured in the lab; TBT ≤ 32 ms everywhere.

**Remaining bottleneck and next steps (not done; each needs its own
measurement):** (1) home HTML/RSC payload — pass fewer trip/collection fields
to the client widgets on the home page; (2) the three render-blocking CSS
files — split route-specific CSS rather than inlining everything (inlining was
measured worse); (3) confirm with field data: PageSpeed/CrUX (E8) after
deploy, because Lighthouse's simulation is pessimistic for small pages served
from a nearby VPS. Hero videos, stories, maps, animations, image quality and
booking were not changed.
