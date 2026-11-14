# File 04 — local security verification

Scope: the public web, API, PostgreSQL, worker, media pipeline and deployment
artifacts, on the local Windows/Docker environment, 2026-11-12. File 05's actual
admin UI has not started. This is implementation and regression evidence, not
an ASVS certification, legal opinion or production penetration test.

## Controls and changes

| Area               | Evidence / resulting behavior                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth / RBAC        | Argon2id, local 100k password blocklist, owner/manager TOTP, encrypted per-user secrets, one-use recovery/reset/setup tokens, endpoint role matrix, rate limits, Origin and session-tied CSRF. Login rechecks password state under lock; MFA cannot recreate an already-revoked pending session.                                                                                                                                                           |
| Sessions / devices | HMAC-SHA-256 session IDs make secret rotation revoke existing cookies. Revoke-all clears sessions and notification-only recognized devices. Password reauthentication protects optional MFA enrollment. Device alerts are queued after full authentication, contain IDs only and use seven-locale authored email copy.                                                                                                                                     |
| Customer privacy   | Phone-specific export/erase requires owner/manager plus recent password/TOTP reauthentication. POST body only; item snapshots included, IP/UA excluded. Erasure and 18-calendar-month anonymization remove historical copies and queued request notifications; row locks serialize mail delivery and edits. Explicit anonymization state prevents reidentification through edits/Undo. CSV formula cells are escaped after leading whitespace/control/BOM. |
| Legal drafts       | `data/privacy-draft.json`, `pnpm privacy:prepare`: five factual blocks in all seven locales; unpublished, idempotent and existing content preserved. Non-English rows record `codex-authored` provenance, never native/human approval. No provider/subscription used. Controller/contact, processor/transfer facts, external retention and legal approval remain required.                                                                                 |
| Web / API          | Fresh 128-bit CSP nonce, forged incoming nonce overwritten, nonce on HTML including redirects/dotted 404s and structured data. Closed fallback CSP for other responses. Streaming byte limits and deadlines on internal revalidation/error bodies; exact request JSON media type. Proxy trust accepts only a single valid IP from an explicit trusted peer. Production non-local web/admin origins require HTTPS and origin-only URLs.                     |
| Media              | MIME/magic bytes, limits, quarantine, reencoding/metadata stripping, local HEIC and video processing, rights gate and processed-only serving. Codec subprocesses receive a small environment allowlist, excluding application credentials and `NODE_OPTIONS`.                                                                                                                                                                                              |
| Operations         | Non-root/read-only application containers, private DB/runtime DML roles, separate migration credentials, no Docker socket, secret-safe logs and error reports. Local staging scrub includes recognized devices; encrypted restore, fail-closed operations, dependency/source/config checks. Real VPS application is separate.                                                                                                                              |

## Local gates

- Root typecheck/lint/build and production API/web/admin image builds.
- **101 unit tests** and **43 PostgreSQL integration tests**, including actual
  media codecs, concurrent auth races, privacy export/erase, seven-locale draft
  isolation and `pg_dump` → restore → staging scrub including devices.
- Browser verification at 390×844, 768×1024 and 1440×900 covers all seven locales,
  console errors, automated accessibility, live API/SMTP, signed private previews,
  price/hero edits and Undo. Final counts and ZAP results are recorded below.
- Eight simulated deployment/rollback/restore safety cases; actual encrypted
  restic read-data check/verified byte-identical restore/retention; actionlint,
  ShellCheck and Caddy adaptation. No real deployment or off-site repository.
- `pnpm audit --prod --audit-level moderate`: no known vulnerabilities at check.
  Local private evidence is under `.local/security-*`; it is ignored by Git.

## Passive scan

`pnpm security:baseline:local` uses a digest-pinned ZAP Docker image against
`http://caddy:8080/en` on the isolated integration network only. Traditional
spider, one minute, forms disabled, no active scan or staff credentials.
It retains warnings and the original exit code; it does not silently ignore
rules. Private HTML/JSON/log reports: `.local/security-zap/`.

Final browser suite: **37 pass**, two deliberate duplicate skips, across all
three viewport projects. This includes 21 locale/viewport cases and nonce/CSP
assertions on success, redirects and dotted 404s; no observed console errors.
Root build/typecheck/lint, 101 unit and 43 DB tests pass. Runtime services are
healthy; identical web image IDs were used for the second-origin test.

ZAP completed with **exit 2 (warnings)**, 61 passing checks, no High findings.
The report contains one Medium alert type: **10055, `style-src unsafe-inline`**.
The current plan explicitly permits that directive for React/motion inline
styles. It has not been removed, suppressed or represented as fixed; the launch
security gate remains open for explicit policy/risk review or a tested redesign
that removes inline styles. Script policy allows neither `unsafe-inline` nor
`unsafe-eval` in production.

Low findings: missing cross-origin isolation headers (90004) and timestamp-like
numeric fragments (10096). Informational findings include empty-404 content type,
modern application/cache observations, and a potential query-to-attribute hotspot
(10031) where `format=private` also occurs in a translated tour image alt.
The passive scan does not establish an executable XSS; these findings and their
evidence remain in the private report for staging review. No rule was ignored.
This local HTTP scan is public/unauthenticated; actual TLS and admin UI need
separate staging coverage.

The initial full-workspace Gitleaks invocation was rejected by automatic approval
review because it would expose private local environment files to the scanner
container. The completed safer check uses **315 non-binary publishable source
files** selected through Git's ignore-aware inventory, with zero real `.env` or
runtime files. A digest-pinned Gitleaks container has no network, read-only mounts,
no capabilities and no added privileges. Result: **no leaks found**. Private
credentials were not supplied to it; remote Git/history CI remains unexecuted.

## Acceptance still required

- File 05 now supplies authenticated dashboard/MFA/recovery/session controls,
  privacy UI, keyboard/mobile/CSP regression checks and a local login-surface
  baseline; see [admin verification](admin-verification.md). Real staff/native
  devices and authenticated staging penetration/security acceptance remain open.
- Real VPS SSH/firewall/patches/permissions, external TLS/security-header rating,
  real staging ZAP (fix/review all medium+), remote CI/release and private probes.
- Real SMTP alert delivery, owner contacts, monitoring/alerts and an off-site
  encrypted restore drill. Credentials/production access are not configured here.
- Approved legal identity/contact, processor/transfer inventory and policy review;
  mailbox/WhatsApp/backups retention and erasure/reapply process. Drafts remain
  unpublished; database deletion does not delete already-delivered messages or
  immutable backup snapshots.
- File 03's strict mobile LCP <2.5s and field/manual launch acceptance remain open.

References: [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[ZAP baseline behavior/exit codes](https://www.zaproxy.org/docs/docker/baseline-scan/),
[EDPB individual rights](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).
