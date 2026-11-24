# Bug report — Stella Sharm Tours

Commit `56a4319` · 2026-11-24. Statuses follow the audit brief (CONFIRMED / LIKELY / SUSPECTED / NOT REPRODUCED / ENVIRONMENT BLOCKED / FALSE POSITIVE).

The API, database and price logic held up well: 70/70 PostgreSQL integration cases passed, and the price calculator matched an independent reference over 100,000 generated cases. **The defects that matter are in the web tier's cache layer (BUG-05, BUG-06).** Admin changes are stored correctly and the API serves them correctly, but the public website can show something different.

| ID     | Title                                                                                  | Severity                             | Status                                     |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| BUG-05 | Unpublished trips/pages reappear on the website after every web restart/deploy         | **High**                             | CONFIRMED                                  |
| BUG-06 | A long-running web process stopped applying cache invalidations (price edit not shown) | **High impact / unknown likelihood** | CONFIRMED symptom, root cause not isolated |
| BUG-01 | Drizzle snapshots lag schema; next `db:generate` emits failing migration               | Medium                               | CONFIRMED                                  |
| BUG-02 | Browser test runs overwrite tracked documentation screenshots                          | Low                                  | CONFIRMED                                  |
| BUG-03 | Two owner e-mails English-only (seven-language rule)                                   | Low                                  | CONFIRMED                                  |
| BUG-04 | 585 MB of git-ignored media tracked; 1.7 GiB repository                                | Low                                  | CONFIRMED                                  |
| BUG-07 | Touch-target test fails on 43.99994 px (sub-pixel)                                     | Low (test)                           | CONFIRMED flaky                            |

---

## BUG-05 · Withdrawn content reappears on the public website after every web restart or deploy

|                |                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity       | **High** — public site contradicts the admin; affects trips, collections, legal pages and the sitemap                                                                                                                   |
| Status         | **CONFIRMED** (two independent reproductions)                                                                                                                                                                           |
| Subsystem      | Web (Next.js data cache) + deployment volume                                                                                                                                                                            |
| Affected files | `infra/docker-compose.prod.yml:100` (`webcache:/app/apps/web/.next/cache` named volume), `apps/web/src/lib/api.ts:36-41` (`next: { revalidate: 60, tags }`), Next 15.5.29 `tags-manifest.external.js` (in-memory `Map`) |

**Reproduction A (trip).** `bash audit/2026-11-24/REPRODUCIBLE_TEST_CASES/withdrawn-content-resurrection.sh` against the local verification stack:

```
S0 published:                 page=200 api=200
S1 unpublished+revalidated:   page=404 api=404     ← correct
S2 after web restart:         page=200 (×3)        ← withdrawn trip is back
S3 +65 s (revalidate=60):     page=200             ← and stays back
restored: published page=200
```

**Reproduction B (legal page, found by the repo's own test).** `tests/integration/runtime.spec.ts:46` passed before a web restart and failed after it: the sitemap listed `/en/legal/terms` while `GET /v1/public/pages/terms` returned 404. The web's fetch cache held a `status 200` entry for `pages/terms` written on **2026-11-19**, still being served on 2026-11-24 (`evidence/e2e-trigger-run.txt`).

**Root cause.** Three behaviours combine:

1. The Next data cache (`.next/cache/fetch-cache`) lives on a **persistent named volume** that survives container restarts and image upgrades.
2. Next's tag-invalidation record (`tagsManifest`) is **process memory only**. A restart forgets that `trip:<slug>` was invalidated, so the old 200 entry on disk is treated as merely time-expired.
3. Next stores only **200** responses. The stale-while-revalidate refresh receives 404 from the API, nothing is written, and the old 200 entry is served again on every request, **indefinitely**.

**Impact.** After any deploy (`deploy.sh` recreates the web container), every trip, collection or legal page that staff unpublished or archived since the cache entry was written comes back on the public site and in the sitemap, with its last cached price. Customers can select it and then get `TRIP_UNAVAILABLE` at booking (the API correctly refuses). Retracted legal text can reappear, and search engines are told to index withdrawn URLs. This contradicts AGENTS.md: the admin controls content without a deploy.

**Fix (recommended).** Stop persisting the Next data cache across process lifetimes: replace the `webcache` named volume with a `tmpfs` (the catalog is small and the API is fast — see PERFORMANCE_REPORT), or clear `.next/cache/fetch-cache` at container start. Alternative: a custom `cacheHandler` that persists tag timestamps next to the entries. Optionally, make `read()` in `apps/web/src/lib/api.ts` use `revalidate: 60` without disk persistence for 404-prone reads.

**Regression test.** Add the reproduction to the seeded browser job: unpublish → revalidate → restart web → expect 404 and the URL absent from `/sitemap.xml`.

---

## BUG-06 · A long-running web process stopped applying cache invalidations

|           |                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------- |
| Severity  | **High impact** (an admin price change does not reach the website); **likelihood unknown**      |
| Status    | **CONFIRMED symptom** in one process (3 reproductions); trigger and root cause **not isolated** |
| Subsystem | Web (Next.js data cache)                                                                        |

**Observed.** On the verification stack's web container (up ~7 h, many earlier test runs):

- `tests/real-api/admin.spec.ts` failed twice: price PUT → 200, worker `revalidate.web` job completed, API served €40 within 2 s (`evidence/cache-layer-probe.txt`), the page showed €35 for the full 60 s poll.
- Minimal reproduction (DB price 35→41, then `POST /api/revalidate` with `trip:tiran-island-boat` and then `catalog` → both `200 {"revalidated":true}`) → page still €35.
- The fetch-cache directory received **no writes** for 7+ minutes despite page loads, so time-based revalidation (60 s) was not refreshing either.

**After a web restart**, the identical reproduction worked (€35→€41→€42→€35, including repeated invalidation of the same tag). Running the other E2E specs afterwards did **not** recreate the stuck state.

**Root cause.** Not determined. Ruled out: missing Next patch (present in the image), wrong tags (page and worker use `trip:<slug>`), worker failure (jobs completed; worker throws on non-2xx), disk full/read-only (writable, 5 % used), memory pressure (141 MiB / 768 MiB, no OOM). The Next 15.5.29 build contains extra "route cache / seed read" logic in `FileSystemCache.get` (`activePromotion`, `beginSeedRead`) that could leave state behind, but this was not proven.

**Why it matters even without a root cause.** If it happens in production, price and content edits silently stop reaching visitors until the web container restarts, and nothing alerts anyone. Restarting also triggers BUG-05.

**Next steps.**

1. Run the web container with `NEXT_PRIVATE_DEBUG_CACHE=1` in staging and keep it up for days with periodic edits.
2. Add a synthetic monitor that compares one trip's primary price from the API with the rendered page and alerts on a mismatch lasting over 2 minutes.
3. Fixing BUG-05 with a `tmpfs` cache does not address this in-process state; keep both items open.

---

## BUG-01 · Drizzle snapshots lag the schema; the next `db:generate` emits migrations that fail on existing databases

|                |                                                                                        |
| -------------- | -------------------------------------------------------------------------------------- |
| Severity       | **Medium**                                                                             |
| Status         | **CONFIRMED**                                                                          |
| Subsystem      | `packages/db` migrations                                                               |
| Affected files | `packages/db/drizzle/meta/` (snapshots stop at `0008`), hand-written `0009`–`0012` SQL |

**Reproduction.** `bash audit/2026-11-24/REPRODUCIBLE_TEST_CASES/schema-drift-probe.sh` (works on a temp copy; the repo is not written). Output: `evidence/schema-drift.txt`.

**Expected.** No schema changes.
**Actual.** A generated migration with `CREATE TABLE "privacy_erasures"` (already created by 0012), `ALTER TABLE "trips" ADD COLUMN "story"` (0010) and six `CREATE INDEX` statements (0011).

**Root cause.** Migrations 0009–0012 were hand-written and added to `_journal.json` without `meta/NNNN_snapshot.json`, so `drizzle-kit` diffs against 0008.

**Impact.** The next schema change made through the documented `pnpm db:generate` bundles these statements. `CREATE TABLE`/`ADD COLUMN` without `IF NOT EXISTS` fail on every existing database. `deploy.sh` runs `migrate` after the backup and under `set -e`, so the release is blocked, not the site.

**Fix.** Regenerate a snapshot that matches the schema (keep `meta/0013_snapshot.json`, replace the SQL body with a no-op), and run the probe in CI.

---

## BUG-02 · Running the browser suites overwrites tracked documentation screenshots

|          |                                                                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity | Low · **CONFIRMED**                                                                                                                                                                                  |
| Files    | `tests/integration/handoff.spec.ts:51`, `tests/integration/private-booking.spec.ts:14`, `tests/admin/dashboard.spec.ts:59`, `tests/e2e/frontend.spec.ts:647`, `tests/e2e/routes.spec.ts:133,285,294` |

During this audit, the seeded browser runs modified 77 tracked files under `docs/screens/current/mobile/`. They were restored to `HEAD` afterwards. Large binary diffs get committed by accident, and failed runs leave half-updated "approved" screens. **Fix:** write screenshots to an ignored directory unless `UPDATE_SCREENS=1`. **Test:** CI asserts `git diff --exit-code` after browser steps.

---

## BUG-03 · Two owner e-mails are English-only

|          |                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Severity | Low · **CONFIRMED** (deterministic strings)                                                                         |
| Files    | `apps/api/src/jobs.ts:254-264` (`notifyWeeklyPrices`), `apps/api/src/jobs.ts:595-601` (`notify.translation.budget`) |

Every other staff e-mail uses `cfg.OWNER_REPORT_LOCALE` with seven-language copy. These two use fixed English, and the weekly price body is raw `JSON.stringify` before/after rows. **Fix:** add the copy to the shared staff-copy module in EN/IT/ES/FR/DE/RU/TR and render readable "Trip — label: €40 → €35" lines (logic exists in `apps/admin/src/lib/diff.ts`).

---

## BUG-04 · ~585 MB of git-ignored media is tracked; repository pack is 1.7 GiB

|          |                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity | Low (operational cost) · **CONFIRMED**                                                                                                                                                                   |
| Affected | `Stella-Videos/` (131 files, 336 MB), `reports/stella-film-review/` (102 files, 201 MB), `assets/_backup-v1/` (45 files, 49 MB), added in `36026e1`; `.dockerignore` lacks `Stella-Videos` and `reports` |

CI clones with `fetch-depth: 0`, the VPS release script `git fetch`es full history, and every image build sends ~540 MB of unused context. **Fix:** `git rm -r --cached` the three directories, extend `.dockerignore`, and consider LFS. A history rewrite is optional and needs owner approval.

---

## BUG-07 · Touch-target assertion fails on sub-pixel layout

|          |                                              |
| -------- | -------------------------------------------- |
| Severity | Low (test reliability) · **CONFIRMED flaky** |
| File     | `tests/real-api/languages.spec.ts` (de)      |

`Expected >= 44, Received 43.99993896484375` in one run; the same test passed in the previous run on the same build. **Fix:** compare `Math.round(size) >= 44` (or `>= 43.99`) and set the control's min-size with an integer px value.

---

## Not reproduced / false positives

| ID    | Hypothesis                                                                               | Status                 | Evidence                                                                                      |
| ----- | ---------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| FP-01 | Editor can write arbitrary `settings` JSON (e.g. WhatsApp number) via translation review | FALSE POSITIVE         | `admin-ui.ts:133-142` limits targets to `publicTranslationFields`; editors only create drafts |
| FP-02 | Fresh DB cannot be seeded (prior-audit blocker)                                          | NOT REPRODUCED (fixed) | "seeds 7/38/4 idempotently" passed on fresh PostgreSQL 16                                     |
| FP-03 | Bulk price preview larger than apply token                                               | NOT REPRODUCED (fixed) | "previews and applies all 5000 prices" passed                                                 |
| FP-04 | Request date filters / export ignore filters                                             | NOT REPRODUCED (fixed) | "matches one trip date for list, counts and filtered CSV…" passed                             |
| FP-05 | Production picomatch advisory                                                            | NOT REPRODUCED (fixed) | `pnpm audit --prod` clean                                                                     |
| FP-06 | Price calculator diverges from written rules                                             | NOT REPRODUCED         | 100,000 seeded cases, 0 differences                                                           |
| FP-07 | Unguarded admin endpoint                                                                 | NOT REPRODUCED         | 110-route sweep                                                                               |
| FP-08 | Two CSP headers collide on pages                                                         | FALSE POSITIVE         | single nonce CSP observed                                                                     |
| FP-09 | Missing Next revalidation patch in image (BUG-06 hypothesis)                             | FALSE POSITIVE         | patched file present in running container                                                     |

## Environment-blocked

| Test                                                         | Reason                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `tests/integration/runtime.spec.ts:131` (second environment) | requires a second stack on `:4990`, not running                                              |
| First E2E run (16 tests)                                     | Playwright 1.65 expects Chromium build 1254; only 1234 installed. Re-run with system Chrome. |
