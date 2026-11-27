# SEO QA report

## Automated checks added

| Check                                                                                                                                                                                                                                                                                               | Where                                                                                     | Runs                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Crawl check: robots, sitemap, every sitemap URL (status, noindex, lang, title, description, canonical, hreflang reciprocity + x-default, sitemap/page hreflang match, JSON-LD parse, review markup, img alt, h1 count, og:image), duplicates per language, internal links, private routes, soft 404 | `scripts/seo-check.mjs` (`pnpm seo:check --base URL [--origin URL] [--limit N] [--json]`) | any environment; read-only GETs, 4 at a time                                   |
| Same crawl must report 0 errors                                                                                                                                                                                                                                                                     | `tests/e2e/seo.spec.ts`                                                                   | CI "Isolated frontend browser suite" (fixture API + built web), mobile project |
| Head metadata for OAI-SearchBot, PerplexityBot and a phone browser                                                                                                                                                                                                                                  | `tests/e2e/seo.spec.ts`                                                                   | CI                                                                             |
| Trip graph: provider @id, ItemList itinerary, EUR offers, 3-level breadcrumb, no review markup                                                                                                                                                                                                      | `tests/e2e/seo.spec.ts`                                                                   | CI                                                                             |
| Localized home title/description, `og:locale`, robots private paths, llms.txt                                                                                                                                                                                                                       | `tests/e2e/seo.spec.ts`                                                                   | CI                                                                             |
| Structured-data builders (8 cases)                                                                                                                                                                                                                                                                  | `apps/web/src/lib/structured-data.test.ts`                                                | `pnpm test`                                                                    |
| Message key parity across 7 languages (existing)                                                                                                                                                                                                                                                    | `packages/shared/src/messages.test.ts`                                                    | `pnpm test`                                                                    |

Errors fail the run; warnings (long titles, duplicate descriptions, missing
description) are reported for content owners and do not fail CI.

## Results (2026-11-27)

| Run                                                   | Target                                   | Result                                                                                                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline crawl                                        | production, 336 URLs, 364 links          | **627 errors**, 191 warnings (metadata in `<body>` on 63 pages and its cascade; hreflang not reciprocated as a result; 72 missing descriptions; 31 long titles; duplicate Cairo descriptions) |
| Crawl after changes                                   | local fixture build, 336 URLs, 412 links | **0 errors**, 70 warnings before the title-length rule; the remaining warnings are long trip titles and the duplicate Cairo descriptions (content)                                            |
| `tests/e2e/seo.spec.ts`                               | local fixture                            | 4 passed                                                                                                                                                                                      |
| Existing e2e: `routes`, `frontend`, `search` (mobile) | local fixture, Chrome                    | 25 passed                                                                                                                                                                                     |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`    | repo                                     | pass                                                                                                                                                                                          |
| `pnpm test`                                           | repo                                     | 28 files, 469 tests passed                                                                                                                                                                    |
| `AI_TRAINING_CRAWLERS=block`                          | local                                    | robots.txt shows a separate disallow group for the six training tokens; `*` group unchanged                                                                                                   |

The fixture is a read-only copy of the catalogue (`tests/fixtures`), not the
production database; production gets the same code path. Re-run the crawl
against staging and production after deploy:

```
pnpm seo:check --base https://stellasharmtours.com
```

Not run here: integration suite against Postgres, Lighthouse, Rich Results
Test, real devices.
