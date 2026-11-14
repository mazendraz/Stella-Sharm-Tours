# ADR 0001 — Self-hosted runtime and release boundaries

Status: accepted for local implementation, 2026-11-12.

Use Hono + PostgreSQL 16 + pg-boss in the existing pnpm workspace. No hosted BaaS,
Redis or payment provider is needed. Migration, API and worker DB roles are
distinct; runtime roles have no schema/role creation privileges. The worker
uses a transactional outbox and signs/authenticates cache invalidation.

Use separate production/staging Compose projects, data roots and secrets, with
one public production Caddy gateway and an authenticated unpublished staging
gateway. Core translations are authored directly and bundled in all seven
languages. A shared image is promoted by immutable SHA; server-injected public
runtime URLs keep browser requests/canonicals tied to the selected environment.

Health probes prove dependencies, not business completeness. The admin process
is a route-only scaffold until file 05; production deployment refuses its image.
Operational acceptance requires a real VPS, domain, protected repository,
SMTP/off-site credentials and operator alert setup, all still external gates.

For error aggregation, use a small opt-in Sentry/GlitchTip-compatible envelope
transport with allowlisted codes and services. It deliberately accepts no raw
Error/request/user values and has no replay/tracing or automatic PII collection.
This trades detailed stack diagnostics for a strict privacy boundary and no
mandatory external SDK/provider. Local tests inject the transport; real DSN and
ingestion acceptance remain operator work. Analytics is also off until real
self-hosted configuration is supplied; guards filter private routes and payloads.
