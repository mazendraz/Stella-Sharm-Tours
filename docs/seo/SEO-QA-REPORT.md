# SEO QA report

Updated 2026-11-28 (phase 2). Zero automated errors means the pages are
technically correct; it says nothing about rankings.

## Automated checks

| Check                                                                                                                                                                                                                                                                                        | Where                                                                | Runs                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| Full crawl: robots, sitemap, every sitemap URL (status, noindex, lang, title, description, canonical, hreflang reciprocity + x-default, sitemap/page hreflang match, JSON-LD parse, review markup, img alt, h1, og:image), duplicates per language, internal links, private routes, soft 404 | `scripts/seo-check.mjs` (`pnpm seo:check --base URL [--origin URL]`) | any environment, read-only |
| Same crawl must report 0 errors; head metadata for AI crawlers; trip graph; localized home metadata, robots, llms.txt                                                                                                                                                                        | `tests/e2e/seo.spec.ts`                                              | CI frontend suite          |
| Robots policy: defaults, training-only block, Google-Extended switch, Googlebot/Bingbot never named                                                                                                                                                                                          | `apps/web/src/lib/robots-policy.test.ts` (4)                         | `pnpm test`                |
| Automatic trip titles/descriptions: facts only, Italian phrasing, no price when on request, non-time departures ignored, length limits ×7 languages, lead price                                                                                                                              | `packages/shared/src/seo-defaults.test.ts` (7)                       | `pnpm test`                |
| SEO health (missing facts, per-language translations, duplicates only among published, overrides) and live page parser (metadata in body, hreflang, robots groups)                                                                                                                           | `packages/shared/src/seo-health.test.ts` (7)                         | `pnpm test`                |
| Admin SEO API: RBAC (sales refused), 38 trips, Italian title, description ≤ 158, unknown slug 404, invalid language 422                                                                                                                                                                      | `apps/api/src/backend.integration.test.ts`                           | `pnpm test:integration`    |
| Admin dictionaries: every SEO key in all seven languages                                                                                                                                                                                                                                     | `apps/admin/src/lib/messages.test.ts`                                | `pnpm test`                |
| Structured-data builders (8)                                                                                                                                                                                                                                                                 | `apps/web/src/lib/structured-data.test.ts`                           | `pnpm test`                |

## Results (2026-11-28, branch head)

| Run                                                                                      | Target                                       | Result                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                                       | repo                                         | pass                                                                                                                                                                                                                                                                                                           |
| `pnpm test`                                                                              | repo                                         | 31 files, **487 passed**                                                                                                                                                                                                                                                                                       |
| Integration suite (`vitest.integration.config.ts`, disposable Postgres 16 container)     | API + DB                                     | **71 passed** (70 in the full run; the HEIC test first failed because its local sample file was missing from the worktree, then passed once copied)                                                                                                                                                            |
| e2e mobile (`routes`, `frontend` incl. axe + no-JS, `search`, `seo`)                     | production build + fixture API               | **29 passed** (the 4 SEO tests first failed only because the test run's `NEXT_PUBLIC_SITE_URL` differed from the build's; passed with matching values)                                                                                                                                                         |
| e2e tablet (768) + desktop (1440)                                                        | same                                         | **50 passed**, 8 skipped (SEO crawl runs once, on mobile)                                                                                                                                                                                                                                                      |
| SEO crawl, production build                                                              | 336 URLs, 412 links                          | **0 errors, 1 warning** (`fr/t/water-activities` title 74 chars). Phase 1 build: 0 errors, 70 warnings — the automatic trip metadata removed the duplicate Cairo descriptions and most long titles                                                                                                             |
| Admin SEO screen, 390 px, real API + seeded DB (disposable database, dropped afterwards) | overview, tour list, tour detail, live check | renders; axe **0 violations** after making `<summary>` 44 px; no console errors except the expected 401 before login                                                                                                                                                                                           |
| Admin live check against **production** (current live code)                              | robots, sitemap, 101 EN/IT pages             | robots: all crawlers allowed, private paths blocked; sitemap 336 URLs, 0 published trips missing, 0 unpublished listed/reachable, 0 broken links, 0 orphans. Page problems on production today: title/tags outside `<head>` 101, no description 11, structured data missing 4 — exactly what this branch fixes |
| `caddy adapt` with production host names                                                 | `infra/Caddyfile`                            | valid; `www.stellasharmtours.com` → 308 `https://stellasharmtours.com{uri}`                                                                                                                                                                                                                                    |
| Lighthouse 13, mobile, median of 3 (lab)                                                 | `/en`, `/en/c/sea`, 2 trips                  | Perf 90–93, A11y 100 (collection 98 → 100 after the heading fix), SEO 100, CLS ≤ 0.002, **LCP 3.2–3.6 s (target 2.5 s not met)**. Details in `TECHNICAL-SEO-REPORT.md` §6                                                                                                                                      |

## Not run, and why

- **Rich Results Test / validator.schema.org** — needs a public URL; run after
  deploy (one URL per page type).
- **PageSpeed Insights / CrUX field data** — no API key; keyless quota was
  exhausted.
- **Admin Playwright suites** (`tests/admin`) — they write test users into the
  developer's own dev database (`stella_dev`), which belongs to the Google
  Reviews checkout; not run to avoid touching it. The SEO screen was checked
  against a separate disposable database instead.
- **Real devices** — not available.
- **Booking regression** — covered by the existing e2e `frontend` suite
  (request sheet, WhatsApp, no-JS) and integration tests (validation, price
  calculation), all passing; no production request was sent.

## Re-run after deploy

```
pnpm seo:check --base https://stellasharmtours.com
```

and Admin → Search (SEO) → **Run check**.
