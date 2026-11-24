# Changelog

## Unreleased

- **Docs** — README covers the Node 22/pnpm/Playwright toolchain on machines with a newer default Node; the security plan records decisions on the audit's low-severity items (SEC-03 lockout, SEC-04 in-memory limits, SEC-06 FFmpeg), the Git-history media and narrow-phone calendar targets (audit 2026-11-24).

- **Dependencies (PR #2)** — vitest 4.1.12 + scoped esbuild/minimatch/glob overrides; `pnpm audit` clean including dev dependencies (audit SEC-01).

- **Toolchain** — pnpm overrides and the Next.js patch move from `package.json` to `pnpm-workspace.yaml`, where every pnpm version reads them, and `.npmrc` enforces the Node 22 engine (audit QUAL-02).

- **Privacy: erasure survives restores** — each erasure records a keyed hash of the phone number in a new `privacy_erasures` ledger (migration 0012). The API re-applies it at start-up, so restoring a backup cannot bring erased requests back; later bookings by the same customer are kept (audit SEC-10, DB-01). Runbook updated.

- **Security hardening** — sealed TOTP secrets and emailed setup/reset tokens use purpose-bound encryption context, and page-preview and bulk-price tokens use purpose-bound signatures; existing TOTP secrets keep working and are re-sealed on next use (audit SEC-06). The per-phone booking cap counts only recent requests not marked as spam, so marking junk as spam unblocks a customer at once (SEC-08). Admin search treats %, _ and \ literally (SEC-09). Media authorization decisions are cached for 10 s and cleared after every admin write, so dashboard withdrawals still apply immediately (INF-03). Caddy no longer matches `poster.webp`, which the API never serves (BUG-04).

- **Database indexes** — migration `0011_operational_indexes` adds indexes for session revocation, rate-bucket and outbox cleanup, pending outbox dispatch, request items by trip and audit paging by time (audit DB-04).

- **Database and media reliability** — the API and worker database roles get server-side `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout` limits (audit DB-02). Media encoding no longer runs inside an open transaction; it is serialized with a session advisory lock (BUG-02). A failed upload transaction removes the original it had already moved (BUG-03).

- **Operations: no silent production gaps** — production health checks (and therefore deploys) fail when the encrypted off-site backup is overdue, unless the operator has explicitly set `OFFSITE_BACKUP=pending` in `compose.env`; a missing operator alert webhook is reported as a warning. Both opt-outs are temporary until restic and the webhook are configured on the server (TODO in `docs/RUNBOOK.md`; audit INF-01, INF-02). A production unit failure without a webhook is logged as critical and fails. The server setup guide adds an off-host uptime monitor. `deploy-release.sh` no longer trips shellcheck SC2174.

- **CI/CD hardening** — GitHub Actions are pinned to commit SHAs (Renovate keeps them current), manual release runs can only deploy `develop`, and the standalone and release-called checks no longer share a concurrency group that could cancel a deploy (audit SEC-04, SEC-05, CI-01).

- **Operations: diagnosable failures** — unexpected API errors now log the route pattern and a redacted error summary (class, message, PostgreSQL code and constraint, top stack frames). Worker job, queue and outbox failures log the same summary; previously job failures were not logged at all (audit OPS-01). Request bodies, headers and cookies are still never logged.

- **Security: public read limits** — the web proxy routes (`/api/trips`, `/api/trip-story`) now have a per-visitor limit and their own API quota, so they can no longer exhaust the quota page rendering depends on (audit SEC-01). The public read limiter evicts its oldest entries instead of refusing everyone when full (SEC-02), and IPv6 callers are limited per /64 (SEC-03). Caddy overwrites `X-Forwarded-For` towards the web container and waits up to 10 s for it during a release.

- Keep My trip reachable after adding tours and preserve the guest’s custom tour order in the itinerary, quote and request.
- Open bookings from tomorrow in Cairo time, make the phone country picker searchable and validate pickup areas against the listed options.
- Show the priced tours subtotal separately when the booking total is on request.
- Give trip inclusions and extras clearer headings, icons and scannable lists.
- Restore the previous panel and its scroll position on Back without replaying its entrance.

- Sharpen the Taba–Aqaba ferry and Taba–Eilat road story maps with locally bundled Sentinel-2 imagery.

- Show published trip stories on the homepage after private tours, with direct viewer access.

- Replace the seven homepage intro videos with Pexels footage and frame each
  clip for desktop and mobile. Add a hero-only catalog sync for existing sites.

- **Trip stories** — add the multilingual route viewer, draft editing and trip
  publication for six journeys across seven catalog entries.

- **Requests and exports**: match both date bounds against the same excursion
  and use the same filters for the list, count and CSV. Full CSV export
  traverses results in bounded batches.
- **Seven-language publication**: enforce complete core copy when publishing,
  preserve editorial translation provenance and support editing and undoing
  trip and itinerary time labels. Machine translation accepts only enabled
  additional locales. Localize booking confirmations, staff booking and
  authentication mail, pickup labels in staff replies, schedule notices and
  the public recovery page.
- **Calendar and page delivery**: focus the calendar on a date error and use
  native keyboard-accessible date buttons. Load authenticated admin screens
  on demand, use the actual media rendition widths and deliver smaller brand
  assets. Load saved itineraries in one bounded catalog request.
- **Cache and search indexing**: scope catalog invalidation to affected trips,
  packages and collections, group bulk price invalidation, and bound session
  activity writes. Return a retryable sitemap error during a catalog outage
  and only index published legal pages.
- **Deployment and notifications**: prepare read-only operations files per
  commit, ship standalone web and dashboard images, and retry push delivery
  per subscription. Systemd can send a generic incident event to an operator
  webhook configured on the server.
- **Admin save and price controls**: preserve edits typed while a save is
  pending and keep failed sections open for retry. Give inline price drafts
  explicit Save and Cancel controls. Keep bulk preview submissions compact
  and detect changes to the price scope before applying them.
- **Safe booking retries**: return the original booking reference and
  confirmation when the same request is retried. Save one booking and one
  notification even if requests overlap or the first response is lost.
- **Booking stay dates and WhatsApp numbers**: count through the final day
  of the last tour when checking the stay. Normalize local numbers and pasted
  international numbers using country dialing rules. Show the exact number
  sent to staff, with phone guidance and errors in all seven core languages.
- **Date-aware booking quotes**: resolve seasonal rates on each tour’s
  service date, use the selected price ID and save the quoted dates and
  whole-euro amounts. Show the revised quote before saving if a rate changes
  during booking. Localize the quote and review messages in all seven core
  languages.
- **My Trip recovery and booking formats**: show available saved tours even
  when another tour has been withdrawn. Let guests remove withdrawn tours or
  retry after a temporary catalog failure. Require Private for the whole
  itinerary when any selected tour is private-only. Localize the explanation
  and the My Trip page title in all seven core languages.
- **Catalog seed and trip return times**: accept itinerary stops with unknown
  times and preserve their order on repeat seed. Import the 19 supplied trip
  return times, fill missing return times on existing records, and display
  localized times on the public trip page in all seven core languages.
- **Browser release checks**: use current booking calendar and country
  controls, serve authored translations in the isolated catalog fixture, and
  add seeded site, admin and language checks to CI.
- **Live hero validation**: apply publish checks to live edits and keep
  incomplete legacy slides from interrupting catalog reads or bookings.
- **Media withdrawal and upload recovery**: check current rights before
  serving public variants, including previously generated versions. Restore
  failed uploads by re-uploading the same file. Recover an archived upload as
  a private asset pending a fresh rights decision.
- **Runtime database permissions**: give the API and worker explicit database
  grants. The worker can send existing notifications, process media, translate
  content, and run retention jobs with no direct access to password hashes,
  MFA secrets, sessions, reset tokens, or the full audit history.
- **Production dependency advisory**: remove the unused next-intl extraction
  watcher from the public app. Install production dependencies separately in
  release images so development-only dependencies stay in the build stage.

- **Admin sign-in and mobile fixes** (2026-11-15):
  - Sign-in errors say what went wrong: wrong email/password, wrong or
    expired code, expired link, too many attempts, or server unreachable,
    instead of always "Email, password or code is incorrect". The error sits
    above the button; no duplicate toast. New strings in all seven languages.
  - Dev: opening the admin at `127.0.0.1:3001` (the address `next dev`
    prints) now redirects to `NEXT_PUBLIC_ADMIN_URL` (`localhost:3001`).
    Before, the API rejected the origin (`INVALID_ORIGIN`) and sign-in failed
    as if the password were wrong.
  - Phone sign-in screen: compact logo row so the form starts near the top.
    Admin font uses `display: optional` (preloaded) so text no longer swaps
    font mid-load.
  - Trip and package editors: **Archive / Restore** in the "More actions"
    menu (with confirmation), not only inside the status pill.
  - Request detail: the WhatsApp button matches the website (WhatsApp logo,
    WhatsApp green `#25D366`, dark text, contrast 7.8:1).
  - Activity: status changes use their labels ("Confirmed → Completed"), and
    duplicates name the original: “duplicated trip “X” as “X (copy)””.
  - Phone lists: one **Filters** button (with the active count) next to the
    search box on Trips, Packages, Prices, Media and Translations
    (`components/ui/filter-bar.tsx`); wide screens keep the one-row filters.
  - Floating actions (New trip, Change prices together, Upload, …) no longer
    cover the last row: the page gets room below the list.
  - Translations on phones: one card per text (where, state, English,
    translation, approve) instead of an 860px table with sideways scroll;
    "Select all on this page" is labelled.
  - Editors on phones: no app top bar or bottom nav, slimmer language/section
    bars and a one-row save bar. Fixed bars went from ~340px to ~160px of a
    667px screen.
  - Tablet rail: the nav scrolls on short screens instead of running under
    the account button.

- **Official contact channels** (owner, 2026-11-14): call number
  +20 109 598 9932, email stellasharmtour@gmail.com, Instagram, Facebook,
  TripAdvisor and Google Maps are seeded into Settings. The seed fills them
  into existing databases only where the field is still empty.
  Contact page shows call/email cards (icon, label, value), a clickable office map (static
  OpenStreetMap image with a pin, `public/map/office.webp`, credited; an
  admin `map_image` still replaces the picture) that opens the exact pin in
  Google Maps, and a "Follow us" list. The footer adds Call, Email and round
  social icons (the map icon also opens the pin). New UI strings in all
  seven languages. Admin → Settings → Social adds a "Google Maps" platform.
- **Hero chip row** (collection pills over the video): swiping the chips
  scrolls them instead of changing the slide, mouse users can drag the row,
  the active chip scrolls into view, and the edges fade while more chips are
  hidden.
- Production owner login (and password-reset address) is now
  stellasharmtour@gmail.com in `infra/configure.mjs`.

- **Admin rebuilt** to `docs/stella-admin-rebuild-spec.md` (details and every
  deviation in `REBUILD_NOTES.md`):
  - New shell: grouped sidebar (Sales, Catalog, Website, Languages, Admin),
    icon rail on tablets, bottom nav + grouped “More” on phones, account menu
    with the language switcher, new **Overview** page (stats + “needs
    attention” links).
  - Lists are tables (phone: compact rows) with search, filters, counts,
    filtered-empty states and drag/keyboard reordering that saves once with
    Undo. Editors are full pages with section nav, **one language bar** with
    per-language status, **one Save** (Ctrl/Cmd+S), and an unsaved-changes
    guard for links, back button and tab close. No `window.confirm` anywhere:
    every publish/unpublish/archive/cancel/spam/erase uses a real confirm text.
  - Requests inbox: tabs with counts (incl. Cancelled/Spam), search by trip
    name, date/assignee filters, split view on desktop, **each trip on its own
    date**, “Same day” warning, WhatsApp prefill with per-trip dates.
  - Trip editor: Format & audience without contradictory controls, weekday
    chips (labels generated in all 7 languages), price table with one main
    price (no ±€5 buttons), sortable day plan, “What’s included” sub-lists,
    media picker with thumbnails, Google preview, human-readable history with
    Restore. Package day-by-day builder. Prices page with inline edit and a
    fixed bulk dialog (scope, %/€, rounding, before/after preview).
  - Media library (drop to upload, rights/usage filters) and media page with a
    focal point that only saves on Save and a trim timeline. Hero editor with
    Cairo-time schedule and a phone/desktop preview. Homepage draft/publish,
    Pages & FAQ, Translations table (Ctrl+Enter approve, bulk approve),
    language toggles, Settings with privacy tools, Team, Activity sentences,
    My account (2FA setup can no longer fire 4 requests).
  - ~1,050 new admin strings in EN/IT/ES/FR/DE/RU/TR (`data/i18n/admin-rebuild.json`).
- API (additive): archive/unarchive (trips, packages, collections, hero, FAQ),
  collection unpublish, request counts + trip-title search + filters,
  idempotent 2FA setup, self-change/last-owner guards, stable sorting,
  no-op saves no longer write audit rows, migration `faqs.archived_at`.
  Fixed correlated subqueries that made request trip titles always empty.
- Admin password fields (sign in, reset, re-auth) have a show/hide button
  (44 px, translated label in all seven languages, `aria-pressed`).
- `DEV_SIMPLE_ADMIN_LOGIN` (API env, default `false`): on a developer machine the
  admin login is email + password only, with no 2FA enrolment, login
  rate limit or lockout. The API refuses
  to start with it outside `NODE_ENV=development`, so staging and production
  keep mandatory owner/manager 2FA. Covered by a config test.
- Footer redesigned (mobile first): brand and address (links to Contact) once,
  two labelled columns (Journeys, Contact with WhatsApp and FAQ), then the
  no-payment note, legal links and a © line. Removes the repeated brand name and
  the misleading ↗ on an internal link. Uses existing UI strings only, checked
  in all seven languages at 390 px (no overflow, 44 px targets, axe clean) and
  at 1440 px.
- Fixed a hydration mismatch on every page (JSON-LD `nonce`, which browsers hide
  after parsing) and a Next image warning for media without size variants.
- "Beyond Egypt" now uses the licensed stock photo `sinai-mountains.jpg` as its
  cover (catalog for fresh setups; linked in the local dev DB). Its alt text
  already exists in all seven languages. The Petra clip stays unpublished
  (`unknown` rights) and the collection's hero slide remains a draft.

- File 08 review: ticked I1–I8 (already implemented, evidence in earlier
  verification files) and recorded font gaps for scripts outside the launch set.
  The web middleware called `/v1/public/locales` on every page request and that
  endpoint built the full catalog (~19 ms inside Docker). It now reads only the
  two i18n settings rows (~8 ms) and the middleware caches live locales for
  60 s (10 s retry after a failure, keeping the last known list).
- Mobile rendering budget work (2026-11-14), measured with the local QA stack:
  client components now receive only the fields they render (cards drop
  gallery/itinerary/items/notes; the layout shell gets six site fields instead
  of the whole site; navigation collections drop images), home HTML 198 → 164 kB;
  Manrope/Marcellus split by script with `unicode-range` (Latin-only preload);
  the language menu uses the system font so a closed menu no longer downloads
  Cyrillic/Latin-Extended subsets; `content-visibility: auto` on below-the-fold
  home sections and the footer (first layout 95 → 35 ms); all images below the
  hero are deferred; off-screen gallery videos get their poster only when
  visible. Lighthouse 3-run medians: home mobile 92 → 95 (LCP 3.24 → 2.87 s),
  trip 94 → 95 (3.12 → 2.97 s), desktop 98 → 99 (1.17 → 0.90 s), CLS 0,
  accessibility 100. The strict <2.5 s mobile LCP is still not met; see
  `docs/build-order-verification.md`.

- File 07 reconciles the old scaffold checklist with seven current workspaces,
  frozen Node 22/pnpm installation, app readiness, PostgreSQL/Mailpit and local
  Husky setup. CI now enforces maintained-source formatting; generated Drizzle
  metadata and OpenAPI snapshots are not rewritten by the formatter.
- Replaced CI's whole-checkout Gitleaks mount with offline source/history
  exports and disabled checkout credential persistence. Full-history scanning
  mirrors all refs without checkout config/current env files; committed ignored
  paths remain scannable. Four real Git/Gitleaks regressions cover clean,
  deleted remote-only secrets, empty and shallow histories with redacted logs.
  Local frozen install, 105 unit tests, lint/typecheck/build, workflow validation
  and dependency audit pass. See `docs/scaffold-verification.md`; no remote CI
  or deployment ran. Stop before file 08; file-06 launch gaps remain open.

- File 06 reconciles M0–M7 and checks the already implemented public M2/M3 work;
  adds a five-command fresh setup with a private initial-owner link, current
  add-trip/deploy/backup handoff and 259 real-stack screenshots (187 public,
  72 synthetic admin). Existing configuration and data are preserved.
- Corrected responsive image candidates to match worker outputs and separated
  home reveals from dialog imports (Linux home First Load JS 146 → 132 kB).
  Fixed genuine no-JS trip rendering by resolving Private on the server and
  removing the public streaming loading boundary; content, prices and WhatsApp
  now render without JS in all seven languages. Private URL/booking preselection
  works in pages and intercepted overlays.
- Local file-06 checks: 105 unit and 52 PostgreSQL tests, all 46 distinct public
  browser cases verified (45 full-run passes plus the stabilized 21-locale/width
  rerun), 14 admin browser passes, builds/typecheck/lint and clean dependency
  audit. Added repeatable Lighthouse gates that fail on missed strict budgets:
  final three-run medians 92/100 home mobile, 93/100 trip, 98/100 desktop, CLS 0.
  Mobile LCP remains 3.1–3.2 s against <2.5 s; real staff/device, content/legal/
  security and remote deployment acceptance remain open. Evidence:
  `docs/build-order-verification.md`. Stop before file 07.

- Implemented file 05 dashboard in EN/IT/ES/FR/DE/RU/TR: real auth/MFA/setup/reset,
  mobile tabs/desktop navigation, install/offline shell, requests/privacy,
  translated trip sections, prices/bulk/history, collections/packages, media,
  hero ordering/scheduling/preview, homepage/pages/FAQ, review queue/languages,
  owner settings/users, audit/history and account controls.
- Added exact revision IDs for accessible Undo, editor review drafts, preserved
  page/duplicate translation provenance, MFA policy/session revocation, private
  generic Web Push with its own durable queue, and poster-frame controls.
  Fixed nullable/creation restores and price-confirmation edge cases. Runtime
  admin URLs/config/readiness now support actual built-image promotion.
- Local checks: 105 unit, 52 PostgreSQL and 14 dashboard browser tests, including
  real owner UI → public price/hero revalidation and Undo, actual image upload,
  keyboard ordering, seven-language saves and automated accessibility checks.
  Root/admin/image builds, lint/typecheck and production dependency audit pass.
  Public container regression: 37 pass. Added a pinned Next.js repeat tag
  invalidation maintenance patch, proved failing before/passing after against
  the real cache, and repeated actual publication/Undo twice in one process.
  Admin ZAP baseline has no High; the inline-style Medium remains a launch
  review gate. Real two-staff usability, HTTPS push/SMTP, authenticated staging
  security, legal/native review and VPS acceptance remain open. Evidence:
  `docs/admin-verification.md`; no remote deployment or next-file work is claimed.

- Completed file 04's local implementation/audit phases: HMAC-backed session
  revocation, race-safe password/MFA transitions, revoke-all and bounded device
  recognition with seven-language new-device emails. Staff must log in again
  after this upgrade; rotating SESSION_SECRET revokes existing cookies.
- Added reauthenticated phone-specific privacy export/erase, historical copy and
  pending-notification scrubbing, calendar-month retention and explicit immutable
  anonymization state; tightened CSV formula escaping and codec child environments.
- Hardened 128-bit HTML nonces/fallback CSP, streaming body bounds/deadlines,
  exact JSON type and trusted proxy/origin validation. Prepared unpublished,
  idempotent privacy drafts in all seven languages without provider calls.
- Local security acceptance: 101 unit, 43 DB and 37 browser tests (three widths,
  seven locales), eight operational cases, actual encrypted restore, builds,
  dependency/source/config checks. ZAP completed with warnings: no High, one
  Medium type for the plan's permitted inline styles. Real staging/VPS/admin UI,
  legal publication, off-site restore and that launch finding remain open.
  Evidence: `docs/security-verification.md`; subsequent dashboard work is recorded above.

- Completed file 03's local integration phases: operational admin scaffold and
  dependency readiness; runtime browser/API/canonical/sitemap URLs; private signed
  draft previews with seven-language status copy and disabled draft bookings.
- Added non-root/read-only Docker images, private production PostgreSQL roles,
  Caddy TLS/security/AVIF negotiation, authenticated isolated staging, SHA-based
  deploy/rollback with proxy snapshots, private backups, fail-closed staging scrub,
  optional Cairo refresh timers, restic and operator monitoring/runbooks.
- Prepared CI/release/Renovate, privacy-limited Sentry/GlitchTip-compatible code
  events, opt-in self-hosted analytics guards and seven-language owner summaries.
  No external translation, error, analytics, production mail or storage service
  was used. Local acceptance: 96 unit, 33 DB integration, 34 container browser,
  8 simulated operational cases, actual staging auth/encrypted restore, root/image
  builds and source/config checks. Lighthouse home 93/100, trip 94/100; strict
  LCP/real VPS/remote CI/admin UI and operator go-live gates remain open.

- Recorded the standing owner rule: every future content/UI edit includes all
  seven core locales together; shared behavior/layout/prices are verified in
  all seven. Core translations are authored directly without a translation
  subscription, and newly missing/stale translations block completion.

### Complete seven-language content — 2026-11-12

- Authored all existing site content in IT/ES/FR/DE/RU/TR alongside EN: 374
  translated source phrases plus 35 language-independent sources, covering every
  tour, draft package, collection, home block, itinerary/item, note and image alt.
  Stored the translations in the repository and an idempotent DB seed; human
  content wins. No translation service, subscription or provider key is required.
- Fixed hero text inheritance to resolve translations from its collection and
  localized departure/itinerary labels and confirmation plurals/pickup labels.
- Changed language links to document navigation so HTML language/direction and
  locale fonts update together; added comprehensive real-language browser checks.

### Backend and revised plans — 2026-11-12

- Applied the seven-core-language change (EN/IT/ES/FR/DE/RU/TR), added FR/DE/TR
  UI drafts, phone defaults, core routing/switcher handling and parity/browser checks.
  Corrected stale German-auto acceptance examples; native review remains pending.
- Implemented file 02 in phases B1–B6: self-hosted PostgreSQL schema/migrations,
  real idempotent catalog/media seed, Hono public/admin API, server booking prices,
  atomic snapshots/outbox, authentication/MFA/CSRF/RBAC, draft publication/Undo,
  price bulk previews, hero/homepage controls, audit/revisions and signed API previews.
- Added private quarantine/magic-byte upload validation, HEIC fallback decoding,
  image/video variants, rights gates, AVIF/Range delivery and versioned hashes.
  Added pg-boss SMTP/revalidation/translation/retention/cleanup/weekly price jobs.
- Verified 86 unit and 29 PostgreSQL integration tests, OpenAPI snapshot, local
  real-stack browser booking/SMTP and authenticated price/hero invalidation/Undo.
  Local Lighthouse: optimized home 93/100 and trip 93/100. Strict LCP <2.5 s,
  native content approval and production acceptance stay open. See backend evidence.
- Added least-privilege development compose roles, unique local config generator,
  pinned test/password data setup and API/worker documentation. File 03 and admin
  UI remain outside this handoff.

### Earlier frontend implementation

- Reviewed project plans, catalog and asset boundaries; added a phased M0
  execution file honoring the user's file-by-file handoff requirement.
- Recorded environment prerequisites and source inconsistencies for follow-up.

- Completed the overview scope/source review and added phases directly in
  `docs/00-overview.md`; recorded the user's numerical file order and mandatory
  handoff after each file.
- Incorporated current EN/IT/ES/RU, automatic-translation and admin hero-order
  requirements; corrected the overview link to `08-i18n-plan.md`.
- Initial workspace files preceded the order clarification. The public frontend
  has now been implemented and verified locally; DB/admin/deployment gates remain
  pending under the user's file-by-file handoff.
- Added the mobile-first Concept E public site: Private-first home, API-driven
  story hero, collections and trip overlays, desktop accordion/drawers, galleries,
  My trip builder, shared price/day logic, request sheet and confirmation contract.
- Added EN/IT/ES/RU dictionaries, live-locale discovery, honest language fallback,
  RTL layout, vendored fonts/licenses, SEO, CSP and protected revalidation endpoint.
- Kept production reads behind validated public API contracts. Added an isolated
  read-only catalog/media fixture; actual bookings cannot succeed without the API.
- Verified 29 unit/contract tests and 21 browser tests at 390/768/1440, production
  build, typecheck and lint. Local Lighthouse mobile: home 90/100, trip 95/100
  (performance/accessibility). Strict mobile LCP budget remains unmet; see
  docs/frontend-verification.md for evidence, limits and integration follow-ups.
