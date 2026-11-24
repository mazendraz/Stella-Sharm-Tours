# Workflow and QA audit

## Executed test runs (2026-11-23, Node 22 / pnpm 10.34.9 from `.tools`)

| Suite                                             | Command                                                                                                | Result                             | Notes                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                                              | `pnpm test`                                                                                            | **140 passed / 140** (17 files)    | Includes price, booking, CSV, retention and env tests                                                                                          |
| Integration (real PostgreSQL 16, testcontainers)  | `pnpm test:integration`                                                                                | **68 passed / 68** (2 files, 68 s) | Auth, RBAC, sessions, booking idempotency, erasure, media pipeline (real HEIC and video), outbox, translation budget, backup and restore scrub |
| Browser: public site and booking (mobile 390×844) | `pnpm test:e2e:integration languages.spec.ts private-booking.spec.ts runtime.spec.ts --project mobile` | **10 passed, 3 failed**            | See QA-01 and QA-02                                                                                                                            |
| Typecheck / lint / prod audit                     |                                                                                                        | Pass / Pass / no vulnerabilities   |                                                                                                                                                |

The first browser attempt failed for every test with `Executable doesn't exist … chromium-1254`, an environment problem (the Playwright browser was not installed). It was rerun with the installed Chrome channel. Only the second run is reported above.

**Not executed in this audit:** the admin Playwright suites (`tests/admin/*`, several of which write data), tablet and desktop projects, `pnpm test:e2e` (fixture suite, needs `pnpm build`), Lighthouse, and the ZAP scan. CI (`.github/workflows/ci.yml`) is designed to run all of them, but **CI has never executed** because there is no remote (PR-01).

## Journey coverage map

| Journey                                                              | Automated evidence                                           | Status                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Browse home, collection and trip in 7 locales, switch language       | `languages.spec.ts` ×7                                       | Passed (mobile)                                 |
| Nonce CSP on success, redirect and dotted responses                  | `runtime.spec.ts:6`                                          | Passed                                          |
| Proxy, sitemap, media negotiation, private boundaries                | `runtime.spec.ts:46`                                         | Passed                                          |
| Signed preview in 7 locales, no token in referrer, no draft bookings | `runtime.spec.ts:145`                                        | Passed                                          |
| **Private tour booking → quote → persisted request → staff email**   | `private-booking.spec.ts:7`, `runtime.spec.ts:180`           | **Failed against stale images (QA-01)**         |
| Same image in a second environment                                   | `runtime.spec.ts:131`                                        | Not runnable: needs the second stack on :4990   |
| Admin login, 2FA, RBAC, writes, undo                                 | `tests/admin/*`, integration tests                           | Integration level passed; browser level not run |
| Duplicate submission                                                 | Integration: receipt replay and conflict                     | Passed                                          |
| Price change → public page → Undo                                    | `cache-revalidation.test.ts` (unit) plus admin e2e (not run) | Unit passed                                     |
| Erasure / export                                                     | Integration                                                  | Passed                                          |

## QA-01: The booking journey is not verified against the current source

- **Severity:** High (release blocker) · **Status:** Confirmed · **Confidence:** High
- **Evidence:** The verify images `stella-local/stella-web:integration` were created `2026-11-19T00:22Z`. `apps/web/src/components/country-picker.tsx` is untracked and dated `2026-11-23 18:27`, and `request-sheet.tsx` was modified at `2026-11-23 19:44`, during this audit, which means **the tree is being edited concurrently**. The tests wait for `[data-country-option=EG]`. The running image renders a native `<select>` ("Choose your country") instead (`test-results/integration-runtime-real-b-…/error-context.md:252`).
  ```
  private-booking.spec.ts:60   locator.click: Test timeout of 180000ms exceeded
    waiting for getByRole('dialog').last().locator('[data-country-option=EG]')
  runtime.spec.ts:193          same locator, 30000ms timeout
  ```
- **Interpretation:** This is not evidence of a product bug. It is evidence that **the most important business journey has no passing end-to-end run on the code that would ship.**
- **Fix:** Freeze the tree, commit, rebuild all three images from that SHA (`pnpm infra:verify:setup` and the CI build steps), and rerun the CI browser steps for mobile, tablet and desktop, plus `tests/admin/dashboard.spec.ts`.
- **Verification:** A CI run on the pushed SHA with all browser steps green.

## QA-02: Second-environment test needs extra local setup

- **Severity:** Informational
- `runtime.spec.ts:131` fails with `ECONNREFUSED ::1:4990` when the second verification environment is not running. CI provisions it through `infra:verify:setup`. Document this in `docs/integration-verification.md` for local runs.

## Additional QA observations

- **State transitions:** Request status is a free enum update (`requestPatchSchema`). Any status can move to any other, for example `completed → new`. This is acceptable for a small team, and every change is audited and revisioned with undo, so it was not raised as a defect.
- **Missing validations:** None found. All admin bodies are `strictObject`, and public bodies are capped (name 80, hotel 150, notes 1,000, JSON body limit 128 KB).
- **Permission consistency:** The RBAC table is the single source (`packages/shared/src/admin.ts`). Both the UI and the API use `can()`. Integration tests cover role denial.
- **Performance budget:** The project's own records show mobile LCP of about 3.1–3.2 s against a target under 2.5 s (`QUESTIONS.md:28-29`). Not re-measured, and still open.
