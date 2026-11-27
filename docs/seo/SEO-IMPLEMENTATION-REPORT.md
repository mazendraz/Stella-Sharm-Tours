# SEO implementation report

Branch `feat/seo-foundation`, based on `origin/main` (`a3d6fdb`).
**Database changes: none. API contract changes: none. Not deployed.**

## Status by phase

| Phase                        | Status      | Summary                                                                                         |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| 1 Audit and baseline         | Completed   | `SEO-AUDIT.md`; crawl baseline 627 errors                                                       |
| 2 Intent and competitors     | Partial     | 3 live searches; no volume/rank/backlink tools (`COMPETITOR-ANALYSIS.md`, `KEYWORD-MAPPING.md`) |
| 3 Critical technical fixes   | Completed   | metadata in `<head>` for all agents; titles/descriptions; OG                                    |
| 4 International              | Completed   | localized SEO strings ×7; hreflang/canonicals verified                                          |
| 5 Structured data            | Completed   | connected `@graph` with stable ids                                                              |
| 6 AEO / GEO                  | Partial     | crawlability, entity, llms.txt done; answers need owner facts                                   |
| 7 Tour pages and content     | Blocked     | 0/38 descriptions, FAQ 1 entry, legal pending — owner content                                   |
| 8 Admin SEO module           | Proposed    | design below; trip SEO overrides already exist                                                  |
| 9 Performance and conversion | Not started | LCP 3.62 s (fixture) still open; no new measurement possible                                    |
| 10 Automated testing         | Completed   | crawl check + e2e gate in CI + unit tests                                                       |
| 11 Docs and readiness        | Completed   | this folder; ready for review, not deployed                                                     |

## Commits

1. `fix(web): Render page metadata in <head> for every crawler`
2. `feat(web): Localized SEO metadata and a connected JSON-LD graph`
3. `feat(web): Sitemap images, explicit AI-training switch and llms.txt`
4. `test(seo): Crawl-based SEO regression check in the e2e suite`
5. `docs(seo): ...` (this documentation)

## Files

| File                                                             | Change                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.mjs`                                       | `htmlLimitedBots: /.*/`                                                                              |
| `apps/web/src/lib/seo.tsx`                                       | OG site name/type/locales/alternates, title length rule, description clip, robots preview directives |
| `apps/web/src/lib/structured-data.ts` (+ test)                   | new JSON-LD builders                                                                                 |
| `apps/web/src/app/[locale]/layout.tsx`                           | organization + website graph on every page                                                           |
| `apps/web/src/app/[locale]/page.tsx`                             | localized title/description, WebPage node                                                            |
| `apps/web/src/app/[locale]/t/[slug]/page.tsx`                    | WebPage + TouristTrip + breadcrumb graph                                                             |
| `apps/web/src/app/[locale]/c/[slug]/page.tsx`                    | localized title pattern, CollectionPage + ItemList + breadcrumb                                      |
| `apps/web/src/app/[locale]/faq/page.tsx`                         | description, FAQPage                                                                                 |
| `apps/web/src/app/[locale]/contact/page.tsx`                     | description, ContactPage                                                                             |
| `apps/web/src/app/robots.ts`                                     | explicit groups, `AI_TRAINING_CRAWLERS` switch                                                       |
| `apps/web/src/app/sitemap.xml/route.ts`                          | image extension                                                                                      |
| `apps/web/src/app/llms.txt/route.ts`                             | new optional route                                                                                   |
| `apps/web/src/middleware.ts`                                     | exclude `/llms.txt` from locale routing                                                              |
| `apps/web/messages/{en,it,es,fr,de,ru,tr}.json`                  | 5 new `seo*` keys each                                                                               |
| `apps/web/.env.example`                                          | documents `AI_TRAINING_CRAWLERS`                                                                     |
| `scripts/seo-check.mjs`, `tests/e2e/seo.spec.ts`, `package.json` | QA tooling (`pnpm seo:check`)                                                                        |

## Admin SEO module — proposed design (not built)

What exists: trip and package editors have SEO title/description overrides
and search keywords per language. What is missing, in order of value:

1. **SEO health list** (Admin → Website → Search health): per page and
   language, show title and description length, duplicates, missing
   description, missing cover/alt, price "on request", missing exclusions /
   what-to-bring. Computed from the same data as the site; shown as
   diagnostics, never as a "ranking score". Read-only; editors jump to the
   field to fix it.
2. **SEO preview** in the trip editor: the result snippet as it will render
   (title with the brand rule, clipped description) for the selected language.
3. **Collection SEO overrides** (title/description per language) — needs a
   migration adding two nullable `localized` columns to `collections`.
4. **Redirects** table (`from_path`, `to_path`, `status 301/308`, author,
   date) applied in middleware, for future slug changes; owner/admin role only,
   audit-logged, loop detection on save.
5. **`lastmod`**: add `updated_at` to the public trip/collection contract and
   the sitemap.

Each is a separate PR with tests, RBAC (owner/editor) and strings in all
seven languages, per `AGENTS.md`.

## Prioritized next steps

1. Review and merge this branch; deploy; run `pnpm seo:check` on production;
   submit the sitemap in Search Console and Bing (E2, E3).
2. Owner: legal pages, FAQ answers, per-trip exclusions/bring/pickup facts,
   guide languages (D2, business information list).
3. Fix `www` (E1).
4. Distinct SEO titles/descriptions for all 38 trips (Cairo trips first).
5. Mobile LCP work with real measurements.
6. Admin SEO health list (item 1 above).
7. Google Business Profile and review routine.
8. First guides (Ras Mohammed, Cairo from Sharm, group vs private).
