# Backend verification — file 02

Local implementation and acceptance evidence, 2026-11-12. Work follows the
user's numeric file order and stops before file 03. This is a development
handoff; deployment and admin screens have not been accepted.

The subsequent owner-requested complete core translation work is recorded in
[core-language verification](core-languages-verification.md). That update
supersedes the earlier missing-core-content/provider notes below: existing core
content is now bundled and seeded without an online translation service.

## Implemented phases

| Phase | Result                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1    | Hono/Node 22 API, separate worker, strict env validation, 25 PostgreSQL tables, reviewed immutable Drizzle migrations, citext/pg_trgm, distinct migration/API/worker roles.                                                                                                                             |
| B2    | Idempotent real catalog seed: 7 collections, 38 trips, 4 draft packages; All-of-Egypt-then-Private independent hero slides; licensed/permitted media import; public DTOs, ETag/cache, seven core locales and explicit EN fallback.                                                                      |
| B3    | Strict booking validation; IP 5/10 minutes and phone 20/day; form age; dates/pickup rules; DB-only server pricing in repeatable read; snapshots, reference and outbox in one transaction; local SMTP and WhatsApp confirmation link.                                                                    |
| B4    | Argon2id/blocklist; setup/reset/invite tokens; TOTP/recovery/replay protection; hashed sessions; MFA, CSRF, exact Origin, RBAC and reauthentication; content drafts/publish, prices/bulk/Undo, requests/CSV, hero ordering, homepage selection, users/settings, revisions/audit and signed preview API. |
| B5    | Streamed quarantine/magic-byte validation, image and real-video processing, private unknown-rights previews, immutable content-addressed variants, AVIF negotiation/Range; transactional pg-boss outbox, SMTP/revalidation/price reports, cleanup/privacy, public-only translation jobs and budgets.    |
| B6    | Unit, disposable PostgreSQL 16, OpenAPI snapshot, real API/worker/Mailpit browser checks at three widths, production build, lint, typecheck, dependency audit and mobile Lighthouse.                                                                                                                    |

## Reproducible checks

Use [API setup](../apps/api/README.md), Node 22.23.4, pnpm 10.34.9, Docker
and FFmpeg/ffprobe 9.0.2. Installed Chrome is the Playwright/Lighthouse browser.

| Check                       | Evidence                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit tests                  | 86 pass across five files: pricing/day rules, request schemas, locales/messages/env, RBAC matrix, crypto, references, normalization and translation placeholders.                                                                    |
| PostgreSQL integration      | 29 pass using Testcontainers PostgreSQL 16; no hosted database.                                                                                                                                                                      |
| OpenAPI                     | Generated public/admin input schemas, public DTO responses, multipart upload and auth security metadata; snapshot in `tests/contracts/openapi.json`. Admin edit result shapes remain generic JSON until admin UI adapters are built. |
| Real browser stack          | 4 pass: bookings at 390×844, 768×1024 and 1440×900; authenticated login/TOTP → price/hero changes → site cache invalidation within 60 seconds → Undo, on mobile.                                                                     |
| Real persistence/mail       | Browser response refs and estimates match persisted request/item snapshots; staff messages arrive at loopback Mailpit. Synthetic browser bookings and temporary accounts are cleaned up. No WhatsApp link is clicked.                |
| Security/environment        | Runtime DB role has no superuser/role/database/schema-create privileges; migration and pg-boss bootstrap run separately. Secure host-only cookies and JSON CSRF token support a separate admin host.                                 |
| Static/build checks         | `pnpm lint`, `pnpm typecheck`, unit tests and production builds pass. Home first-load JS remains 147 kB.                                                                                                                             |
| Production dependency audit | `pnpm audit --prod --audit-level moderate`: no known vulnerabilities at verification.                                                                                                                                                |

Integration coverage includes tampered booking payloads and price IDs, unknown
private quotes, IP spoofing, phone caps, 2FA enrollment/replay and concurrent
one-use recovery, the role/permission matrix, CSRF/Origin, editor draft isolation,
hidden surcharge and revision-restore escalation, large/stale bulk price changes,
full publication Undo, signed draft previews, homepage selection, human-source
freshness, CSV formula escaping, reset/session invalidation, rejected uploads,
GPS removal, real HEIC decode, real H.264 video orientations/audio removal,
private variants and Range, injected notification/report transport, retention,
public-only fake translations/budgets, webhook tags and atomic outbox enqueue.

The frontend's separate fixture suite also passed 24 tests after the seven-core
change. Those exercise fallback/RTL and broader navigation; they do not replace
the four real-stack tests. The fixture remains read-only and is never a runtime
fallback.

## Performance and visual evidence

Lighthouse 13.6.0, mobile simulated throttling, production Next.js build on
loopback with the real API/media. These are lab measurements, not field data.

| Page                           | Performance | Accessibility |    LCP |     CLS |     TBT |
| ------------------------------ | ----------: | ------------: | -----: | ------: | ------: |
| Home, initial real-stack run   |          88 |           100 | 3.91 s |       0 |   22 ms |
| Home, optimized image variants |          93 |           100 | 3.21 s | 0.00086 | 21.5 ms |
| Quad Bike Safari               |          93 |           100 | 3.16 s |       0 |   37 ms |

Added 160px image thumbnails and AVIF quality 45 alongside the required
480/768/1200/1920 variants. Processing version changes the content hash, so
previous immutable URLs are preserved. Source media already graded is not
enhanced twice. HEIC is locally decoded by FFmpeg because the bundled Sharp
build lacks HEVC decoding; originals and temporary decoded files stay private,
and the temporary file is removed. This limitation is also described in
[Sharp's HEIF documentation](https://sharp.pixelplumbing.com/api-output/#heif).

Automated WCAG A/AA checks reported no violations in the three real confirmation
flows. Screenshots were visually inspected for readable confirmation/actions;
raw screenshots and Lighthouse JSON are under ignored `.local/backend-qa/`.
The 54 historical frontend screenshots are under `docs/screens/`.

**The stricter mobile LCP <2.5 s budget remains open.** Field INP, full manual
screen-reader/device review, Linux font-preload behavior and staging Lighthouse
also remain acceptance work. No performance or accessibility certification of
an unbuilt admin UI is implied.

## Migration history notes

- `0004_tired_zombie.sql` and `0008_request_export_cursor.sql` are empty
  (no-op) migrations listed in the journal. They are applied, so they must never
  be edited or removed. Export paging uses the existing `requests_created_id`
  index.
- Drizzle snapshots stop at `0008`. Migrations `0009`–`0012` are hand-written
  SQL with matching declarations in `schema.ts`. Do not run `drizzle-kit
generate` until a fresh snapshot exists, or it will re-emit their DDL. Write
  new migrations by hand with `IF NOT EXISTS` and add a journal entry with a
  later `when`.

## Operational and source boundaries

- Seed creates seven hero rows: six published, Beyond draft. Beyond has no cover
  in the catalog and its video has unconfirmed rights. The draft preserves the
  source/owner workflow without inventing an image or publishing unknown footage.

- The generated local environment binds PostgreSQL :55433, SMTP :11025 and
  Mailpit :18025 to loopback, avoiding existing workstation PostgreSQL services.
  API :4000 and web :3000 use matching local origins. No existing host DB was modified.
- Migration/bootstrap uses `stella_migrate`; API/worker use distinct DML roles.
  Worker startup performs no DDL. These are development compose settings;
  production container/TLS/backups hardening belongs to file 03/security work.
- Core UI dictionaries EN/IT/ES/FR/DE/RU/TR exist with key parity and locale phone
  defaults. FR/DE/TR additions are drafts; native-speaker approval is pending.
  Missing catalog translations remain honest EN fallback until staff/provider work.
- No external translation key was configured or called. Tests inject a fake
  provider with public text only. Live provider output/quotas, every script/font
  and enabled-language coverage require real operator acceptance. Core UI is
  never overwritten by translation jobs. Provider outages retain saved languages.
- Google free translation additionally requires explicit confirmation of a
  dedicated reserved free quota. Monthly counters and free caps are enforced
  locally; production account quota setup must also be verified before enabling it.
- Unknown/ambiguous media stays private and cannot be published. Individual stock
  source records remain incomplete (`stella-asset-sources.md` was not supplied).
  Rights/source/legal approvals are launch requirements, not guessed values.
- One-time setup links are private, expire in 30 minutes and have no default
  password. The UI for consuming them belongs to file 05; the API is tested.
- Signed API draft previews work; the public web preview route/UX belongs to the
  later integration/admin workflow. Admin endpoints exist, admin screens do not.
- No remote is configured in the initial empty Git repository. Remote CI, PRs,
  staging, deployment, backups and full global M0–M7 gates have not run.

## Verified upstream/tool sources

- [Hono Node server](https://hono.dev/docs/getting-started/nodejs),
  [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new),
  [pg-boss](https://github.com/timgit/pg-boss), [otplib](https://github.com/yeojz/otplib).
- [FormatJS ICU parser](https://formatjs.github.io/docs/icu-messageformat-parser/),
  [DeepL limits](https://developers.deepl.com/docs/resources/usage-limits),
  [Google translation pricing](https://cloud.google.com/products/translate/pricing).
- [FFmpeg Windows build source](https://www.gyan.dev/ffmpeg/builds/),
  [SecLists blocklist](https://github.com/danielmiessler/SecLists/tree/master/Passwords/Common-Credentials),
  [libheif sample source](https://github.com/strukturag/libheif/tree/master/examples).
  Download helpers pin SHA256; the sample is private QA input, never company content.
