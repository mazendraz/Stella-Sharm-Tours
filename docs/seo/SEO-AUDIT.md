# SEO audit — baseline (2026-11-27)

Scope: the public website `https://stellasharmtours.com` (7 indexable languages:
EN/IT/ES/FR/DE/RU/TR), the code on `origin/main` at `a3d6fdb`, and the public
catalogue API. Admin, API and staging hosts were reviewed for indexing
controls only.

## How the baseline was measured

| Source                                                           | What                                                                                        | When                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| `curl` against production                                        | status codes, redirects, robots.txt, sitemap.xml, head tags, JSON-LD                        | 2026-11-27                      |
| `node scripts/seo-check.mjs --base https://stellasharmtours.com` | full crawl of all 336 sitemap URLs and 364 internal links                                   | 2026-11-27                      |
| Public API `/v1/public/trips/{slug}?locale=en`                   | content completeness of all 38 published trips                                              | 2026-11-27                      |
| `docs/frontend-verification.md`                                  | Lighthouse 13.6 on the loopback fixture (not production)                                    | recorded earlier in the project |
| PageSpeed Insights API                                           | **not available** — the keyless daily quota was exhausted; no PSI/CrUX numbers are reported | 2026-11-27                      |

Raw crawler result on production: **627 errors, 191 warnings**
(after this branch, on the fixture build: **0 errors**; see `SEO-QA-REPORT.md`).

## What already works

- HTTPS everywhere; `http://` → `https://` is a 308. Unknown pages and unknown
  trips return a real 404 with a localized page (no soft 404s).
- `/` redirects (307) by saved choice or `Accept-Language`; crawlers always get
  `/en`. Every language URL is reachable directly; no forced geo redirects.
- 7 locales × 48 paths = 336 sitemap URLs, each with reciprocal `hreflang`
  for all 7 languages plus `x-default`. Language-specific self canonicals;
  Italian is never canonicalized to English.
- `<html lang>` matches the URL locale; `dir` supports RTL.
- Trip pages are server-rendered: title, facts, itinerary, inclusions and
  prices are in the initial HTML and work without JavaScript (covered by the
  e2e test "trip content and WhatsApp work without JavaScript").
- Private routes are protected: `/api/`, `/*/request/`, `/*/my-trip`,
  `/*/preview` are disallowed and/or `noindex`; admin, API and staging send
  `X-Robots-Tag: noindex`. Drafts never enter the sitemap (it is built from
  the published API). Legal pages are left out of the sitemap until approved.
- 0 broken internal links; every `<img>` has `alt`; no `?format=private`
  duplicate is indexable (canonical points to the clean URL).

## Issues by severity

Status: **Fixed** (on branch `feat/seo-foundation`), **Partial**, **Blocked**
(needs owner input or external access), **Proposed**.

### P1 — high

| #    | Issue                                                                                                                                                                                                                                                                                  | Evidence                                                                               | Status                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P1-1 | `<title>`, canonical, hreflang and robots were streamed into `<body>` for user agents outside Next.js's built-in bot list. OAI-SearchBot and PerplexityBot received them ~64 KB into `<body>` on `/it`; Bingbot got them in `<head>`. Google ignores `rel=canonical` outside `<head>`. | crawl: 63/336 pages for a generic UA; per-UA byte offsets in `TECHNICAL-SEO-REPORT.md` | Fixed                                                       |
| P1-2 | Home page title was the brand only (`Stella Sharm Tours`) with **no meta description**, in all 7 languages. FAQ and contact also lacked descriptions.                                                                                                                                  | 72 pages without description                                                           | Fixed                                                       |
| P1-3 | Thin tour pages. Of 38 trips: **0** have a long description, **0** have SEO title/description overrides, **0** list "what to bring", 6 list exclusions, 3 have notes, 36 summaries are under 80 characters; 31 have a price set. Meta descriptions are the `·`-separated highlights.   | API completeness scan                                                                  | Blocked — needs verified operational content from the owner |
| P1-4 | The FAQ has **one** question ("Is my booking confirmed when I submit a request?"). Common traveller questions (pickup, payment, cancellation, children, what to bring) are unanswered.                                                                                                 | live `/en/faq`                                                                         | Blocked — answers need owner verification                   |
| P1-5 | Terms, privacy and cancellation pages show "content pending" (`noindex`) while linked from the footer. Missing cancellation/refund terms hurts trust and conversion. Legal entity is still "to confirm" in `docs/DECISIONS.md`.                                                        | live `/en/legal/*`                                                                     | Blocked — legal content                                     |
| P1-6 | Mobile LCP over budget: 3.62 s on `/en` (fixture Lighthouse, simulated throttling).                                                                                                                                                                                                    | `docs/frontend-verification.md`                                                        | Open — not changed here                                     |

### P2 — medium

| #    | Issue                                                                                                                                                                                                                                            | Status                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| P2-1 | Structured data was minimal and partly invalid: `inLanguage` on `TravelAgency`/`TouristTrip` (not a property of either), `itinerary` as plain strings, no `@id`s, no address/geo/logo/`sameAs`, no breadcrumbs on trips, nothing on FAQ/contact. | Fixed                                                                                                                   |
| P2-2 | `www.stellasharmtours.com` does not resolve (connection fails). Visitors and links that use `www` are lost.                                                                                                                                      | Blocked — DNS + Caddy, see `EXTERNAL-ACTIONS-REQUIRED.md`                                                               |
| P2-3 | 31 trip titles were over 70 characters with the brand suffix (e.g. ES/FR/RU Nabq titles 78–89).                                                                                                                                                  | Partial — brand suffix now dropped when a title would exceed 65 characters; short SEO titles per trip are an admin task |
| P2-4 | Duplicate meta descriptions in every language: `cairo-bus-gem`, `cairo-plane-1-day` and `cairo-bus-2-days` share the same summary.                                                                                                               | Blocked — set distinct SEO descriptions in the admin                                                                    |
| P2-5 | `og:locale` was `en`/`it` (Open Graph expects `en_GB`/`it_IT`); no `og:site_name`, no `og:type`, no alternate locales.                                                                                                                           | Fixed                                                                                                                   |
| P2-6 | Sitemap had no image entries and no `lastmod`.                                                                                                                                                                                                   | Partial — images added; `lastmod` needs `updated_at` in the public API (proposed)                                       |
| P2-7 | No admin view of SEO health (missing/duplicate titles and descriptions). Trip/package SEO overrides exist but are unused.                                                                                                                        | Proposed — see `SEO-IMPLEMENTATION-REPORT.md` §Admin                                                                    |

### P3 — enhancement

| #    | Issue                                                                                                          | Status                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| P3-1 | AI-training permission was implicit (`User-agent: *` allows everything, including GPTBot and Google-Extended). | Fixed as an explicit, documented switch; decision is the owner's |
| P3-2 | No `/llms.txt`. Optional and experimental; not a ranking factor.                                               | Added, built from published data only                            |
| P3-3 | No visible breadcrumbs on trip pages (JSON-LD only).                                                           | Proposed                                                         |
| P3-4 | No About page with verified company facts.                                                                     | Blocked — needs genuine company information                      |

## Not verified (no access)

Google Search Console, Bing Webmaster Tools, Google Business Profile, CDN/WAF
rules beyond the repository's Caddy config, real-user Core Web Vitals (CrUX),
backlink data and keyword volumes. Nothing in these reports is inferred for
them.
