# Bugs and code quality

Overall: high code quality. Inputs are validated with strict zod schemas (`z.strictObject`) at every boundary. Transactions use explicit isolation levels, with `FOR UPDATE` / `FOR SHARE` locks and advisory locks where ordering matters. The outbox pattern is used for side effects, and 23505, 23503 and 40001 errors are mapped to proper 4xx responses. Typecheck and lint (zero warnings) pass.

## OPS-01: Unexpected API and worker errors are logged without any error detail

- **Severity:** Medium · **Status:** Confirmed (code) · **Confidence:** High
- **Files:** `apps/api/src/app.ts:637` (`onUnexpected()` is called with no arguments), `apps/api/src/server.ts:22-26` (logs only `{code:'unexpected_api_error'}`), `apps/api/src/worker-main.ts:61` (logs only `{task}`)
- **Explanation:** The error object (name, message, stack, Postgres code) is discarded before logging. In production a 500 or a failed job leaves only "API operation failed" in `docker logs`, with no route, error class or stack.
- **Reproduction:** Force a DB error (for example, stop postgres in a local stack) and call a public endpoint. The log line has no cause.
- **Impact:** Incidents cannot be diagnosed, and mean time to recovery goes up.
- **Fix:** Pass `error` and `c.req.routePath` to `onUnexpected`. Log `err.name`, `err.message` (truncated), `err.stack` and `cause.code` with a pino serializer that redacts request bodies, cookies and headers, which keeps the privacy goal. Do the same in the worker.
- **Verification:** Unit test with an injected logger that asserts the stack and route are present and the body and cookie are absent.

## BUG-02: Media encoding runs inside an open database transaction

- **Severity:** Low · **Status:** Confirmed (code) · **Confidence:** High
- **File:** `apps/api/src/media.ts:372-405` (`renderMedia` runs inside `db.transaction` after `pg_advisory_xact_lock`)
- **Explanation:** sharp and ffmpeg work (up to the 120 s per-tool timeout, with several variants in sequence) keeps a pool connection and a transaction snapshot open. No `idle_in_transaction_session_timeout` or `statement_timeout` is configured (DB-02). Clips are capped at 20 s, so the duration is bounded, but bulk uploads tie up connections in the worker's pool of 10 and hold back vacuum.
- **Fix:** Take a session-level advisory lock (or a status-based claim) outside a transaction, render, then open a short transaction to compare inputs and commit. The existing "inputs unchanged" re-check already supports this.
- **Verification:** Integration test: during a render, `pg_stat_activity` shows no `idle in transaction` row for the worker.

## BUG-03: Orphaned original file if the upload transaction fails after `rename`

- **Severity:** Low · **Status:** Confirmed (code) · **Confidence:** Medium
- **File:** `apps/api/src/media.ts:312` (`rename(path, target)` inside the transaction) and `:346` (catch removes only the quarantine `path`)
- **Scenario:** The insert into `media` or `outbox` fails, for example on a serialization error or connection loss, after the rename. The file stays in `originals/<sha>` with no row, and the weekly cleanup does not see it because it works from DB rows.
- **Fix:** Rename after commit, or add the target to the cleanup in `catch` when no row exists for that SHA.
- **Verification:** Fault-injection test that makes the outbox insert throw, then asserts no file remains.

## BUG-04: Caddy and API disagree on allowed poster formats

- **Severity:** Informational · **Files:** `infra/caddy/common.caddy:15` allows `poster.webp`; `apps/api/src/serve-media.ts:8-9` allows only `poster.(jpg|avif)`
- **Impact:** None today, because `poster.webp` is never generated. Keep the two regexes generated from one source to avoid drift.

## QUAL-01: Very large modules

- **Severity:** Informational · `apps/api/src/admin.ts` (2,224 lines), `admin-more.ts` (1,973), `apps/admin/src/screens/trip-editor.tsx` (1,763)
- **Recommendation:** Split by resource (requests, trips, media, settings) when they are next touched. Do not refactor before launch.

## QUAL-02: Developer toolchain drift

- **Severity:** Informational
- The host's default `node` is v24.19.0, but `engines` requires 22. Quality gates passed only after putting the bundled `.tools/node_modules/node-win-x64` (v22) and pnpm 10.34.9 on `PATH`. Turbo cache replays include warnings from a pnpm version that ignores the `pnpm.overrides` and `patchedDependencies` fields. If a contributor installs with pnpm 11 or later, the Next cache patch (`patches/next@15.5.29.patch`) and the `postcss` override would be silently dropped. Fresh runs under 10.34.9 apply them, and the regression test `apps/web/cache-revalidation.test.ts` passed.
- **Fix:** Move `overrides` and `patchedDependencies` into `pnpm-workspace.yaml` (supported by pnpm 10 and later), and add `.npmrc` `engine-strict=true`.

## QUAL-03: Repository hygiene

- **Severity:** Informational
- `Stella-Videos/` (336 MB) is untracked and **not** git-ignored, so a `git add -A` would commit it.
- `reports/` contains media (`.mp4`, `.zip`) next to documents.
- `seed-one-shot.patch` sits loose at the repo root.
- Migrations `0004_tired_zombie.sql` and `0008_request_export_cursor.sql` are 0 bytes but listed in the journal. They are harmless no-ops but confusing (see DB-03).

## Areas checked with no defect found

- Price calculation is server-side only (`booking-quote.ts`, in a repeatable-read transaction). A client `quote_id` mismatch returns 409 with the fresh quote.
- Booking idempotency, with the race on `booking_request_receipts_pkey` handled (`requests.ts:110-124`).
- Last-owner and self-demotion guards are serialized with an advisory lock (`admin-more.ts:153-185`).
- Session touch is race-safe (`auth.ts:227-246`). Login rechecks the user row `FOR UPDATE` before creating a session.
- Range requests on media handle suffix ranges and 416 correctly (`serve-media.ts:62-86`).
- CSV export neutralises formulas (`packages/shared/src/csv.ts`).
