# Frontend verification and handoff

Current integrated evidence (2026-11-13) is in
[file 06 verification](build-order-verification.md) and its current real-API
screenshots. The fixture measurements below are historical; backend and admin
are now implemented. Strict mobile LCP and external launch acceptance remain open.

Verified locally on 2026-11-11 against a production Next.js build with Node
22.23.4, pnpm 10.34.9 and installed Chrome. This covers file 01 implementation.
The fixture results below are historical frontend evidence. On 2026-11-12 the
seven-core-language update was verified (30 frontend unit tests, 24 browser
tests, 54 screenshots). Backend implementation and real-API verification now
have a separate [handoff](backend-verification.md); admin screens and deployment
remain later files. Core dictionaries are drafts pending native approval.

## Checks

| Check                                  | Result                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm --filter @stella/web build`      | Pass; home first-load JS 147 kB as reported by Next                                  |
| `pnpm test`                            | 29 pass: pricing, day planning, validation, hero filtering, messages and environment |
| `pnpm typecheck`                       | Pass                                                                                 |
| `pnpm lint`                            | Pass                                                                                 |
| `pnpm test:e2e`                        | 21 pass across 390×844, 768×1024 and 1440×900                                        |
| `pnpm audit --prod --audit-level high` | No known vulnerabilities at verification                                             |

Browser coverage includes Private selection/request preselection, real failure
display, stubbed confirmation contract, localStorage persistence, keyboard/Esc
and focus return, collection/trip/builder interception, no-JavaScript trip content
and WhatsApp link, reduced motion, core languages, RTL, invalid-locale 404,
unauthorized revalidation and invalid public query rejection. Home/trip axe checks
for WCAG 2/2.1/2.2 A/AA report no violations; this is not a full manual
screen-reader certification. No runtime page errors occurred in the discovery flow.

The test preflight requires both web health and the explicitly identified fixture
health. An initial resumed run without the fixture failed at `/ar`; starting the
fixture and rerunning resolved it. Cached core content alone is not accepted as
proof of a healthy integration.

## Lighthouse

Lighthouse 13.6.0, navigation mode, performance and accessibility only. Mobile
uses the default simulated mobile throttling; desktop uses `--preset=desktop`.
These are loopback fixture measurements, not production field measurements.

| Page/profile                     | Performance | Accessibility |    LCP |     CLS |     TBT |
| -------------------------------- | ----------: | ------------: | -----: | ------: | ------: |
| `/en`, mobile                    |          90 |           100 | 3.62 s | 0.00086 | 40.5 ms |
| `/en/t/quad-bike-safari`, mobile |          95 |           100 | 2.86 s | 0.00025 |   35 ms |
| `/en`, desktop                   |          97 |           100 | 1.24 s | 0.00038 |    0 ms |

Run timestamps (UTC): home 16:02:27, trip 16:03:02, desktop 16:03:57.
Full local JSON reports are in ignored `.local/qa/lighthouse-{home,trip,desktop}-final.json`.
The score gates (mobile ≥90/100; desktop ≥95) pass. The stricter mobile
**LCP <2.5 s budget does not pass** and remains open. CLS <0.05 and the Next home
JS budget pass. TBT does not establish field INP; INP <200 ms needs integrated
device/field verification. Confirm video-after-poster timing with approved real
video variants; the fixture does not publish unconfirmed clips.

The Windows build emitted an empty Next font preload manifest, despite local
fonts configured for preload. The installed Next 15 plugin identifies its loader
using a slash-specific path match; that is a likely platform-specific contributor,
not a proven explanation for the entire LCP gap. Recheck the manifest and timings
on the target Linux build. No dependency internals were patched to alter the score.

Example rerun after starting the isolated fixture and production preview:

```powershell
pnpm exec lighthouse http://127.0.0.1:3000/en --only-categories=performance,accessibility --output=json --output-path=.local/qa/lighthouse-home-final.json --chrome-flags="--headless --no-sandbox" --quiet
```

## Visual evidence

54 frontend screenshots in [screens](screens/) cover home, collection, private collection,
packages, direct builder, builder drawer, trip, request sheet, contact, FAQ,
legal empty state and EN/IT/ES/FR/DE/RU/TR/AR layouts at the three viewport widths.
The source references are `reference/mockup/E-Mobile.dc.html` and
`reference/mockup/E-Home.dc.html`; prototype runtime and invented sample content
are not imported. Key examples:

- [Mobile home](screens/mobile-home.png), [trip](screens/mobile-trip.png),
  [request sheet](screens/mobile-request.png).
- [Tablet collection](screens/tablet-collection.png).
- [Desktop home](screens/desktop-home.png),
  [My trip drawer](screens/desktop-builder-drawer.png).
- [Russian](screens/mobile-russian.png), [RTL fallback](screens/mobile-rtl.png).

## Isolation and integration limits

Production code consumes the validated schemas in
`packages/shared/src/public-contract.ts` and the real API URLs. It does not import
`data/catalog.json`, reference files or fixtures. API outages show honest
unavailable states. Price computation and booking schemas are shared with the
future API; authoritative persistence and recomputation still belong there.

`tests/fixtures/server.mjs` serves supplied catalog facts and processed stock
images on loopback :4100. It rejects every booking POST with 501. Only Playwright
intercepts a request to exercise a successful response contract. No request was
stored, email delivered or WhatsApp message sent. Never deploy the fixture or
the preview environment. See [public contract](frontend-api-contract.md) and
[web setup](../apps/web/README.md).

Core dictionaries need native-speaker approval. Auto-locale tests exercise
English fallback, actual `lang` marking and RTL structure; they do not prove
translation-provider output, admin coverage, or every script's font support.
FAQ/legal consumers render honest empty states until approved content exists.
Hero order/schedules and prices are API-driven, but admin updates within 60 s,
real processed media rights and all request-side security gates require later
integration. Self-hosted Umami has event hooks only until deployment is configured.

No remote is configured, so remote CI, PRs, staging, real-device/assistive-tech
checks and production Lighthouse have not run. The global M0–M7 gates stay
pending; frontend checkmarks describe implementation/local QA, not a launched site.
