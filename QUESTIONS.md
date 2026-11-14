# Open items and implementation findings

Defaults in `docs/DECISIONS.md` remain authoritative. These notes do not reopen
resolved prices or require answers before independent work can continue.

## Current scaffold and launch handoff — 2026-11-13

File 07 update: scaffold/tooling acceptance is recorded in
`docs/scaffold-verification.md`. Frozen install, formatting, local hooks and
offline source/history scanner artifacts are verified; real project history and
remote Actions/PR/branch protection remain unverified because no commits/remote
exist. File-06 launch findings below are unchanged. Stop before file 08.

This section supersedes the historical future-admin/integration notes below.
The website, API, worker, PostgreSQL and seven-language dashboard are implemented
locally. File 06 reconciles the checklist, records fresh real-stack evidence and
prepares the final local handoff; see `docs/build-order-verification.md`.
No new business decision blocks independent local work.

Still needed before launch: actual domain/VPS and named operator; remote Git/CI
and access policies; production SMTP and HTTPS/device push; off-site backup and
restore/alert proof; media permissions/source records and missing actual imagery;
approved legal entity/policies; native review of the seven authored languages;
two real staff usability sessions, manual accessibility/device checks and field
INP. Child rules/capacities stay unknown and configurable. Do not invent them.
Optional extra-language provider keys/free-quota confirmation are needed only
if the owner enables those languages; the seven core locales need no provider.

Final repeated local Lighthouse scores are home 92/100, trip 93/100 and desktop
98/100, with CLS 0. Mobile LCP is still 3.1–3.2 s, so **<2.5 s is not signed off**.
The existing ZAP Medium inline-style policy review remains open. The repository
has no commit history/remote, so milestone PRs, remote CI and deployment cannot
be represented as complete. Local file-07 work is recorded above; stop before
file 08 until the owner authorizes it.

## Backend handoff update — 2026-11-12

Later core-language fix: every existing tour and site content field now has all
seven core languages, directly authored in the repo by Codex at the owner's
request. No translation subscription/provider is needed. See
`docs/core-languages-verification.md`; the old missing-core-copy notes below are
historical. Native human review is not represented as completed.

This section supersedes older prerequisite/future-backend notes below. File 02
is implemented locally; [verification](docs/backend-verification.md) records
86 unit and 29 integration tests, real booking snapshots/local SMTP, TOTP/RBAC,
price/hero invalidation and Undo, HEIC/video processing and translation boundaries.
Docker PostgreSQL 16 is running with separate DML roles; Node 22/pnpm are available
under ignored `.tools/`. No existing PostgreSQL service was changed.

Seven core locales are authoritative. Core drafts need native review; no external
provider key/cost was used. Missing content falls back to EN. Production legal/
rights/source approvals remain open. API signed previews need a web consumer
in the later integration/admin workflow; admin screens/deployment are unbuilt.

Real-stack optimized home Lighthouse is 93 performance / 100 accessibility and
trip 93/100. Mobile LCP is still ~3.2 s, above the strict <2.5 s budget. Field INP,
device/manual accessibility, Linux font preloads and staging measurements remain
open. No remote/CI/PRs are configured. Continue to file 03 only when authorized.

## Environment

File 03 update (2026-11-12): integration implementation/local gates are recorded
in [integration verification](docs/integration-verification.md). Production images,
separate staging, release/rollback, backup/restore, monitoring/analytics hooks,
CI definitions and runbooks are prepared. No remote CI/deployment was run. Real
VPS/domain, SMTP, off-site credentials, alert/analytics setup, actual admin UI and
launch approvals remain external gates. Local Lighthouse is home 93/100 and
trip 94/100; LCP ~3.1 s remains above the strict 2.5 s target. Owner authorized
file 03 only; stop before file 04 until instructed.

- The initial checkout had no Git repository. A local empty repository was created; no remote is configured. PRs and remote CI cannot
  be verified until a remote is connected.
- Host Node is 24.19.0; the project requires Node 22. Use a local Node 22
  toolchain for verification where available; do not change the host runtime.
- Docker and pnpm were not on PATH during the initial inventory. PostgreSQL
  container startup must actually pass before the M0 gate can be marked done.

## Source reconciliation for later phases

- Security §2 requires a `__Host-` cookie with no Domain attribute; integration
  §1 suggests a parent-domain cookie. Follow the security rule: set a host-only
  API session cookie, send credentialed requests from the admin and enforce
  its exact Origin plus CSRF. Do not weaken the cookie to match the older text.
- M2's real-submit e2e depends on M4. Build the interface in M2, but keep that
  gate pending until the request backend exists; never fake a successful request.
- Catalog `notes` mix visitor facts with editorial instructions and resolved
  price history. Separate editorial metadata before public DTO serialization.
- Existing stock images and cut videos are already graded. Import must avoid
  applying enhancement again; only unprocessed uploads get the default grade.
- `stella-asset-sources.md`, referenced by ASSETS.md, is absent. Keep provenance
  gaps explicit. Mixed/unknown/third-party videos remain unpublished; ambiguous
  `client?` footage is not confirmed permission.
- The prototypes contain sample package prices and generated itinerary rows.
  Catalog/DB values take precedence; packages stay draft and missing content
  stays absent. Never copy the prototype's invented private surcharge.
- The catalog lacks explicit duration minutes, day counts and several capacity
  fields. M1 needs documented normalization from source facts, without inventing
  capacity or child rules.

## Launch items (defaults already permit development)

File-04 local security evidence is in `docs/security-verification.md`. Before
launch: review ZAP's Medium inline-style policy finding (the directive is
explicitly allowed by the current plan), run actual staging/authenticated admin
scans after file 05, approve the seven-language unpublished privacy draft with
real controller/contact/processors/transfers, and define mailbox/WhatsApp/backup
erasure/retention plus an off-site restore drill. These do not block local file
order or authorize publishing incomplete legal copy.

Real domain/VPS, SMTP and backup credentials; media permissions and stock source
records; legal entity and legal policies; missing real trip/office/logo imagery;
child rules and vehicle capacities. See DECISIONS.md and data/PRICE-CHECK.md.

## Frontend handoff findings

- Public DTOs and shared request/price schemas are implemented; file 02 must
  implement docs/frontend-api-contract.md without exposing editorial notes.
  The :4100 fixture is read-only test support, never a deployable API or fallback.
- Local Lighthouse scores meet the primary gates, but mobile LCP remains ~3.6 s
  home / ~2.9 s trip against the stricter <2.5 s budget. Revisit critical media/font
  delivery, then measure the integrated deployment; this is still open work.
- Native-speaker approval of core dictionaries is pending. Auto-language/RTL
  fixture checks prove fallback/layout only, not provider translations or coverage.
- Real request persistence, emails, server price recomputation and admin-triggered
  revalidation require later files. Production media rights, video variants and
  legal text must be supplied before launch. Full evidence is recorded in
  docs/frontend-verification.md.
