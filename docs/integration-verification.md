# File 03 — integration verification

File 06 update (2026-11-13): the real dashboard now replaces the probe scaffold;
the cache maintenance patch and latest image/browser/performance evidence are
in [admin verification](admin-verification.md) and
[build-order verification](build-order-verification.md). The original file-03
record below is historical, including its scaffold and test counts.

Local implementation/acceptance, 2026-11-12. The owner authorized continuation
in numeric file order. This handoff stops before file 04. No remote repository,
VPS, real domain, production SMTP, off-site repository or analytics/alert account
was supplied; remote acceptance is explicitly separate from local completion.

## Implemented phases

| Phase | Delivered                                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1    | Existing pnpm/Turbo/strict TS/lint/hook setup audited; route-only admin process added; every app has liveness and dependency readiness; CI/release/Renovate files prepared.                                                                                                                                                  |
| I2    | Private server API reads; server-injected browser API URL; runtime canonicals/sitemap/robots; signed private draft preview consumer with disabled booking; code-only error reporting and seven-language owner summaries.                                                                                                     |
| I3    | Three non-root images; read-only app filesystems, separate DB roles, private production PostgreSQL, fixed trusted proxy IPs outside dynamic allocation; Caddy TLS/security/media config; isolated staging gate; migration-before-start, backup, health, immutable SHA records and rollback including proxy config snapshots. |
| I4    | Owner-only config generator; reviewed Ubuntu hardening script; private DB dumps, encrypted restic retention, staging-only fail-closed scrub/restore; Cairo timers, health/disk/backup monitors, optional self-hosted tools, runtime Umami guards, ownership/ADR/runbook.                                                     |
| I5    | Local typecheck/lint/unit/integration/build, actual containers, real browser/SMTP/MFA/cache/Undo, promotion, staging gate, encrypted restore, workflow/shell/secret/dependency checks and Lighthouse.                                                                                                                        |

The admin process serves `/healthz` and `/readyz`; `/` intentionally returns
`503 ADMIN_UI_PENDING`. File 05 owns its UI and authentication screens. The
production deploy script refuses the scaffold image. A healthy probe does not
represent a complete dashboard or a production launch.

## Verified results

| Check                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck / lint / production build | Root `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; API/web/admin images build and run on Linux. Local ports 3000/3001/4000 all answer healthy liveness/readiness.                                                                                                                                                                                                                                                                     |
| Unit tests                          | **96 pass**: existing core coverage plus dependency probe failures, opt-in error payload privacy and analytics configuration/pre-send filtering.                                                                                                                                                                                                                                                                                          |
| PostgreSQL integration              | **33 pass**: original API/security/media coverage, owner summaries in seven locales, plus actual `pg_dump` → new staging DB → `pg_restore` → scrub. Catalog/translation rows survive; customer/staff/session/token/outbox rows are removed; source request remains unchanged.                                                                                                                                                             |
| Actual container browser suite      | **34 pass**, 2 deliberate duplicate skips: seven locales × 390×844 / 768×1024 / 1440×900; runtime API/SEO/media/private-boundary checks; signed previews in every locale; real requests delivered only to isolated Mailpit. Mobile MFA → price/hero edits → web invalidation within 60 seconds → Undo passes; the same backend mutation test is not repeated on tablet/desktop.                                                           |
| Image promotion                     | Identical web image IDs run at two origins, with different runtime canonical/API/sitemap URLs and no build placeholder leakage. No rebuild or source replacement to change environment.                                                                                                                                                                                                                                                   |
| Staging gateway                     | Actual Caddy container requires Basic Auth, serves `noindex` only after authentication and blocks public revalidation. This tests the gate locally, not real VPS staging TLS.                                                                                                                                                                                                                                                             |
| Rollback safety                     | **8 simulated Docker scenarios**: failed health restores prior images, successful deploy/explicit rollback records exact SHAs, failed migration never starts new API, staging rejects production configuration, failed scrub stays offline, successful scrub also stays offline, corrupt release metadata fails before mutation, and staging refresh keeps its deploy lock through public-media copy. Proxy config snapshots are checked. |
| Encrypted backup                    | Actual restic 0.19.1, network disabled, synthetic private fixture: encrypted init/backup, `check --read-data`, explicit snapshot restore with `--verify`, byte comparison and 7/4/12 retention command pass. This is a local encrypted repository, not off-site acceptance.                                                                                                                                                               |
| Code/config checks                  | ShellCheck and actionlint pass. Production/staging Caddy configs adapt; actual media negotiation returns AVIF with `Vary: Accept`, JPEG for q=0 refusals, immutable cache and 404 for private/unknown paths. Linux FFmpeg 7.1.5 decodes the real HEIC fixture.                                                                                                                                                                            |
| Secrets / packages                  | Gitleaks source scan reports no leaks. Only fingerprints of generated, ignored local `.env` credentials are excluded locally; real CI scans Git history. The exact `i18n_glossary` setting identifier is a documented false positive. `pnpm audit --prod --audit-level moderate`: no known vulnerabilities at verification.                                                                                                               |

Language checks use actual translated catalog content and automated WCAG
2/2.1/2.2 A/AA scans. Preview status copy and owner-report copy were authored
together in EN/IT/ES/FR/DE/RU/TR. No translation provider/subscription was used.
Synthetic bookings are cleaned by the verification-only teardown; no WhatsApp
link is clicked and no real SMTP or external error/analytics endpoint is called.

## Performance

Lighthouse 13.6.0, simulated mobile throttling, actual production Next.js image
behind local Caddy with real seeded media/API. Lab results, not field data.

| Page             | Performance | Accessibility |    LCP | CLS |
| ---------------- | ----------: | ------------: | -----: | --: |
| Home `/en`       |          93 |           100 | 3.18 s |   0 |
| Quad Bike Safari |          94 |           100 | 3.14 s |   0 |

The primary >=90/100 gates pass. **The stricter LCP <2.5 s budget remains open.**
Manual screen-reader/device review, field INP and actual HTTPS/VPS measurements
also remain open; these results are not an accessibility certification.

## Reproduce locally

Use Node 22/pnpm 10.34.9 and Docker. Default developer services and data are
separate from verification. Do not run the verify override on a VPS.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm infra:verify:setup
docker build -f infra/Dockerfile --target api -t stella-local/stella-api:integration .
docker build -f infra/Dockerfile --target web -t stella-local/stella-web:integration .
docker build -f infra/Dockerfile --target admin -t stella-local/stella-admin:integration .
docker compose --env-file .local/integration-runtime/production/compose.env -f infra/docker-compose.prod.yml -f infra/docker-compose.verify.yml up -d --wait postgres mailpit
docker compose --env-file .local/integration-runtime/production/compose.env -f infra/docker-compose.prod.yml -f infra/docker-compose.verify.yml run --rm --no-deps migrate
```

The setup helper refuses existing configs; do not delete/recreate credentials
to repeat tests. First seed uses the `migrate` image, read-only `/app/assets`
from this repository and a private writable `/private` bind for
`SEED_SETUP_FILE=/private/owner-setup.txt`, then runs
`node --import tsx scripts/seed.ts`. Never print that link in logs.

Start the same compose selection with `up -d --wait api worker web admin caddy`.
For the promotion test, run the **same** web image on loopback port 4990 in
`stella-integration-verify_edge` with `API_INTERNAL_URL=http://api:4000`,
`SITE_URL=http://localhost:4990`, `PUBLIC_API_URL=http://localhost:4984`, writable
tmpfs `/tmp` and `.next/cache`. Then `pnpm test:e2e:integration` runs the 34 checks
with explicit verification DB guards. `node scripts/verify-staging-gate.mjs`
creates/stops its own temporary gate container. It uses a public synthetic QA
credential which is never used by real config generation.

Verification publishes only loopback ports: gateway 4983, API 4984, web 4985,
admin 4986, Mailpit 4987, promotion 4990, QA DB 4991 and temporary gate 4992.
Production publishes only Caddy 80/443 and keeps PostgreSQL on an internal
network with no port. Verification's extra DB network/port is deliberate QA
support, not part of production. All verification data/config/logs are ignored
under `.local/`; no existing host PostgreSQL service is changed.

## External acceptance still required

- Remote Git/PR/branch/environment protections, real Actions/GHCR and pinned
  per-person SSH access; no remote CI or deployment has run.
- Actual Ubuntu hardening, DNS/canonical/old-site redirects, ACME TLS/security
  headers, production SMTP/deliverability and ZAP staging scan.
- Off-site encrypted backup credentials/retention and a real monthly restore
  drill; real monitoring alert recipients and error ingestion verified by owner.
- Optional Umami/Kuma deployment, credentials/website ID, dashboard access and
  actual privacy settings. They are prepared but disabled/unprovisioned locally.
  Nightly production backup and optional fail-closed staging refresh timers are
  prepared; enabling staging refresh and account/media reprovisioning require operator acceptance. Restore
  intentionally leaves staging offline until its data and own accounts are ready.
- Real staff dashboard usability (implementation is now file 05), legal/rights/source approvals, native human
  review, strict LCP/manual-device/field measurements remain launch requirements.

See [VPS preparation](../infra/server-setup.md), [runbook](RUNBOOK.md) and
[ownership](OWNERS.md). Deployment code never substitutes for these gates.

## Primary implementation references

- [Next.js runtime environment variables](https://nextjs.org/docs/15/app/guides/environment-variables)
  explain why browser public variables must not freeze staging addresses in the image.
- [Docker raw env files](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/),
  [Caddy options](https://caddyserver.com/docs/caddyfile/options) and
  [reverse proxy trust](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
- [Restic restore verification](https://restic.readthedocs.io/en/stable/050_restore.html),
  [Sentry envelope protocol](https://develop.sentry.dev/sdk/foundations/envelopes/) and
  [Umami pre-send configuration](https://docs.umami.is/docs/tracker-configuration).
