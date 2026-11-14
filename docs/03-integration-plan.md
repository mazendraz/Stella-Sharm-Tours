# 03 · Integration, environments & keeping the project healthy

## File execution phases (owner-authorized, 2026-11-12)

Work in order; stop after this file. Local implementation is distinct from a
real VPS deployment. No server/remote/SMTP/off-site credentials are supplied.

- [x] I1 — Audit workspace/env/CI; add operational admin scaffold and readiness.
- [x] I2 — Verify private API reads, signed revalidation, proxy trust and core locales.
- [x] I3 — Build non-root production images, isolated compose/Caddy, release and rollback.
- [x] I4 — Add safe backups, staging-only scrubbed restores, monitoring and runbooks.
- [x] I5 — Run local integration/container gates and record evidence/launch dependencies (`integration-verification.md`).
- [ ] Remote acceptance — CI/GHCR, VPS hardening, DNS/TLS, off-site restore and go-live.

The security plan overrides the old parent-domain cookie example below:
`__Host-stella_admin` is host-only, Secure, HttpOnly and SameSite=Strict, with
exact admin Origin plus session-bound CSRF. Core translations are bundled and
authored directly in all seven languages; providers remain disabled by default.

## 1. How the parts talk

```
 Browser (tourist) ──HTTPS──► Caddy ──► web (Next.js :3000) ──server fetch──► api (Hono :4000) ──► PostgreSQL :5432
                                  │                                              │
                                  └──► media.* (static files from /srv/stella/media) ◄── worker (sharp/ffmpeg, i18n jobs) ──HTTPS──► translation provider (DeepL / Google; public text only)
 Browser (staff) ───HTTPS──► Caddy ──► admin (Next.js :3001) ──fetch w/ cookie──► api /v1/admin/*
```

- The **web** app fetches the API **server-side** (RSC) over the private Docker network (`http://api:4000`). The browser only calls the API directly for `POST /v1/requests`.
- The **admin** app talks to the API from the browser with a host-only `__Host-stella_admin` cookie (`SameSite=Strict`, `Secure`, `HttpOnly`, `Path=/`, no Domain), exact Origin and session-bound CSRF. Its current process is an operational scaffold; file 05 builds the dashboard.
- After any admin write, the API enqueues `revalidate.web` → calls `POST https://<web>/api/revalidate` with a secret and tags → the site updates within seconds.
- Saving EN content enqueues `i18n.translate_entity`; the worker writes `content_translations` and then triggers `revalidate.web` (see `docs/08-i18n-plan.md` §4).
- Types and validation live in `packages/shared` and are imported by web, admin and API, so a field change breaks the build everywhere instead of breaking production.

## 2. Environments

| Env            | Where                                                                          | DB                                               | Data                                   |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------- |
| **local**      | developer laptop                                                               | Docker Postgres (`infra/docker-compose.dev.yml`) | seed from catalog                      |
| **staging**    | same VPS, separate compose project, `staging.` subdomains, basic-auth in front | separate DB `stella_staging`                     | nightly copy of prod with PII scrubbed |
| **production** | VPS                                                                            | `stella_prod`                                    | real                                   |

Worker env adds `TRANSLATE_PROVIDER`, `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_KEY`, `LIBRETRANSLATE_URL` (all optional; without them only the 7 core languages are live). Staging uses the `fake` provider unless a key is set.

Implementation update: the staging override forcibly uses fake translations and
its private Mailpit, with real provider/SMTP credentials cleared. Seven core
translations are authored directly and bundled, not provider-generated. Browser
API URLs, canonical URLs, sitemap and robots use runtime `SITE_URL` /
`PUBLIC_API_URL` (legacy local `NEXT_PUBLIC_*` remains supported), so the same
image can be promoted between environments. Signed previews use
`/{locale}/preview?token=…`, are private/no-store/noindex/no-referrer and disable
draft booking controls.

`.env.example` committed; real `.env` files only on the server (`/srv/stella/env/*.env`, mode 600, owned by the deploy user).

## 3. Local development

```
docker compose -f infra/docker-compose.dev.yml up -d   # postgres:16, mailpit
pnpm db:migrate && pnpm db:seed
pnpm dev     # turbo runs web:3000, admin:3001, api:4000, worker
```

Mailpit UI at `http://localhost:8025` shows request notification emails.

## 4. Git & CI

- `main` = production, `develop` = staging. Feature branches → PR → review → squash merge.
- Conventional commits; `CHANGELOG.md` updated by the PR author.
- GitHub Actions on every PR: install (pnpm cache) → typecheck → lint → unit tests → integration tests (Postgres service) → build all apps → `pnpm audit --prod` + gitleaks secret scan.
- On merge to `develop`: build Docker images (`ghcr.io/<org>/stella-{web,admin,api}:<sha>`), deploy to staging.
- On tag `vX.Y.Z` on `main`: same images promoted to production (no rebuild), migrations run as a one-off container **before** the new API starts. Rollback = redeploy the previous tag (migrations must be backward compatible for one release: add columns first, remove later).
- Renovate bot for dependency updates (weekly, grouped).

## 5. Production deployment (VPS)

- Ubuntu 24.04 LTS, Docker + compose plugin, non-root `deploy` user.
- `infra/docker-compose.prod.yml` services: `caddy`, `web`, `admin`, `api`, `worker`, `postgres`, `umami`, `uptime-kuma` (optional on a separate box).
- Networks: `edge` (caddy ↔ apps) and `internal` (apps ↔ postgres). Postgres has **no published port**.
- Volumes: `pgdata`, `/srv/stella/media`, `/srv/stella/originals` (private), `caddy_data`.
- Caddy: automatic TLS, HTTP→HTTPS, HSTS, security headers (see security plan), `media.` served straight from disk, compression (zstd/gzip).
- Deploy script (`infra/deploy.sh`): `docker compose pull` → `docker compose run --rm api pnpm db:migrate` → `docker compose up -d` → health checks (`/healthz` on each app) → if any fails, revert to the previous image tags.

## 6. Backups & restore

- Nightly 02:30 Cairo: `pg_dump -Fc` → restic (encrypted) → off-site bucket. Media + originals synced by restic too.
- Retention: 7 daily, 4 weekly, 12 monthly.
- **Restore drill monthly** on staging (scripted: `infra/backup/restore-to-staging.sh`). A backup that has never been restored is not a backup.
- Before every production deploy: an on-demand `pg_dump`.

## 7. Monitoring

- `/healthz` (liveness) and `/readyz` (DB reachable) on api/web/admin.
- Uptime Kuma checks home, a trip page, API health, TLS expiry → alerts to email/Telegram.
- Error tracking: Sentry SDK (or self-hosted GlitchTip) in web, admin, api; PII scrubbing on.
- Logs: pino JSON → Docker logs → rotated (max 50 MB × 5). No passwords, tokens, phone numbers in logs.
- Weekly report email to the owner: requests per day, top trips, errors.

Local implementation uses opt-in, code-only Sentry/GlitchTip-compatible event
envelopes instead of a full auto-capturing SDK: no raw errors, request URLs,
headers, users, replay, traces or form values are accepted. Real ingestion is
an operator acceptance gate; no event was sent to an external service.
The owner report runs Mondays 09:05 Africa/Cairo, supports all seven locales
(`OWNER_REPORT_LOCALE`), contains aggregate request/top-trip counts and directs
the owner to private error monitoring without inventing an error count.
Optional self-hosted Umami is runtime-configured, restricted to the matching
stats origin, with tested guards that drop private routes and strip query/hash,
referrers and arbitrary event data. No real analytics ID is supplied/enabled.

## 8. Keeping it organised over time

- **Ownership map** in `docs/OWNERS.md`: who approves content, who can deploy, who has server access.
- **ADR folder** `docs/adr/` — one short file per decision (why Hono, why pg-boss, etc.).
- Content changes happen **only in the admin**, never in code. Code changes happen only through PRs.
- Quarterly: update Node/Postgres minor versions, review admin users and roles, rotate secrets, test restore, review analytics and remove dead trips.
- Feature flags in `settings.flags` for risky features (e.g. seasonal prices). Languages are not flags: they are switched on/off in the admin Languages screen (`settings.i18n`).

## 9. Integration tasks

- [x] M0.1 monorepo, turbo, tsconfig base, eslint/prettier, husky + lint-staged source configuration
- [x] M0.2 dev compose (postgres, mailpit), `.env.example`, env validation
- [x] M0.3 CI/release pipeline prepared and actionlint-validated; remote run pending
- [x] M3.x revalidation webhook web ⇄ api, actual authenticated edit/Undo within 60 seconds
- [x] M7.1 VPS hardening script/runbook prepared; actual server application remains remote acceptance
- [x] M7.2 prod compose + Caddyfile + deploy/rollback script + health checks, verified locally with isolated override
- [x] M7.3 backup/restore/monitor code and local drills; off-site/operator acceptance still pending
- [x] M7.4 go-live checklist prepared in `infra/server-setup.md`; no real DNS/TLS/redirect/sitemap submission is claimed

All five implementation phases are complete locally. **Remote/go-live acceptance
above remains unchecked**. Evidence, performance limits and external dependencies
are in [integration verification](integration-verification.md). Stop before file 04.
