# Stella API and worker

File 02 implements a Node 22/Hono API, PostgreSQL 16/Drizzle storage and a
separate pg-boss worker. Public reads use validated DTOs; booking requests are
stored with authoritative price snapshots. No payments are collected.

## Local setup

Use Node 22, pnpm 10, Docker and FFmpeg/ffprobe with H.264/HEVC support. This
workstation has ignored tools in `.tools/`; they are not committed dependencies.
On Windows the setup defaults to `.tools/ffmpeg/{ffmpeg,ffprobe}.exe`; on other
platforms it uses PATH. Set `FFMPEG_PATH` and `FFPROBE_PATH` before setup to
override those defaults.

From the repository root, for a fresh checkout:

```sh
pnpm install
pnpm security:setup
pnpm dev:setup
docker compose --env-file .env -p stella-kit-dev -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`dev:setup` generates random development credentials and refuses to overwrite
existing configuration. To reconfigure an existing checkout, edit the four
ignored files directly: `.env`, `apps/api/.env`, `apps/api/.env.worker`,
`apps/web/.env.local`. PostgreSQL uses loopback :55433, Mailpit SMTP :11025 and
its inbox http://127.0.0.1:18025, API :4000 and web http://localhost:3000.
The implemented admin UI is on :3001. The root command runs web/admin/API/worker.

Migrations and queue schema bootstrap use `MIGRATION_DATABASE_URL`. API and
worker have distinct NOSUPERUSER/NOCREATEDB/NOCREATEROLE roles with DML, not
schema CREATE. Keep migration credentials out of running API/worker containers.
Applied SQL migrations are immutable; generate a new migration for schema edits.

Seed reruns preserve staff content/prices and import media by content hash.
Known-rights videos are processed before initial hero creation; unknown clips
stay private and use cover-image hero fallbacks. All originals are private.
Beyond has no supplied cover and an unconfirmed video, so its hero is a draft:
seven seeded slides, six published. Staff must confirm rights or supply a cover.
Initial processing can take several minutes.

## Owner setup and authentication

Seed prints a random one-time owner setup token/link, valid for 30 minutes. Set
`SEED_SETUP_FILE` to a private ignored path to save it without console output.
An expired unused initial setup can be reissued by rerunning seed. Configured
passwords are never reset by seed. There is no default password.

The dashboard setup screen calls
`POST /v1/admin/auth/password/setup` with `{token,password}` and the exact
configured admin Origin. Then login, enroll TOTP and store the ten recovery codes
offline. Owner/manager sessions cannot use protected operations before MFA.
The password policy requires at least 12 characters and the verified local
100,000-entry blocklist. `security:setup` pins its SHA256 and fails if upstream
changes; review the source before changing that pin.

Session cookies are Secure/HttpOnly/SameSite=Strict, API-host-only `__Host-`
cookies. Login/MFA/me return `csrf_token` for a separate admin host. Send it in
`X-CSRF-Token` and use credentialed requests plus the exact admin Origin. Do not
add a parent-domain session cookie. Sensitive settings/users/export require
recent reauthentication. OpenAPI is admin-session protected in production.

## API and jobs

- `/healthz`, `/readyz`, `/v1/openapi.json`.
- `/v1/public/site`, `locales`, `collections`, `trips/:slug`, `packages/:slug`,
  `faq`, `pages/:key`, `messages`; use `?locale=en` (or another live locale).
- `POST /v1/requests`: strict shared schema, 3-second form minimum, IP/phone
  limits, DB pricing and atomic request/items/notification outbox.
- Public read quota defaults to 600/minute/IP (`PUBLIC_READS_PER_MINUTE`), with
  Retry-After. Server rendering and prefetches share the web server's network IP;
  account for that aggregation when tuning proxy/cache limits in deployment.
- `/v1/admin/*`: role-checked content, prices/bulk preview/apply, requests/CSV,
  hero ordering/publication, media, homepage drafts/publication, settings/users,
  audit/revisions, preview capabilities and translation queue/settings.
- `/v1/public/preview?token=...`: one-hour signed trip/collection capability,
  no-store/noindex. The implemented web preview consumer disables draft bookings.
- `/media/<hash-prefix>/<hash>/<variant>` serves processed files only, with
  AVIF/WebP negotiation, Vary: Accept, immutable caching and video Range support.
  Authenticated media preview can read private processed variants, never originals.

Outbox enqueue and delivery marking share one PostgreSQL transaction. Jobs
retry with backoff. Handlers cover media, staff SMTP, invite/reset SMTP, web cache
invalidation, weekly owner price reports, session/media cleanup, 18-month request
anonymization and translation. Notifications include only request IDs in queues;
customer contact fields are read by the mail job and never sent to translators.

Only the worker reads provider keys. No key means the seven core locales only.
The seven core languages are fully supplied in `data/i18n/` and the web UI
dictionaries, authored directly by Codex at the owner's request. Seed installs
them without a provider or subscription and preserves human values. See
[content provenance](../../data/i18n/README.md). Provider adapters are optional
for additional languages or future explicitly requested backfills.
Provider translations run on allowlisted published text, preserve human values
and stale saved fallbacks, and protect ICU/URLs/glossary/numbers. Default monthly
budget is 1M characters and DeepL/Google free caps are 500k each. Google stays
paused until `GOOGLE_FREE_TIER_CONFIRMED=true` confirms a dedicated reserved free
quota. No external translation or paid calls were used for verification.

## Verification

```sh
pnpm test
pnpm test:prepare
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod --audit-level moderate
pnpm test:e2e:api
```

`test:prepare` downloads a SHA256-pinned HEIC sample from the official libheif
repository to `.local/`, solely for private upload/decoder tests. It is never
seeded or published as company content. Tests themselves run without that download.
Integration tests start disposable PostgreSQL 16 via Testcontainers and delete
their own containers. FFmpeg and the password list must exist. The browser suite
requires the generated local configs, the production web build/start, API and
worker; it rejects a different DB/SMTP environment, submits synthetic bookings
and delivers only to local Mailpit. It also verifies login/TOTP, price/hero cache
invalidation and Undo. It never clicks the WhatsApp send link.

See [verification](../../docs/backend-verification.md) for evidence and open
acceptance limits. Docker production packaging, CI/CD/TLS/backups, staging,
admin screens and external provider/native-copy acceptance are later files.
