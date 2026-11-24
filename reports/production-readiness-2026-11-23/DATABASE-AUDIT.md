# Database audit (PostgreSQL 16)

## Supabase / RLS applicability

This project uses **no Supabase** (`AGENTS.md` forbids it). No database is exposed through PostgREST or a public client key. PostgreSQL listens only on the Docker `internal` network (`docker-compose.prod.yml`: `networks: [internal]`, `internal: true`) and has no published port in production. Row-level security, storage buckets and anon/authenticated policies **do not apply**. The equivalent control is per-role table and column grants, reviewed below.

## Roles and grants

| Role             | Used by                  | Privileges                                                                                                                                                                                                                                        | Source                                                                      |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `stella_migrate` | migrations, seed, backup | Cluster superuser (it is `POSTGRES_USER`)                                                                                                                                                                                                         | `docker-compose.prod.yml`, `postgres-init-prod.sh`                          |
| `stella_api`     | API                      | Explicit table grants. No DELETE on `trips`, `media`, `collections`, `hero_slides`, `faqs`, `settings`. Append-only on `audit_log` and `revisions`. Customer scrubbing goes through the `SECURITY DEFINER scrub_request_history(uuid[])` function | `packages/db/src/runtime-privileges.ts:4-11`                                |
| `stella_worker`  | worker                   | Read-only catalog, **column-level** access to `admin_users`, `booking_requests` and `admin_devices`. Customer PII is reachable only through `SECURITY DEFINER worker_request_notification()`, which filters out anonymized, spam and expired rows | `runtime-privileges.ts:12-24`, `0006_runtime_database_privileges.sql:71-84` |

- `REVOKE ALL ON DATABASE … FROM PUBLIC` and `REVOKE CREATE ON SCHEMA public FROM PUBLIC` are applied (`postgres-init-prod.sh`).
- `SECURITY DEFINER` functions pin `search_path = pg_catalog, pg_temp`, and `EXECUTE` is revoked from PUBLIC (`0006…sql:114-117`). This is correct.
- **Cross-check performed:** every `.insert/.update/.delete` on a table in `apps/api/src/*.ts` was enumerated. The only writes not covered by `stella_api` grants (`delete trips`, `delete/insert public_media_renditions`, `update booking_request_receipts`) occur in test files or in the worker path (`media.ts:409`, run by `stella_worker`, which has `INSERT ON public_media_renditions`). **No missing grant** would cause a production-only 500.

## Migrations

- `0000`–`0010`, applied by `scripts/migrate.ts` as `stella_migrate`. The deploy runs a backup first and never rolls back automatically (`infra/deploy.sh:36-41`).
- Integration test `operations.integration.test.ts` restores a real `pg_dump` and scrubs staging data. It passed (68/68 suite).

## Findings

### DB-01: Backups retain erased customer data; the restore drill is unproven

- **Severity:** Medium · **Confidence:** High · Same root cause as SEC-10 and INF-02
- **Files:** `infra/backup/backup.sh:14-35`, `infra/monitoring/check.sh:15-19`
- **Explanation:** A nightly `pg_dump -Fc`, verified with `pg_restore --list`, is kept locally for 7 days. Off-site restic is **optional**: `OFFSITE_BACKUP=pending` downgrades the monitor to a warning. Snapshots keep data for 12 months. No production restore has been rehearsed (`QUESTIONS.md`: "off-site restore drill" is open).
- **Impact:** Losing the VPS before off-site backup is configured means total data loss. Erasure requests are not honoured in backups.
- **Fix:** Configure restic before launch, remove the `pending` escape hatch in production, run and record `restore-snapshot.sh` → `restore-to-staging.sh`, and implement the erasure re-application described in SEC-10.
- **Verification:** A dated restore-drill record in `docs/RUNBOOK.md`, and `check.sh production` passing without the warning.

### DB-02: No server-side timeouts for runtime roles

- **Severity:** Low · **Confidence:** High
- **Evidence:** `grep -r "statement_timeout|idle_in_transaction|lock_timeout"` across `apps packages infra scripts` returns nothing.
- **Impact:** A stuck query or an abandoned transaction can hold locks indefinitely (see BUG-02). The application pool's `connectionTimeoutMillis: 5000` (`packages/db/src/index.ts`) bounds only waiting for a connection.
- **Fix:** `ALTER ROLE stella_api SET statement_timeout='15s', idle_in_transaction_session_timeout='60s', lock_timeout='5s'`. Use more generous values for `stella_worker`, and longer or none for `stella_migrate`. Apply it in `applyRuntimePrivileges`.
- **Verification:** `SELECT rolname, rolconfig FROM pg_roles WHERE rolname LIKE 'stella_%'`.

### DB-03: Empty migrations in the journal

- **Severity:** Informational
- **Files:** `packages/db/drizzle/0004_tired_zombie.sql` (0 bytes), `0008_request_export_cursor.sql` (0 bytes). Both are listed in `meta/_journal.json`.
- **Explanation:** The name `request_export_cursor` suggests intended DDL. Export paging may rely on `requests_created_id` (`schema.ts:486`), which already exists. Confirm with the author that nothing was lost. Never edit applied migrations.

### DB-04: Missing supporting indexes (low volume today)

- **Severity:** Low · **Confidence:** Medium (no production data volume to measure)
- **Evidence** (`packages/db/src/schema.ts`):
  - `sessions.user_id`: no index. Used by `delete … where user_id=` in logout-all, password change and role change.
  - `rate_buckets.expires_at`: no index. Hourly cleanup scans all rows, and every public write adds a row.
  - `outbox.delivered_at`: no partial index for undelivered rows or the 30-day purge.
  - `booking_request_items.trip_id`: FK with no index (PK is `(request_id, trip_id)`).
  - `audit_log.created_at`: audit pages sort by time and only `(entity, entity_id)` is indexed.
- **Fix:** Add these indexes in a new additive migration (`CREATE INDEX CONCURRENTLY` is not available inside drizzle transactions; the tables are small, so plain is fine).
- **Verification:** `EXPLAIN` on the cleanup and audit queries.

### DB-05: Migration role is a superuser

- **Severity:** Informational
- Same as SEC-I3. Consider a dedicated owner role with `CREATEROLE` only, so a compromised migration image cannot reach the OS through `COPY … PROGRAM`.

## Data integrity

- FKs with `ON DELETE CASCADE` where ownership is clear (sessions, devices, tokens, request items, trip children). `RESTRICT` (the default) on `trip_media.media_id` and `booking_request_items.trip_id` keeps history.
- `citext` unique on `admin_users.email` handles case-insensitive login.
- Unique `(entity, entity_id, field, locale)` on translations and `(entity, entity_id, section)` on drafts.
- Retention: `request_retention_cutoff()` drives the daily purge, and the worker's notification function refuses expired rows.
