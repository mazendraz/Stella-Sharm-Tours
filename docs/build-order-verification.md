# File 06 — build-order reconciliation and handoff

Local work, 2026-11-13. The owner authorized file 06 after the dashboard. Stop
before file 07. This is a local acceptance record, not a production launch.

## Scope and changes

- B1: reconciled the M0–M7 checklist with files 01–05 and their verification.
  M2/M3 implementation had not been checked in the aggregate build order.
  Human, remote and production acceptance remain separate.
- B2: aligned Next image candidates with the worker's actual variant filenames
  (160/480/768/1200/1920), rather than advertising 640w for a 768px output.
  Split home-page `Reveal` from the dialog primitives, so the home no longer
  imports Radix merely to animate sections. Motion and wording are unchanged.
  Linux Next's home First Load JS fell from 146 kB to **132 kB**.
  The new no-JavaScript gate also exposed real trip content hidden in streaming
  Suspense output. Removed the public catch-all loading boundary and unnecessary
  inner boundaries, and resolve the Private query flag in server pages, including
  intercepted trips. Initial trip HTML now exposes content/prices/WhatsApp
  without executing a reveal script; the seven-language no-JS regression passes
  at all three widths, including direct Private links. Booking still needs JS.
- B3: exercised the real API/PostgreSQL/worker in the existing isolated local
  containers, including seven-language Private requests and responsive public
  page screenshots. Tests never click WhatsApp or contact real recipients.
- B4: added a five-command fresh setup and concrete add-trip, deployment and
  backup instructions to the root README. Generated local configs save the
  initial owner setup URL privately. Existing configuration/data are preserved.
  Fresh config generation/repeated-run refusal was verified in a separate,
  ignored temporary directory, not against the current checkout.

Core content/UI remains EN/IT/ES/FR/DE/RU/TR, directly authored without a core
translation service. No text, prices, rights or trip facts were invented by
these performance changes. Optional provider languages are not enabled merely
to manufacture a passing acceptance result.

## Performance — three independent runs per profile

Lighthouse 13.6.0, installed Chrome, Linux production image behind the loopback
Caddy gateway `http://localhost:4983`. Mobile uses the standard simulated
throttling, not unthrottled desktop emulation. No browser tests/builds ran during
the final nine audits. Each value below is the median of three; all nine
accessibility scores were 100. Local hardware variance is not field evidence.

| Page/profile | Performance | Accessibility |     LCP | CLS |   TBT |
| ------------ | ----------: | ------------: | ------: | --: | ----: |
| Home/mobile  |          92 |           100 | 3.233 s |   0 | 87 ms |
| Quad/mobile  |          93 |           100 | 3.109 s |   0 | 95 ms |
| Home/desktop |          98 |           100 | 1.172 s |   0 |  0 ms |

The final mobile home scores were 92/93/92. Before the streaming correction the
post-split scores were 93/94/93, compared with 86/92/92 before the split. This
does not isolate every contributor or prove a field speedup; the SSR fix proves
no-JS usability, not faster LCP. The earlier single cold baseline was 84.
Report all runs, not only the best. The score gates pass on the final repeated measurements; the stricter
**mobile LCP <2.5 s gate still fails** on home and trip. No field INP claim is
made. Approved production videos and first-video-byte timing still need real
device/production verification.

Run `pnpm verify:performance` with the guarded local QA stack already running.
It runs three audits per profile and writes every report plus `summary.json`
under ignored `.local/build-order/performance/`. Exit **1** is intentional when
any score or strict rendering budget fails; a good score cannot hide failed
LCP. `pnpm verify:performance 1` is a diagnostic single run, not repeated
acceptance. Primary references: [LCP optimization](https://web.dev/articles/optimize-lcp)
and [Next image candidates](https://nextjs.org/docs/app/api-reference/components/image).
The server-rendering change also follows the documented
[automatic loading/Suspense boundary](https://nextjs.org/docs/15/app/api-reference/file-conventions/loading)
and [server search parameters](https://nextjs.org/docs/app/api-reference/functions/use-search-params).

## Reproduce the local gates

Use Node 22/pnpm 10 and the existing isolated config; do not regenerate its
credentials or reseed another Compose project. See [integration setup](integration-verification.md)
and [dashboard checks](admin-verification.md). Start the existing QA containers,
or use the explicitly named `infra/docker-compose.verify.yml` override with its
private `compose.env`. Keep the same built web image on the promotion origin
:4990 for the runtime-promotion check.

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:integration
pnpm test:e2e:integration
pnpm audit --prod --audit-level moderate
node scripts/security-source-scan.mjs
```

The added inventory derives its routes from the real public API, asserts seven
collections/38 trips and rejects page/console errors or horizontal overflow.
The Private flow follows home → Sea → Private → Tiran → request → persisted
private/on-request snapshot → local Mailpit → confirmation. It runs in all
seven locales at 390×844, 768×1024 and 1440×900. Independent synthetic cases
share one QA proxy IP, so the test resets only request-IP quota rows inside the
explicitly guarded disposable DB between cases. Runtime quotas are unchanged;
rate-limit behavior remains covered by database tests.

| Check                       | Observed result                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Unit tests                  | 105 pass, 14 files; final source                                                           |
| PostgreSQL integration      | 52 pass, including actual restore/scrub                                                    |
| Public browser coverage     | 46 distinct passing cases at three widths; see run detail below                            |
| Admin browser               | 14 pass, 4 deliberate duplicate-width skips                                                |
| Build/typecheck/lint        | Root build 4 tasks; web rebuilt after SSR fix; 6 typechecks and lint pass                  |
| Production image            | Final web built/running non-root; identical image on QA and promotion                      |
| Production dependency audit | No known vulnerabilities                                                                   |
| Fresh setup                 | 5 configs, separate DB roles/private owner-file path; repeat-run refusal/preservation pass |
| Screenshots                 | 259 JPEGs: 187 public and 72 admin; [index](screens/README.md)                             |
| Readiness                   | Local web :3000, admin :3001 and API :4000 return 200                                      |
| Strict rendering budget     | Fail: mobile LCP is 3.1–3.2 s; the performance command exits 1                             |

The final full public run had **45 pass, 1 transient contrast failure, 2
deliberate duplicate-width skips**. The failure measured the request sheet
during its finite opening fade. The test now waits for opacity 1 before Axe,
without suppressing any rule; all **21** language/viewport checks then passed
on the same final application image. Thus all 46 distinct public cases have
passing final-source evidence across those runs; this is not described as a
single 46-pass command. Earlier new-flow locator failures were fixed before
the final full run. The complete Private flow passed 21 locale/viewport
scenarios, including actual DB snapshots and local email. No-JS checks cover
all seven locales in both Group/default and direct Private URLs at three widths.

Final web image shared by gateway/promotion:
`sha256:04a39817e848b884bdd51c8ca901ccd0f5de783deeba347f753e0dbe1931b2f6`.
Private reproducible logs are under `.local/build-order/` (`unit-final.log`,
`database.log`, `browser-final.log`, `languages-final.log`, `admin.log`,
`root-build.log`, `web-local-final.log`, `web-build-blocking.log`,
`typecheck-final.log`, `lint-final.log`, `audit.log`, `setup-check.log`,
`performance-acceptance.log`). They are not public deploy assets.

Final source scan: **355 publishable text files, no leaks detected**, zero
private environment files supplied, scanner network disabled. Binary screenshots
are outside this text scan; the exported admin images use synthetic QA accounts,
and inspected account/login images contain no passwords/setup secrets. The
website/admin/API local previews remain running; only the owned isolated QA
containers are stopped after verification. File 06 local phases are complete;
the failed strict LCP budget and external launch gates below remain open.

## Mobile rendering budget follow-up — 2026-11-14

Diagnosis with Lighthouse 13.6 traces plus a runtime hook on Lantern's LCP
simulation (`.local/lcp/lantern-debug.mjs`, private): the hero image itself was
small and early, but headless Chrome presents the first frame ~120 ms after the
main-thread paint, so the async Next/React scripts evaluate first and Lantern
counts them (and every byte loading in parallel) as LCP dependencies. With
JavaScript blocked entirely, LCP was still 2.8 s, so bytes in flight and the
first layout mattered too. Changes, all without altering copy, prices or the
seven-language behaviour:

| Change                                                                                                           | Effect observed                                                        |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Client props trimmed: `cardTrip`, `navCollection`, `shellSite` (`packages/shared/src/card-trip.ts`, unit-tested) | Home HTML 198 → 164 kB; trip LCP 3.12 → 2.97 s                         |
| Manrope/Marcellus per-script subsets with `unicode-range`; language menu in the system font                      | Preloaded fonts 73 → 40 kB; no Cyrillic/Latin-Ext fetch on Latin pages |
| `content-visibility: auto` on home sections and footer                                                           | First layout 95 → 35 ms; main-thread paint 223 → 146 ms                |
| Below-hero images deferred; off-screen video posters only when visible                                           | Offscreen images and a 37.5 kB poster no longer compete with the hero  |
| `/v1/public/locales` settings-only + 60 s middleware cache                                                       | ~19 → ~8 ms per uncached call, then cached                             |

Final three-run medians (same harness, `pnpm verify:performance`):

| Page/profile | Performance | Accessibility |     LCP | CLS |
| ------------ | ----------: | ------------: | ------: | --: |
| Home/mobile  |          95 |           100 | 2.866 s |   0 |
| Trip/mobile  |          95 |           100 | 2.965 s |   0 |
| Home/desktop |          99 |           100 | 0.896 s |   0 |

**The strict mobile LCP <2.5 s budget still fails.** What remains on the simulated
critical path is the React/Next runtime (~100 kB) plus next-intl's message
formatter (~13 kB) sharing bandwidth with the 64 kB hero AVIF; the hero is
already the correctly sized portrait variant. Closing the last ~0.4 s needs an
architectural change (e.g. fewer client components on the home page) or
production/field measurement, not another local tweak. The "Beyond Egypt"
collection has no approved cover, so its card shows the placeholder (data gap,
unchanged). Checks run on the final images: 108 unit, 52 PostgreSQL integration
and the integration browser suite (46 pass, 2 deliberate duplicate-width
skips, 4.6 min); typecheck, lint and
format pass.

## Launch acceptance still open

- Strict mobile LCP <2.5 s, field INP <200 ms, target Android/video/network
  measurements, native screen readers and installation/device acceptance.
- Two real staff phone usability sessions and their fixes; actual HTTPS Web
  Push and production SMTP delivery. Automated checks do not substitute for staff.
- Approve legal entity/policies and media rights/source records; native review
  of the directly authored seven languages. Draft/unknown content stays private.
- Real domain, VPS hardening, DNS/TLS/security headers, staging authenticated
  ZAP and the existing Medium inline-style policy review. No rule was suppressed
  or relaxed to claim a security pass.
- Remote Git/PR/branch/environment protections, actual Actions/GHCR deployment,
  named operator accounts, off-site backup credentials and verified restore,
  monitoring recipients and alert delivery. This checkout has no commits/remote;
  no milestone PR, remote CI run or production release was fabricated.

Assign the owner/operator responsibilities in [OWNERS](OWNERS.md), follow
[RUNBOOK](RUNBOOK.md), and retain the unresolved items in [QUESTIONS](../QUESTIONS.md).
Remaining gates are not waived by local file completion.
