# SEO implementation report

Branch `feat/seo-foundation`, based on `origin/main` (`a3d6fdb`), 14 commits.
**Database migrations: none. Not pushed, not deployed.** Phase 1 on
2026-11-27, phase 2 on 2026-11-28.

## 1. What was implemented

| Area                                                                        | Phase | Status                     | What                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ----- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata in `<head>` for every crawler                                      | 1     | Done                       | `htmlLimitedBots: /.*/`                                                                                                                                                                                                                                    |
| Localized home/collection/FAQ/contact titles and descriptions; OG           | 1     | Done                       | 7 languages                                                                                                                                                                                                                                                |
| Connected JSON-LD graph                                                     | 1     | Done                       | TravelAgency, WebSite, WebPage, TouristTrip, Offer, BreadcrumbList, CollectionPage, FAQPage, ContactPage                                                                                                                                                   |
| Sitemap images, `llms.txt`                                                  | 1     | Done                       |                                                                                                                                                                                                                                                            |
| Crawl regression check in CI                                                | 1     | Done                       | `pnpm seo:check`, `tests/e2e/seo.spec.ts`                                                                                                                                                                                                                  |
| **Granular crawler policy**                                                 | 2     | Done                       | AI search / AI training / Google-Extended switches (`apps/web/src/lib/robots-policy.ts`)                                                                                                                                                                   |
| **Automatic search titles and descriptions for all 38 trips × 7 languages** | 2     | Done                       | `packages/shared/src/seo-defaults.ts`; built only from published title, highlights, duration, departure time and DB price; admin overrides win                                                                                                             |
| **Admin: Website → Search (SEO)**                                           | 2     | Done                       | Overview (measured content health), live site check, Tour pages (completeness checklist, issues, snippet preview per language, save automatic texts as own, live page + JSON-LD preview, Rich Results Test link), Search data (connection-required states) |
| **Admin SEO API**                                                           | 2     | Done                       | `GET /v1/admin/seo`, `POST /v1/admin/seo/page`, `POST /v1/admin/seo/check` (content roles, one live check per minute, fixed `WEB_ORIGIN`, known slugs only)                                                                                                |
| **`www` → apex**                                                            | 2     | Done in config             | Caddy site with its own certificate, 308 to apex; effective on deploy                                                                                                                                                                                      |
| Collection-page heading order (a11y 98 → 100)                               | 2     | Done                       |                                                                                                                                                                                                                                                            |
| **Per-tour verification checklist** (38 tours, 343 items)                   | 2     | Done                       | `scripts/seo-tour-checklist.mjs` → `TOUR-VERIFICATION-CHECKLIST.md`                                                                                                                                                                                        |
| **FAQ candidates** (60, 18 answerable now)                                  | 2     | Done (drafts, unpublished) | `FAQ-CANDIDATES.md`                                                                                                                                                                                                                                        |
| **Competitor research** (21 queries, 24 competitors)                        | 2     | Partial                    | target was 50 queries; see limits in `COMPETITOR-ANALYSIS.md`                                                                                                                                                                                              |
| **Visibility benchmark system**                                             | 2     | Done                       | prompts (55 AI + 29 search), monthly sheet generator, summary; December sheet ready; no results (no platform access)                                                                                                                                       |
| Performance investigation                                                   | 2     | Measured, not solved       | LCP 3.2–3.6 s lab; inline-CSS experiment rejected; next experiments listed                                                                                                                                                                                 |
| Integration/deploy/rollback plan                                            | 2     | Done                       | `INTEGRATION-AND-DEPLOYMENT.md`                                                                                                                                                                                                                            |

### Smart SEO automation — what happens when a new tour is created

| Requirement                     | How                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sensible metadata defaults      | Automatic title/description as soon as the trip has a title and highlights (no admin step)                       |
| Valid structured data           | TouristTrip/Offer/Breadcrumb generated from the trip on render                                                   |
| Sitemap after publication       | Sitemap is built from the published API on every request                                                         |
| hreflang                        | Every published trip gets all 7 language URLs + x-default                                                        |
| Breadcrumbs                     | Home → collection → trip, JSON-LD                                                                                |
| Missing critical information    | Admin SEO → Tour pages: completeness checklist and issues                                                        |
| Duplicate metadata              | Detected per language among published trips                                                                      |
| Unpublished content not indexed | Drafts are absent from the public API and sitemap; the live check verifies "unpublished listed or reachable = 0" |
| Related tours and destinations  | **Not built** (needs hub pages; see below)                                                                       |
| AI draft assistance             | **Not built** (optional by the brief; would need an owner decision and a provider)                               |

## 2. Not built (and why)

| Item                                                                                                                                                     | Why not in this branch                                                                                                                                                                  | Next step                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Travel guide system** (DB table, admin editor with draft/approval, public `/[locale]/guides/[slug]`, `Article` JSON-LD with real author/date, sitemap) | A multi-PR feature (migration, API, admin, web, 7-language UI). Its content needs owner-verified facts that do not exist yet; building the system first would produce an empty section. | One PR per layer, after the owner approves the first three guide briefs in `CONTENT-ROADMAP-90-DAYS.md`. |
| **Destination/activity hubs**                                                                                                                            | Would be thin today: tours have no descriptions or practical facts. Hubs without them are the doorway pages the brief forbids.                                                          | After 10+ tours pass the checklist: Ras Mohammed, Cairo from Sharm, Private excursions first.            |
| **Tour-specific FAQ field**                                                                                                                              | Needs a migration; trip notes/exclusions/"what to bring" already render on the page.                                                                                                    | Use existing fields first.                                                                               |
| **Guide-language field**                                                                                                                                 | Same; facts not confirmed yet.                                                                                                                                                          | Owner decision D2.                                                                                       |
| **External integrations** (Search Console, Bing, GA4, PageSpeed)                                                                                         | Need the owner's accounts and credentials. The admin shows "Connection required", never sample data.                                                                                    | `EXTERNAL-ACTIONS-REQUIRED.md` section C.                                                                |

## 3. Commits

1. `fix(web)`: Render page metadata in `<head>` for every crawler
2. `feat(web)`: Localized SEO metadata and a connected JSON-LD graph
3. `feat(web)`: Sitemap images, explicit AI-training switch and llms.txt
4. `test(seo)`: Crawl-based SEO regression check in the e2e suite
5. `docs(seo)`: Audit, implementation and strategy records (phase 1)
6. `feat(web)`: Separate robots switches for AI search, AI training and Google-Extended
7. `feat(seo)`: Deterministic search titles and descriptions for every trip
8. `feat(api)`: SEO health, live page check and site check for the admin
9. `fix(api)`: Count human translations stored outside the content columns
10. `feat(admin)`: Search (SEO) section with content health, live check and tour SEO
11. `fix(infra)`: Redirect www to the apex with its own certificate
12. `fix(web)`: Keep the heading outline on collection pages
13. `feat(seo)`: Tour checklist and visibility benchmark tools
14. `docs(seo)`: Phase 2 records

## 4. Measured improvements

| Measure                                           | Before                                               | After                                             | Where measured                                              |
| ------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Crawl errors                                      | 627 (production)                                     | 0                                                 | full 336-URL crawl; after = production build of this branch |
| Crawl warnings                                    | 191 (production)                                     | 1                                                 | same                                                        |
| Pages with metadata outside `<head>` (generic UA) | 101/101 checked pages (production, admin live check) | 0                                                 | live check / crawl                                          |
| Trips with duplicate meta descriptions            | 3 per language                                       | 0                                                 | crawl + admin health                                        |
| Trip pages with a descriptive title/description   | 0 written                                            | 266 automatic (38 × 7), 0 duplicates              | admin health                                                |
| `www`                                             | TLS failure                                          | 308 to apex (config validated; live after deploy) | curl / caddy adapt                                          |
| Collection page accessibility (Lighthouse)        | 98                                                   | 100                                               | lab                                                         |
| Mobile LCP                                        | 3.62 s (fixture, earlier record)                     | 3.2–3.6 s                                         | lab, not a meaningful change                                |

Rankings, traffic and AI visibility: **not measured** (no accounts, no
platform access). The first real baseline will come from Search Console and
the December benchmark sheet.

## 5. Growth priorities

**Next 30 days**

1. Approve and deploy (`INTEGRATION-AND-DEPLOYMENT.md`); verify on production.
2. Search Console, Bing, Google Business Profile (E2–E4); submit the sitemap.
3. Owner answers the checklist for the 10 most-requested tours; publish
   descriptions, exclusions, what-to-bring, pickup and documents.
4. Legal: cancellation, terms, privacy published in 7 languages.
5. FAQ: publish the 18 answerable questions after the owner reads them.
6. First benchmark sheet (December).

**Days 31–60**

1. Remaining 28 tours through the checklist.
2. Guide system (3 PRs) and the first three guides: Cairo plane vs bus,
   Ras Mohammed boat vs bus, Group vs private.
3. Performance experiments 1–3 (`TECHNICAL-SEO-REPORT.md` §6) measured with a
   PageSpeed API key.
4. Review routine live (WhatsApp review link after each trip).

**Days 61–90**

1. Hubs: Ras Mohammed, Cairo from Sharm, Private excursions — only once their
   tours are complete.
2. About page with verified company facts and team (with consent).
3. Second benchmark month; compare with December; act on the queries where
   competitors are cited and Stella is not.
4. Earned links: partner hotels/dive centres, Italian travel media (guides).
