# Phase 3 — final completion and integration readiness

Date: 2026-11-28 · Branch `feat/seo-content` · **Not merged, not deployed, no
production migration run.** Written for the owner, the reviewer of PR #20 and
whoever integrates Google Reviews.

## 1. Branch and commits

| Item                    | Value                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Branch / PR             | `feat/seo-content` → PR #20 (base `feat/seo-foundation`, PR #19 → `main`)                           |
| Start of this session   | `dcc9019` (7 phase-3 commits `dcfc08d…dcc9019` on top of the 14 foundation commits; none rewritten) |
| Commits of this session | listed in the PR and `git log dcc9019..feat/seo-content` (logical commits, no amend, no force-push) |
| Recovery ref (local)    | `refs/recovery/phase3-wip-2026-11-28` → `29d51a4`, kept                                             |

## 2. PR status

- PR #19: open, CI `verify` **success** (2026-11-28 12:45 UTC).
- PR #20: open; CI on `dcc9019` **success** (2026-11-28 13:53 UTC). Updated
  with this session's commits; see the PR for the CI result of the new head.

## 3. Completed technical work (this session)

| Area                   | What was done                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated test stack    | Own disposable PostgreSQL 16 + Mailpit (compose project `stella-seo-qa`, ports 55471/11071), own API, worker (fake translation), production builds of admin and web; test-only users created and deleted by each test |
| Admin browser suite    | New `tests/admin/seo-content.spec.ts` (Travel guides, Verification, AI visibility, tour SEO texts; 390/768/1440 px; axe WCAG 2.2 AA); added to CI's seeded-stack step                                                 |
| Defects fixed          | see §4                                                                                                                                                                                                                |
| Internal linking       | Trip pages list published guides/destination/activity pages that link to them; page-to-page links are two-way; public content list carries `related_trips` (published trips only)                                     |
| Destination / activity | Verified end to end (§7)                                                                                                                                                                                              |
| FAQ                    | 18 "Site" candidates re-verified; 17 answers in 7 languages as drafts (§6)                                                                                                                                            |
| Performance            | Baseline + 3 independent experiments; 2 kept, 1 reverted (§5)                                                                                                                                                         |
| Research               | 51 queries (30 new), 45 competitors; keyword map updated (§8)                                                                                                                                                         |
| Integrations           | Classified from code: all six "Search data" cards are placeholders (§13)                                                                                                                                              |
| Migrations             | 11 scenarios reproduced on disposable PostgreSQL (§10)                                                                                                                                                                |
| Google Reviews         | Conflict matrix recomputed in a separate scratch clone (§11)                                                                                                                                                          |
| Build                  | Linux production artifact confirmed through CI (§9); Caddy config validated                                                                                                                                           |

## 4. Browser test results (actual runs this session)

**Admin (isolated stack), final run:** 15 tests → **9 passed, 6 skipped, 0
failed** (3.7 min). The 6 skips are by design: the four mutating workflows
(guide lifecycle, AI visibility writes, tour SEO texts, verification answers
on phones) run once at 390 px; navigation/accessibility and the read-only part
of Verification run at all three widths.

Covered: navigation to every new screen from the menu (incl. the phone "More"
page), empty states, no horizontal scroll, axe on every screen; guide created
by an editor → blockers shown (body, summary, author, sources, related trips,
translations) → editors see no publish controls and get 403 from the API for
publish/unpublish/archive → owner fills 7 languages, cover from the media
library, FAQ, https source, related trip → `[CONFIRM]` blocks publication →
publish → public page (server HTML, breadcrumbs, related trip link, FAQ,
canonical, ≥ 7 hreflang, WebPage/Article/BreadcrumbList/FAQPage JSON-LD, axe) →
sitemap inclusion → editor lock on the live page → sales user "No access" →
unpublish → API 404, public 404 and sitemap removal → audit rows
create/update/publish/unpublish. Draft privacy before publication (API 404,
page 404, not in sitemap). Verification: missing-field filter, site-wide
approval with internal note saved and reloaded, per-tour answer, CSV export
(header, formula-safe), note absent from public endpoints, editor read-only
(UI + API 403), audit rows. AI visibility: add (editor), validation error,
blank benchmark template imports nothing, export with `'=` formula
neutralisation, round-trip import, trend table, owner delete via confirm
dialog, audit create/import/delete, phone width with data. Tour SEO texts:
a partial-language change on a live trip is refused with a visible error, a
7-language change is saved, public `<title>` changes, live crawler check
("metadata in head"), JSON-LD preview, reset to automatic texts.
Screenshots: `.local/qa-evidence/` (ignored, not committed).

**Defects found by these runs and fixed:**

1. AI visibility on phones zoomed out to 855 px for owners/managers once
   checks existed: the hidden "Delete" column label (absolute `.sr-only`)
   escaped the table's scroll container. Fix: the scroll container is the
   containing block (`position: relative`).
2. AI visibility tables scrolled but were not keyboard-reachable (axe
   `scrollable-region-focusable`, WCAG 2.1.1). Fix: focusable labelled region.
3. Same for the structured-data preview on Search (SEO) → tour.
4. Same for the guide editor's live preview once the text is long (variant
   found by checking the other scroll areas).
5. Adding a single AI visibility check wrote no audit entry (import and
   delete did). Fix: audited in the same transaction.
6. `pnpm db:seed-content` (and the new FAQ seeder) failed: root scripts
   cannot import `drizzle-orm`. Fix: no query operators in root scripts.

Not a defect (verified): the SEO-text save refusing partial languages on a
published trip is the seven-language rule (`requireCoreCopy`), and the admin
shows an error toast.

**Public website (fixture API, production build, all three projects):** see
§4a.

### 4a. Public suite and crawl

Production build of this branch against the read-only fixture API
(`tests/fixtures/server.mjs`), site URL and test base URL both
`http://127.0.0.1:3072` (consistent origins — the earlier 4 failures came from
a `localhost`/`127.0.0.1` mismatch):

- `pnpm test:e2e` (mobile 390, tablet 768, desktop 1440): **81 passed,
  12 skipped, 0 failed** (7.7 min). Includes booking/request flows, private
  booking, no-JavaScript checks, axe, routes, search, SEO (metadata in
  `<head>` for AI crawlers, guides JSON-LD, sitemap/llms.txt, the new trip →
  guide back-links). The 12 skips are the 6 HTTP-level SEO tests on tablet
  and desktop (`seo.spec.ts` runs them once, on mobile, because they do not
  depend on the viewport). CI on `dcc9019` showed 80 passed / 10 skipped for
  the same reason (5 tests then).
- SEO crawl `node scripts/seo-check.mjs`: **350/350 sitemap URLs, 428
  internal links, 0 errors, 1 warning** — `fr/t/water-activities` title is 74
  characters. Kept on purpose: it is the trip's own human-written French title
  ("Activités nautiques — parachute ascensionnel, bouée banane et bouée
  canapé"), accurate and specific; cutting it would only satisfy a character
  threshold.
- One harness mistake during this session (fixture started without its port
  variable → CORS refusals) was corrected and the whole suite re-run; the
  numbers above are from the clean re-run.

## 5. Performance (lab, before and after)

Full method and table: `TECHNICAL-SEO-REPORT.md` §7. Medians, mobile
Lighthouse 13.6, production build against the isolated stack:

| Page              | Before |      After | CLS after |
| ----------------- | -----: | ---------: | --------: |
| Home `/en`        | 3.93 s |     3.69 s |    0.0015 |
| Collection        | 3.19 s |     2.94 s |         0 |
| Trip (Ras Moh.)   | 3.10 s | **2.64 s** |    0.0001 |
| Guide (synthetic) | 1.06 s |     1.06 s |    0.0006 |

Kept: E1 (story schema/Zod loaded on demand), E2 (deferred later gallery
slides). Reverted: E3 (no Marcellus preload — no reliable gain). **The 2.5 s
lab target is not met** on home, collection or trip pages; the bottleneck is
documented (HTML/RSC payload, render-blocking CSS, framework JS and fonts under
simulated slow 4G — the LCP image is already a small, high-priority AVIF).
No real-user Core Web Vitals claim is made: field data needs CrUX/Search
Console after deploy.

## 6. FAQ verification

18 candidates re-checked (`FAQ-CANDIDATES.md`, "Re-verification"): #1 already
live; **17 verified**, 10 of them corrected (unsupported details removed —
e.g. "confirmed the day before", reasons for "on request", per-boat prices —
and no prices in any text). 12 go to the FAQ page as **drafts**
(`pnpm db:seed-faq`), 5 into three guide drafts (Cairo, Ras Mohammed,
families). All in EN/IT/ES/FR/DE/RU/TR; a unit test rejects missing
languages, prices and `[CONFIRM]`. The **42** owner/legal questions stay
unanswered and unpublished.

## 7. Internal linking and destination/activity pages

- Trip → guide: `<TripGuides>` after the trip view (server-rendered links in
  the page's language, max 4, hidden when none); booking bar unchanged above
  it. Drafts/archived pages never appear (API lists published, non-archived
  only). Tests: e2e (fixture: linked trip shows the link, unrelated trip shows
  no section), integration (list carries `related_trips`; unpublish removes
  the page from the list).
- Guide ↔ destination: `related_pages` now returns pages listing this one as
  well (published only); integration test publishes a destination and checks
  both directions and removal on unpublish.
- Destination and activity pages are the same CMS (`kind`): admin editing,
  kind-specific publication thresholds (250/200 words; activities need no
  source), route `/{locale}/guides/{slug}`, breadcrumbs, canonical/hreflang,
  JSON-LD (`TouristDestination` for destinations, `Article` otherwise),
  sitemap with `lastmod`, index grouped by kind. Drafts present: destinations
  `ras-mohammed`, `cairo-from-sharm`; activity `desert-safaris-compared` — all
  blocked by `[CONFIRM]` items, none published. No second CMS was built.

## 8. Competitor research coverage

51 queries (EN 27 / IT 22 / mixed 2; 7 conversational, 1 local) and 45
competitors, with sources and dates (`COMPETITOR-ANALYSIS.md`). Limits: a
US-located search API, not Google IT/UK; no volumes, difficulty, backlinks or
rankings — none are claimed. Keyword map updated with one home per query
(`KEYWORD-MAPPING.md`).

## 9. Production build

- Windows (this machine): `next build` compiles and generates every route for
  web and admin; only the **standalone copy step fails with `EPERM symlink`**
  (no symlink privilege). This is an OS permission issue, not a code error;
  `.next` runs with `next start` (used for all tests here).
- Linux (CI, `ubuntu-24.04`, run 46149140217 on `dcc9019`): `pnpm build`
  succeeded, "Collecting build traces" completed, and the Docker `web` and
  `admin` images were built by copying `.next/standalone` — **a deployable
  artifact was generated**. Standalone output was not disabled anywhere. The
  new head is verified by the PR #20 CI run.
- Caddy: `caddy validate` with the pinned production image: valid; `www`
  host route present.

## 10. Migration validation

Disposable PostgreSQL, real `migrateDatabase` with the skip guard:
fresh → main ✓; fresh → SEO ✓; main + data → SEO ✓ (data kept); GR first →
SEO ✓; **SEO first → GR as numbered: guard stops the deploy** (plain Drizzle
would silently skip 0014/0016 — reproduced); re-stamped 0019/0020 ✓ from
fresh, from main and after SEO; re-stamped after GR already applied ✗
(non-idempotent `ADD COLUMN`, whole batch rolled back); rerun is a no-op.
Strategy: Google Reviews first; re-stamp only if SEO reaches a shared
database first and GR was never applied. Details:
`INTEGRATION-AND-DEPLOYMENT.md` §0.1. The guard is kept.

## 11. Google Reviews integration risks

30 conflicting files (22 already conflict with `main`, 8 from the SEO
branches) — same as before; matrix with intended combined behaviour and
regression tests in `INTEGRATION-AND-DEPLOYMENT.md` §0.2. Main risks: older
trip-search copy overwriting PR #17 (keep `main`), the migration order above,
OpenAPI snapshot and dictionaries regenerated after merging, no
`Review`/`AggregateRating` markup for first-party reviews. **Blocked until an
authorised, committed Google Reviews version exists.**

## 12. Remaining business approvals

Owner decisions D1–D6; 343 per-tour facts (`TOUR-VERIFICATION-CHECKLIST.md`,
recordable in Admin → Verification); 42 FAQ answers; legal pages
(terms/privacy/cancellation); guide languages (Italian especially); pickup
areas/times; fees; reading and publishing the 17 FAQ drafts; completing the
10 guide drafts (named author, sources, 7 languages, `[CONFIRM]` resolved).

## 13. Remaining external account requirements

Search Console (E2), Bing Webmaster (E3), Google Business Profile (E4),
Tripadvisor (E5), Bing Places/Apple (E6), GA4 only if chosen (E7), PageSpeed
API key (E8), CDN/firewall check (E9). In code, every "Search data" card is a
static placeholder (no OAuth, no stored credentials, no sync); the design for
the real integrations is in `EXTERNAL-ACTIONS-REQUIRED.md` §F. No numbers are
shown or invented.

## 14. Deployment prerequisites

1. Owner authorises merging; Google Reviews committed and its order decided (§10).
2. Merge PR #19, then PR #20 (or the combined branch) with green CI.
3. Backup + restore rehearsal (`docs/RUNBOOK.md`); staging first.
4. Staging: `pnpm db:migrate` (guard passes), admin smoke test per role,
   `pnpm seo:check --base <staging>` → 0 errors, booking regression on staging.
5. Optional, owner's choice: `pnpm db:seed-content`, `pnpm db:seed-faq`
   (drafts only).
6. Production deploy of api/worker/web/admin from one commit; production
   checklist in `INTEGRATION-AND-DEPLOYMENT.md` §6.

## 15. Rollback

Redeploy the previous images (old code ignores the new tables and the new
`related_trips` field). Caddy: restore the previous `Caddyfile` if needed.
Schema rollback only if required, after a backup: `DROP TABLE
verification_facts, visibility_measurements, content_pages;` and delete the
two `drizzle.__drizzle_migrations` rows (deletes guides, answers and
measurements). FAQ drafts are ordinary `faqs` rows with `status='draft'`.

## 16. Protected Google Reviews worktree

PROTECTED_RESULT

## Classification of remaining items

| Item                                                                                                                                                                  | Class                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Admin browser tests, defects, linking, FAQ verification, research, migrations, build check                                                                            | **Completed**                             |
| 42 FAQ answers, 343 tour facts, legal pages, guide languages, guide drafts, FAQ draft review                                                                          | **Blocked by business verification**      |
| GSC, Bing, GA4, GBP, PageSpeed/CrUX, field Core Web Vitals, AI-platform measurements                                                                                  | **Blocked by external accounts**          |
| Combined release, migration re-stamping decision, reviews markup review                                                                                               | **Blocked by Google Reviews integration** |
| Mobile LCP ≤ 2.5 s (home RSC payload, render-blocking CSS); server-side integrations once accounts exist; machine translation of content pages for non-core languages | **Remaining technical implementation**    |
