# SEO phase 3: travel content, verification and AI visibility

Date: 2026-11-28 · Branch `feat/seo-content` (stacked on `feat/seo-foundation`,
PR #19) · Status: implemented and tested locally; **not merged, not deployed**.

## What was built

| Area                 | Admin                                                                                                                                                                   | API / DB                                                                                                             | Public site                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Travel content CMS   | Website → **Travel guides**: list, editor (7 languages, summary, body, own SEO texts, author, sources, cover, FAQs, related trips/pages), draft preview, readiness list | `/v1/admin/content-pages*` (content to edit, publish to publish/unpublish/archive), table `content_pages`            | `/{locale}/guides`, `/{locale}/guides/{slug}`, sitemap (`lastmod`), `/llms.txt`, conditional footer link |
| Verification Center  | Website → **Verification**: page gaps per tour (from SEO health), owner answers per topic, 8 site-wide approvals, missing-field filter, CSV export                      | `GET/PUT /v1/admin/verification` (read: content; write: publish), table `verification_facts`                         | Nothing. Answers are internal and never published                                                        |
| AI visibility        | Website → **AI visibility**: manual entry, CSV import/export, monthly trend, competitors, history, delete (owner/manager)                                               | `/v1/admin/visibility*`, table `visibility_measurements`                                                             | Nothing                                                                                                  |
| SEO metadata editing | Search (SEO) → tour: edit/reset own title and description per language, live snippet, social-preview note                                                               | Existing `PATCH /v1/admin/trips/:id/seo` (editor on a live trip → review draft, as before)                           | Overrides take priority over generated texts (Phase 2)                                                   |
| Migration safety     | none                                                                                                                                                                    | `migrate` stops when Drizzle would silently skip an older unapplied migration (`packages/db/src/migration-order.ts`) | none                                                                                                     |

### Publication rules (enforced by the API, not only the UI)

A content page can be published only by an owner or manager, and only when:
English body ≥ 300 words (guide) / 250 (destination) / 200 (activity), a
summary, a named author, ≥ 1 https source (guide/destination), ≥ 1 related trip
and every related trip published, all seven languages present for every text
(same check as trips), and no `[CONFIRM` marker in any language of title,
summary, body, SEO texts or FAQs. A published page cannot be saved back into a
failing state, cannot change its address, and cannot be edited by an editor.
Drafts and archived pages never appear in `/v1/public/content*`, the sitemap,
`llms.txt` or the footer. The guides index returns 404 while nothing is
published, so there is no empty section.

Body text is a small plain-text format (`## ` heading, `- ` list item, blank
line = paragraph) rendered as React elements, so no HTML or Markdown from staff
reaches the page. Source links must be `https:`.

## Recovered interrupted work

The previous session stopped while wiring the admin routes/nav. On recovery:
`admin-app.tsx` already had the three dynamic imports and guarded routes (no
duplicates); `app-shell.tsx` was unchanged. The nav items, icons and
active-route mapping were added by hand, and all admin strings were added in
seven languages. A local recovery ref keeps the interrupted state:
`refs/recovery/phase3-wip-2026-11-28`. Fixes made to the recovered code:

- broken `const` chain in `seo.tsx` (4 type errors); save errors now reported;
- `[CONFIRM]` was not checked in FAQs/titles/SEO texts; now it is;
- related-trip check used `= any(${array})`, which Drizzle expands into a
  tuple; replaced with `inArray`;
- editors could change a live page without review; now 403;
- CSV export had no formula-injection protection; cells starting with
  `= + - @` tab/CR get a leading apostrophe (removed again on import);
- visibility import/delete were not audited; now they are;
- several CSS classes used by the screens did not exist; added.

## Database migrations

| File                                | Content                                          | Journal `when` |
| ----------------------------------- | ------------------------------------------------ | -------------- |
| `0017_content_pages_and_visibility` | `content_pages`, `visibility_measurements`       | 1795867484048  |
| `0018_verification_facts`           | `verification_facts` (unique NULLS NOT DISTINCT) | 1795869502604  |

Both are additive (new tables + FKs to `media`, `admin_users`, `trips`), and
snapshot chain `0015 → 0017 → 0018` is intact. Runtime role grants: API gets
`SELECT, INSERT, UPDATE` on `content_pages` and `verification_facts`, `SELECT,
INSERT, DELETE` on `visibility_measurements`; worker gets nothing new.

Validated on a disposable PostgreSQL 16 container (created and removed by this
session):

| Scenario                                                        | Result                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Empty DB → this branch; re-run                                  | 17 migrations, new tables present; re-run is a no-op                   |
| `origin/main` state + data → this branch                        | 15 → 17, data kept                                                     |
| Google Reviews (`0014`, `0016`) applied first, then this branch | 17 → 19, all tables and Google Reviews columns present                 |
| This branch applied first, Google Reviews merged unchanged      | **Drizzle skips `0014` and `0016` silently**; the new guard detects it |

The integration suite (testcontainers, fresh DB each run) also migrates from
empty and exercises the new grants through the restricted API role.

**Strategy:** deploy Google Reviews before Phase 3, **or** when Google Reviews
is merged after Phase 3 reached any shared database, re-stamp its migrations as
`0019`/`0020` with new journal `when` values (regenerate their snapshots on top
of `0018`). Main's `0015` already supersedes the Google Reviews copy of `0015`.
The new guard turns a wrong order into a failed deploy instead of a silently
incomplete schema.

## Google Reviews integration (not performed)

The Google Reviews work is still uncommitted in `F:\stella-project-kit`, which
was only read. A dry-run `git merge-tree` against a throwaway snapshot of that
working tree (temporary index, real index and files untouched) gives:

- 136 changed paths in Google Reviews, 111 on the SEO branches (vs `origin/main`), 36 overlap;
- **30 files conflict**; **22 of them already conflict between Google Reviews and `main`** (Google Reviews carries an older copy of the merged trip-search work: `0015`, search panel, search tests, journal, all dictionaries);
- 8 conflicts come from the SEO branches: `contact/page.tsx`, `[locale]/layout.tsx`, `t/[slug]/page.tsx`, `collection-view.tsx`, `lib/api.ts`, `runtime-privileges.ts`, `tests/contracts/openapi.json`, `tests/fixtures/server.mjs`.

Recommended order, each step in its own worktree, after the owner authorizes it:

1. Commit Google Reviews on its branch and rebase it on `main` (resolves the 22 trip-search conflicts; drop its copy of `0015`, keep main's).
2. Re-stamp its migrations after the newest one on the target branch (see above).
3. Merge PR #19, then this branch; resolve the 8 files (dictionaries: union of keys; `layout.tsx`/`shell.tsx`: keep both the reviews block and the `guides` flag; regenerate `openapi.json` with `vitest -u` and review).
4. Review structured data: no `aggregateRating`/`Review` markup for first-party reviews (Google's self-serving review policy); the existing e2e check enforces this.

## Deployment and rollback checklist (requires owner approval)

Before:

- [ ] PR #19 merged; this PR reviewed and merged; Google Reviews order decided (above).
- [ ] Database backup taken and restore rehearsed (`docs/RUNBOOK.md`).
- [ ] Staging: `pnpm db:migrate` (guard passes), smoke test the three admin screens with each role, `pnpm seo:check --base <staging>` → 0 errors.

Deploy:

- [ ] Release API + worker + web + admin from the same commit; run migrations (additive, safe for the old code).
- [ ] `pnpm db:seed-content` only if the owner wants the ten drafts in the admin (drafts only).
- [ ] Production `pnpm seo:check`; confirm `/en/guides` returns 404 until a guide is published.

Rollback:

- [ ] Redeploy the previous images (old code ignores the new tables).
- [ ] Only if the schema must go: `DROP TABLE verification_facts, visibility_measurements, content_pages;` and delete the two rows from `drizzle.__drizzle_migrations` (back up first; this deletes guides, answers and measurements).

## Test evidence (2026-11-28, Node 22.23.4, this branch)

| Check                                    | Command                                                        | Result                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format / lint / typecheck                | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`             | pass / pass / 6 of 6 packages                                                                                                                                                                          |
| Unit                                     | `pnpm test`                                                    | 500 passed (34 files)                                                                                                                                                                                  |
| Integration (real PostgreSQL 16)         | `pnpm test:integration` with `FFMPEG_PATH`/`FFPROBE_PATH` set  | 74 passed (3 new: publication workflow and draft privacy, verification RBAC, visibility RBAC)                                                                                                          |
| Web production build                     | `pnpm --filter @stella/web build`                              | compiled, all routes generated; standalone copy step fails on this Windows machine (symlink permission), not a code error                                                                              |
| Browser (fixture, mobile/tablet/desktop) | `pnpm test:e2e` + `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000` | full run 76 passed, 4 failed, 10 skipped; all 4 failures were the SEO spec expecting `localhost` origin; rerun of `seo.spec.ts` with the matching origin: 5 passed, 10 skipped (mobile-only by design) |
| SEO crawl                                | `node scripts/seo-check.mjs --base http://127.0.0.1:3000`      | 350/350 sitemap URLs, 0 errors, 1 warning (a 74-char French title, pre-existing)                                                                                                                       |
| Migrations                               | disposable container, 4 scenarios                              | see table above                                                                                                                                                                                        |
| Secret scan                              | `node scripts/security-source-scan.mjs`                        | exit 0                                                                                                                                                                                                 |

What these do **not** show: a zero-error crawl is a technical check, not a
ranking result. The fixture serves one synthetic guide; no real guide is
published. Admin screens were checked by typecheck, the dictionary/key test and
API integration tests, **not** by an admin browser run (see remaining work).
No Lighthouse/performance run was made in this session.

## Remaining work

**A. Done and ready for review:** CMS, Verification Center, AI visibility, SEO
text editing, guide routes/sitemap/llms/JSON-LD, migrations + guard, tests above.

**B. Blocked by business verification:** the 343 per-tour items
(`TOUR-VERIFICATION-CHECKLIST.md`, now recordable in the admin); guide
languages, pickup, fees, inclusions/exclusions, age, documents, accessibility,
safety, cancellation; legal approval of terms/privacy/cancellation; AI-training
crawler decision; licence/company details; the 42 FAQ answers needing approval;
expanding the ten EN/IT guide outlines to full, sourced, seven-language pages
with a named author (they stay drafts until then).

**C. Blocked by account authorization:** Search Console, Bing Webmaster Tools,
Google Business Profile, GA4, PageSpeed API key, Tripadvisor.

**D. Blocked by Google Reviews:** integration and migration re-stamping (above);
any reviews-related structured data review.

**E. Technical work not done in this session:**

- Admin browser tests for the three new screens on an isolated stack (API +
  fresh DB + admin on :3001, `pnpm test:e2e:admin`); not run.
- Independent re-verification of the 18 "verifiable" FAQ candidates and
  placing them on tour/FAQ pages.
- Related-guides links on trip pages (needs `related_trips` in the public list;
  deferred to limit conflicts with Google Reviews in `t/[slug]/page.tsx`).
- Competitor research beyond the 21 recorded queries (target 50 / 15 competitors).
- Mobile LCP investigation (last lab value 3.2–3.6 s; target ≤ 2.5 s).
- Machine translation of content pages for non-core languages (core 7 required
  for publication; other languages fall back to English).

## Completion session (2026-11-28, later)

The "Remaining work → E" list above was worked through; results, evidence and
the remaining classification are in
[PHASE-3-FINAL-READINESS.md](PHASE-3-FINAL-READINESS.md). In short: the admin
browser suite now exists and passes on an isolated stack (6 defects found and
fixed); trip pages link back to guides and page links are two-way; 17 FAQ
answers are verified in seven languages and loaded as drafts; research is at
51 queries / 45 competitors; LCP improved on every measured page but the
2.5 s lab target is still not met (bottleneck documented); migrations were
rehearsed in 11 scenarios; the Linux production artifact is confirmed by CI.
