# Architecture audit — Stella Sharm Tours

## What the system is

A booking-request website for a Sharm El Sheikh excursion company. It takes **no online payments**: a guest builds an itinerary, the server prices it from the database, stores a request and hands the guest a pre-filled WhatsApp message, and staff are notified. Staff run the catalog, prices, homepage, media, translations and requests from a mobile-first admin.

Classification: full-stack web application, TypeScript monorepo (pnpm workspaces + Turborepo), self-hosted on one Ubuntu VPS via Docker Compose. No AI/ML components (machine translation is an optional external HTTP provider called by the worker for non-core languages).

## Stack (verified from code and lockfile, not docs)

| Layer    | Technology                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime  | Node 22 (pinned in `.nvmrc`, `engines`, Docker base digest)                                                                              |
| Web      | Next.js 15.5.29 (App Router, standalone output, **locally patched**), React 19, next-intl                                                |
| Admin    | Next.js 15.5.29 SPA-style catch-all route, service worker, Web Push                                                                      |
| API      | Hono + `@hono/zod-openapi`, Zod 4 schemas, `@node-rs/argon2`, `otplib`, `busboy`, `sharp`, `file-type`, FFmpeg/ffprobe subprocesses      |
| Worker   | Same codebase as API (`apps/api/src/worker-main.ts`), pg-boss queues + transactional outbox                                              |
| Database | PostgreSQL 16, Drizzle ORM, 13 SQL migrations (0009–0012 hand-written), 30 tables, separate least-privilege roles for migrate/API/worker |
| Edge     | Caddy 2 (TLS, security headers, `forward_auth` for media rights)                                                                         |
| Mail     | SMTP via nodemailer (Mailpit locally)                                                                                                    |
| CI/CD    | GitHub Actions (`ci.yml`, `release.yml`), GHCR images per commit SHA, SSH deploy with immutable release checkouts                        |
| Backups  | `pg_dump` + restic (encrypted, off-site when configured)                                                                                 |
| Tests    | Vitest (unit + Testcontainers integration), Playwright (fixture, real-API, seeded integration, admin), axe-core, Lighthouse              |

## Component inventory

| Component         | Size / count                                                      | Notes                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | 38 files; largest `admin.ts` 2,233 LOC, `admin-more.ts` 1,978 LOC | 11 public GET routes, 2 public POST routes, 110 admin/internal routes (contract table in `admin-contracts.ts`)                        |
| `apps/worker`     | thin entry                                                        | runs `jobs.ts`: 12 job types, 6 cron schedules (Africa/Cairo)                                                                         |
| `apps/web`        | 15 pages, 8 route handlers                                        | locale-prefixed routes, nonce CSP middleware, `/api/revalidate`, `/api/trips`, `/api/trip-story`, `/api/client-error`, sitemap/robots |
| `apps/admin`      | 18 screens                                                        | mobile-first staff UI                                                                                                                 |
| `packages/db`     | schema 682 LOC, 30 tables                                         | seed from `data/catalog.json` (38 trips, 7 collections)                                                                               |
| `packages/shared` | price, booking, i18n, phone, IP, limiter, CSV, contracts          | shared by web, admin, API                                                                                                             |
| Source total      | ~40.8k LOC TypeScript (excl. tests and generated snapshots)       |                                                                                                                                       |

## Data flow and trust boundaries

```
Guest browser ──HTTPS──► Caddy ──► web:3000 (Next SSR) ──HMAC reader header──► api:4000 /v1/public/*
     │                       │                     ▲                                  │
     │                       │                     └── POST /api/revalidate ◄── worker (outbox → pg-boss)
     │                       ├──► api:4000 /v1/requests, /v1/requests/quote (Origin + JSON enforced)
     │                       └──► media host ── forward_auth → api /internal/media-access → file_server
Staff browser ──HTTPS──► Caddy ──► admin:3001 ──XHR (cookie + CSRF)──► api:4000 /v1/admin/*
api / worker ──► PostgreSQL (separate roles) ──► pg-boss ──► SMTP, Web Push, translation provider (non-core locales only)
```

Trust boundaries: (1) public internet → Caddy; (2) Caddy → web/api (only Caddy publishes ports; `/internal/*`, `/readyz`, `/api/revalidate` blocked at the edge); (3) web → API using an HMAC reader identity with its own rate budget; (4) staff session (cookie + CSRF + MFA) → admin API; (5) API/worker → DB with distinct grants; (6) worker → external providers (customer data never sent to translation).

## Strengths

- **Consistent validation**: every public and admin input passes a strict Zod schema; a contract table both documents and enforces admin routes.
- **Transactional integrity**: booking writes use a repeatable-read snapshot with row share-locks; outbox rows commit with the business change; idempotent submission receipts.
- **Least privilege throughout**: DB roles, container hardening, scrubbed subprocess environments, purpose-bound crypto (AAD/HMAC per purpose).
- **Single source of price truth**: one `estimateTrip` shared by web, admin and API, verified against the spec by differential fuzzing.
- **Operational thinking**: immutable per-SHA deploys, pre-migration backups, health-gated rollback, erasure ledger replay after restore.

## Architectural risks

| ID      | Risk                                                                                                                                                                                                          | Evidence                                         | Recommendation                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| ARCH-01 | **Two caches disagree after restart.** The Next data cache is persisted on a volume, while Next's tag-invalidation record is in memory.                                                                       | BUG-05 (CONFIRMED)                               | Make the web data cache ephemeral, or use a cache handler that persists tags with entries.                                   |
| ARCH-02 | **Cache correctness is unobservable.** Nothing verifies that what visitors see matches the DB; BUG-06 went unnoticed in a long-running process.                                                               | BUG-06                                           | Synthetic API-vs-page price monitor; log revalidation outcomes in the web process.                                           |
| ARCH-03 | **Full-catalog loads per request.** `loadCatalog` rebuilds the whole catalog (prices, itinerary, translations) for single-trip reads; the API has no response cache, so it relies on the Next cache in front. | PERFORMANCE_REPORT: ~68 ms p50 for a 3.3 KB trip | Acceptable at 38 trips; add per-entity queries or a short in-process memo before the catalog grows.                          |
| ARCH-04 | **Large hand-maintained route modules** (`admin.ts`, `admin-more.ts` ≈ 4.2k LOC) and a separate contract table that must stay in sync with handlers.                                                          | Route sweep found no gap today                   | Generate handlers from contracts or co-locate contract + handler per feature.                                                |
| ARCH-05 | **Migration tooling split** between generated and hand-written SQL.                                                                                                                                           | BUG-01                                           | Pick one mode; enforce it in CI.                                                                                             |
| ARCH-06 | **Locally patched framework** (Next 15.5.29) with non-upstream cache logic.                                                                                                                                   | `patches/`, FileSystemCache "seed read" code     | Re-evaluate the patch and its interaction with BUG-06 on each Next upgrade; document the upstream issue link.                |
| ARCH-07 | **Single VPS** is a single point of failure for web, API, DB and media.                                                                                                                                       | prod compose                                     | Documented and acceptable for this business size; recovery relies on backups + runbook (off-site restore not yet rehearsed). |

## Technical debt (non-blocking)

- Repository weight: 1.7 GiB pack, 585 MB of ignored media tracked (BUG-04).
- Tests write into `docs/` (BUG-02).
- `pnpm audit` (all deps) red due to dev tooling; Dependabot updates failing (SEC-01).
- Some owner e-mails not localized (BUG-03).
