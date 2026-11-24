# Architecture audit

## 1. System overview

Monorepo: pnpm 10.34.9 workspaces and Turbo, Node 22 (`engines: >=22 <23`), TypeScript 5.9.

| Unit       | Path                                                                        | Tech                                                            | Role                                                                                                               |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Public web | `apps/web`                                                                  | Next.js 15.5.29 (patched), next-intl                            | Server-rendered public site with seven core locales plus machine-translated ones; nonce CSP in `src/middleware.ts` |
| Admin      | `apps/admin`                                                                | Next.js 15 SPA shell (`[[...path]]`) with a service worker      | Staff dashboard that talks to the API from the browser with credentials                                            |
| API        | `apps/api/src`                                                              | Hono 4 with `@hono/zod-openapi`, drizzle-orm, pg                | Public catalog reads, booking requests and quotes, admin CRUD, auth, media upload and serving                      |
| Worker     | `apps/api/src/worker-main.ts` (the `apps/worker` package is a thin wrapper) | pg-boss 12, nodemailer, sharp, ffmpeg, web-push                 | Outbox dispatch, email, push, media encoding, translation, retention, cleanup                                      |
| DB         | `packages/db`                                                               | PostgreSQL 16, drizzle migrations `0000`–`0010`                 | Schema, seed, runtime privilege grants                                                                             |
| Shared     | `packages/shared`                                                           | zod                                                             | Contracts, booking and price schemas, RBAC table (`admin.ts`), i18n, CSV, env parsing                              |
| Infra      | `infra/`                                                                    | Docker Compose, Caddy 2 (digest-pinned), systemd timers, restic | Single-VPS deployment, TLS, backups, monitoring                                                                    |

There is no Supabase, Firebase or other BaaS. PostgreSQL sits only on an `internal: true` Docker network.

## 2. Request and dependency map

```
Browser ──HTTPS──> Caddy (WEB_HOST)   ──> web:3000 ──(server fetch, X-Stella-Catalog-Reader HMAC)──> api:4000 ──> postgres
Browser ──HTTPS──> Caddy (ADMIN_HOST) ──> admin:3001  (static shell)
Browser(admin) ──credentials, CSRF──> Caddy (API_HOST) ──XFF={remote_host}──> api:4000 /v1/admin/*
Browser(public) ──CORS WEB_ORIGIN──>  Caddy (API_HOST) ──> api:4000 /v1/requests, /v1/requests/quote
Browser ──> Caddy (MEDIA_HOST) ──forward_auth /internal/media-access──> api ──> file_server (read-only media volume)
api ──INSERT outbox──> postgres <──pg-boss── worker ──> SMTP / web-push / DeepL·Google·Libre / ffmpeg
worker ──POST /api/revalidate (shared secret)──> web
```

Trust boundaries:

- Caddy is the only public listener. It blocks `/readyz`, `/internal/*` and `/media/*` on API_HOST, and `/api/revalidate` and `/readyz` on WEB_HOST.
- The API trusts `X-Forwarded-For` only when the socket peer equals `TRUSTED_PROXY_IPS`, which is the fixed Caddy IP (`apps/api/src/auth.ts:87-98`).
- The web server authenticates to the API's public reads with an HMAC derived from `WEB_REVALIDATE_SECRET` (`apps/web/src/lib/api.ts:27-43`, `apps/api/src/app.ts:155-163`). That buys it a higher, shared rate quota (see SEC-01).

## 3. Authentication and authorization architecture

- Sessions: a 32-byte opaque token in the `__Host-stella_admin` cookie (HttpOnly, Secure, SameSite=Strict). The database stores an HMAC of the token, never the token itself (`auth.ts:77-80`). Idle timeout is 8 h, absolute lifetime 30 days. Sessions that have not passed 2FA expire after 10 minutes.
- CSRF: a double-submit cookie plus a header that must equal the HMAC of the session token, and an exact `Origin` check on every non-GET request (`auth.ts:289-299`).
- 2FA: TOTP encrypted with AES-256-GCM (`TOTP_ENC_KEY`, user id as AAD) with replay protection via `lastTotpStep`, and 10 single-use recovery codes. Mandatory for owner and manager.
- Re-authentication within the last 5 minutes is required for settings, users, privacy export and erasure, and CSV export.
- RBAC: one table in `packages/shared/src/admin.ts:4-17`, checked by `auth.guard(permission)`. There is also a global `app.use('/v1/admin/*', auth.guard())` (`admin.ts:503`) and contract-driven guarding in `app.ts:451-477`. Every one of the roughly 90 admin routes was enumerated, and each has an explicit permission or performs its own internal permission check (`POST /v1/admin/revisions/:id/restore`, `admin-more.ts:1272-1320`).

## 4. Data and asynchronous flow

- **Transactional outbox:** API writes add an `outbox` row in the same transaction. The worker dispatches into pg-boss (`jobs.ts`), and an integration test asserts this happens in one transaction.
- **Booking requests:** a repeatable-read transaction recomputes the quote from database prices and share-locks the trips. Idempotency comes from `booking_request_receipts`, with replay and conflict detection (`requests.ts`). Prices never come from the client.
- **Media:** upload goes to quarantine, is validated (file-type, sharp, ffprobe with protocol whitelist) and is content-addressed by SHA-256. An outbox job encodes it, and a public rendition row is written only when rights are not `unknown`. Serving goes through Caddy `forward_auth` on every request, so revoking rights takes effect immediately.
- **Scheduled jobs (Africa/Cairo):** session, token and rate-bucket cleanup hourly; request retention purge daily; media cleanup weekly; weekly operations and price reports.

## 5. Environment configuration

- `apps/api/src/config.ts` validates every variable with zod. Secrets must be at least 32 characters, `TOTP_ENC_KEY` must decode to 32 bytes, origins must be bare HTTPS in production, and `DEV_SIMPLE_ADMIN_LOGIN` is refused outside `NODE_ENV=development`.
- `.env` (local dev) is git-ignored and untracked. Only `*.example` files are tracked. The repository includes gitleaks configs and source and history scanners.
- Production env files live outside the repo (`ENV_DIR`). `infra/lib.sh:18` requires mode 600 and ownership by the deploy user.

## 6. Architectural risks

| ID      | Risk                                                                                                                                                                                                | Severity                               | Evidence                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ARCH-01 | **Release provenance:** the tree that would ship is not committed or pushed, so nothing guarantees that what CI tests is what gets deployed. See PR-01.                                             | Critical                               | `git remote` is empty. `git status`: 166 modified, 103 untracked. `app.ts:34` imports the untracked `./booking-quote` |
| ARCH-02 | **Single host, single instance** for every service. The in-memory rate-limit state (`app.ts:154`) and the Next file cache assume one process. Horizontal scaling would silently weaken rate limits. | Low (acceptable for the business size) | `docker-compose.prod.yml`                                                                                             |
| ARCH-03 | **The shared trusted-reader quota** links the availability of every server-rendered page to public, unauthenticated proxy routes. See SEC-01.                                                       | Medium                                 | `apps/web/src/app/api/trips/route.ts`, `app.ts:158-185`                                                               |
| ARCH-04 | **Media authorization on the hot path:** every media byte request, including 304 revalidations and video Range requests, makes an API call and a DB query. See INF-03.                              | Low                                    | `infra/caddy/common.caddy:31-35`                                                                                      |
| ARCH-05 | **Large modules:** `admin.ts` (2,224 lines), `admin-more.ts` (1,973) and `trip-editor.tsx` (1,763) concentrate most admin logic, which raises review cost and regression risk.                      | Informational                          | `wc -l`                                                                                                               |
| ARCH-06 | **Observability by design drops error details.** Privacy-motivated, but it leaves incidents undiagnosable. See OPS-01.                                                                              | Medium                                 | `server.ts:24`, `app.ts:637`                                                                                          |

## 7. Positive architecture notes

- Strict separation between public DTOs and admin data, with public contracts validated by zod in both directions (`apps/web/src/lib/api.ts:49-51`).
- Database least privilege: separate `stella_migrate`, `stella_api` and `stella_worker` roles with explicit table and column grants, re-applied idempotently (`packages/db/src/runtime-privileges.ts`). Every table write in the API code was cross-checked against the grants, and no write lacks a grant.
- Expand/contract migration policy. The deploy takes a backup before migrating and never rolls back the schema automatically (`infra/deploy.sh:36-41`).
