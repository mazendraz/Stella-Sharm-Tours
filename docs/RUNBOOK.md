# Operations runbook

Runtime preparation: [VPS setup](../infra/server-setup.md). This repository has
not been deployed remotely. Use separate `production` and `staging` environments.
The staff dashboard is implemented; local verification and remaining acceptance
gates are in [admin verification](admin-verification.md).

## Deploy, diagnose, rollback

Run as `deploy` from `/srv/stella/repo`:

```bash
bash infra/deploy-release.sh staging 0123456789abcdef0123456789abcdef01234567
bash infra/monitoring/check.sh staging
bash infra/deploy.sh staging --rollback
```

Use an actual tested commit SHA, never the sample. Production uses the same SHA
images already accepted in staging; a `vX.Y.Z` tag must point at that exact
commit present in both main and develop. No production rebuild. The deploy
script snapshots each release's proxy configuration, backs up first, runs migrations once before the new API, waits for all
readiness/heartbeat probes and restores previous images/proxy snapshot on failure. It never
automatically reverses database migrations; migrations must remain compatible
with the previous release. A first-deploy failure stops applications and keeps
the DB. Previous/current release records update only after successful health.

The release entry point archives the exact commit’s `infra/` directory under
`/srv/stella/release-checkouts/<SHA>`. It leaves the shared Git checkout in place.
Each environment holds its own deploy lock for migrations, backup, health checks
and rollback. The migration service uses the API image and bootstraps the worker
queues as well as database migrations. Migration `0009` records bundled core
translation provenance and prevents the worker from writing machine translations
in the seven core languages. The recipient push queue is created by the same
migration service.

For a fresh environment, deploy the scoped database roles with the API and
worker images from the same release. For an existing environment running
images from before migration 0006, first stage a compatibility release with
the updated API and worker and the additive SQL objects, then rehearse rollback
to that compatible release before applying the narrower grants. Earlier
workers use direct queries that require the old broad permissions. Keep a
compatible image available for rollback once the new grants are in force.

To inspect an environment safely without printing secrets:

```bash
source infra/lib.sh
load_environment staging
compose ps
compose logs --tail 100 api worker
```

Do not publish raw logs or run `compose config` without `--quiet` in CI/chat:
resolved config contains secrets. There are no HTTP access logs with request
bodies or query strings. App logs must contain codes/counts, not names/phones,
auth links or tokens. Public `/healthz` is liveness; internal `/readyz` checks
API/DB reachability. Worker heartbeat advances only after a successful DB outbox
poll. Admin probes do not replace an authenticated dashboard workflow check.

## Backup and monthly restore drill

```bash
bash infra/backup/backup.sh production
# Load owner-only backup.env in a private shell, then:
restic snapshots --tag stella-production
bash infra/backup/restore-snapshot.sh SNAPSHOT_ID /srv/stella/recovery-YYYYMMDD
bash infra/backup/restore-to-staging.sh /absolute/restored/path/database.dump
```

`restore-snapshot.sh` requires an explicit snapshot ID and a **new** directory,
runs `restic check` and verifies restored files. `restore-to-staging.sh` refuses
production project/path/DB settings, holds a deploy lock and stops the gateway
and apps. It restores **only stella_staging**, deletes requests, sessions,
staff identities, auth tokens, outbox, audit/revisions/drafts, reviews and the
job schema, then reapplies reviewed migrations/role grants. Staging stays
**stopped even on success**, until the operator imports approved public media
and provisions a separate staging owner. On failure it stays offline.

Never copy production originals/auth keys/env files into staging. Selectively
copy only processed public variants referenced by published content, after
checking rights. Restic backups contain private originals/DB dumps; recovery
storage is owner-only and encrypted at rest/off-site. Test an actual image and
video after restore, plus all seven core locales, totals, auth and a synthetic
booking to isolated Mailpit. Record snapshot ID, age, restore duration and result.
The local dump drill is not evidence of an off-site/provider restore.

Optional `stella-staging-refresh.timer` runs at 02:45 Cairo, after the backup.
Its script requires a fresh production dump, restores/scrubs only staging and
copies only public processed media (no originals/keys), without deleting existing
staging files. It **leaves staging stopped**. Keep this timer disabled until the
operator has arranged separate staging account/media reprovisioning and accepts
that nightly testing data is replaced. It is never enabled by the setup script.

Local dumps are kept for 7 days; encrypted snapshots retain 7 daily, 4 weekly and
12 monthly. A backup without off-site credentials logs a warning; production
monitoring fails until an off-site success exists within 26 hours. Track backup
encryption keys separately in the owner's vault. Monitor failed systemd units.

> **TODO (before relying on production — audit INF-01/INF-02).** The production
> server has neither the off-site backup nor the operator alert webhook yet, so
> `infra/monitoring/check.sh` (which `deploy.sh` runs and rolls back on) has two
> temporary opt-outs:
>
> - `OFFSITE_BACKUP=pending` in `/srv/stella/production/compose.env` turns the
>   off-site check into a warning. Without it the check fails.
> - A missing `/etc/stella/alerts/webhook-url` only logs a warning.
>
> Once restic and the webhook are configured and one off-site backup has
> succeeded, remove `OFFSITE_BACKUP=pending` from compose.env and make the
> webhook check fatal again in `check.sh`.

**Erasure after a restore.** Backups keep customer requests for up to 12 months,
including requests later erased on request. Every erasure records a keyed hash
of the phone number and its time in `privacy_erasures` (never the number). The
API re-applies the ledger at start-up, removing restored requests created at or
before each erasure and logging `Re-applied privacy erasures after a restore`.
After a production recovery, confirm that log line (or that none was needed)
before reopening the site. The privacy notice must state the backup retention
period; the owner approves that wording with the legal text.

## Monitoring and maintenance

Optional self-hosted tools are in `infra/monitoring/docker-compose.tools.yml`.
Pin images, provide separate analytics DB credentials, initialize tools through
SSH tunnels and change defaults before exposing any dashboard. There is no
Docker socket mount. Uptime Kuma probes the public home, one trip, API health,
TLS expiry and the systemd checks; configure and test real notifications.
Umami has no visitor cookies. Enable its script only after configuring the
real website ID and approved stats origin/CSP; no invented analytics ID ships.
Private `SENTRY_DSN` values can be set in api/web env files and optional
`admin.env`. The minimal Sentry/GlitchTip envelope transport sends only a known
event code, service and generated event ID/time, capped at 30 events/minute per
process; it does not accept raw error or customer data. Browser reports use an
Origin-checked, bounded same-origin endpoint; failures never break the app.
Actual ingestion/alert delivery remains an operator acceptance gate. This is
not a full SDK, stack trace, replay or performance tracing deployment.

Set `UMAMI_SCRIPT_URL=https://stats.REAL_DOMAIN/script.js` and the real
`UMAMI_WEBSITE_ID` in web.env only after configuring self-hosted Umami. The
runtime script gets a nonce; CSP permits only that matching stats origin.
The pre-send guard excludes previews, confirmations and My trip, strips queries,
hashes and referrer paths and allowlists event data. Defaults load no tracker.
Use `infra/caddy/tools.caddy.example` for public collection endpoints and an
authenticated dashboard after changing defaults. Owner operational mail supports
EN/IT/ES/FR/DE/RU/TR through `OWNER_REPORT_LOCALE`; scheduled Monday 09:05 Cairo.

Every `check.sh` run (the 5-minute monitor and the post-deploy gate) also
compares six trips per run, rotating through the catalog, between the API and
the rendered website: availability and the priced offers. A difference that
lasts past the 60-second cache window fails the check and alerts. Each
accepted cache refresh is logged by the web container as a
`{"event":"cache_revalidated",...}` line (tag names only). If the alert fires:
compare `docker compose logs web | grep cache_revalidated` with the staff edit
time; restarting the web container clears its cache safely.

Quarterly: review dependency/image pins and runtime Node/Postgres minor versions,
staff roles/keys, disk, dead content, secret rotation and restore evidence.

## Incidents

File-04 security upgrade: run the additive DB migration before starting new
API/workers. Session IDs now use HMAC-SHA-256 keyed by `SESSION_SECRET`; existing
staff cookies need a fresh login. Rotating that secret invalidates all active
cookies immediately. Never rotate `TOTP_ENC_KEY` without a planned encrypted-secret
migration/recovery procedure. Device recognition is notification-only (90 days),
not a trusted login factor. New-device email uses `OWNER_REPORT_LOCALE` and the
actual account email; test delivery before launch. Dashboard routes arrive in 05.

Privacy requests: verify the requester before export/erase. The authenticated
API exposes `POST /v1/admin/privacy/requests/export` with `{phone}` and
`POST /v1/admin/privacy/requests/erase` with `{phone,confirm:true}`. Both require
owner/manager, recent reauthentication, admin Origin and CSRF. Keep exports
private, transfer only to the verified requester and delete local copies under
the approved retention procedure. No Undo exists for privacy erasure. Review
already-delivered staff mail/WhatsApp separately. Record erasure references in
the owner's restricted process and reapply them after restoring any older backup
before bringing production online; define backup expiry/retention before launch.
Do not put customer identifiers in tickets, Git, URLs or general audit notes.

`pnpm privacy:prepare` adds unpublished seven-locale drafts only if the privacy
page has no blocks. It never overwrites staff drafts or published copy. Complete
the legal review checklist in `data/privacy-draft.json` before publication.
Local scan procedure and external gates: `docs/security-verification.md`.

## Dashboard access and notifications

Generated deployment config now includes required `env/admin.env` with
`SITE_URL` and `PUBLIC_API_URL`. For an existing environment add this file with
owner-only permissions; preserve the existing database/auth credentials. API
`ADMIN_ORIGIN` must exactly match the dashboard origin. `/readyz` checks browser
URLs as well as the internal API. Configure HTTPS before real staff access.

The original owner link is written privately during seed. Never reseed to reset a
password. On generated localhost development only, `pnpm admin:setup-link`
refreshes an unfinished owner's one-use setup token; an established password is
preserved. Use dashboard reset/invite flows and the configured mail transport for
other accounts. Owners/managers always need MFA; the owner can require it for
other roles. Role/MFA policy changes revoke existing sessions. Recovery codes
are displayed once and must be stored privately by their owner.

Optional push: generate a VAPID pair with the installed `web-push` library in a
trusted terminal, store the private output outside Git, and set
`VAPID_PUBLIC_KEY` on API and worker. Set matching `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT` (`mailto:` address or HTTPS URL) **only on the worker**. All three
worker values are required together. Restart API/worker, then each staff member
enables notifications under My account on their own installed HTTPS dashboard.
No keys are provisioned/enabled by local acceptance. Push payloads contain a
locale only; customer names/phones/references never reach push providers. Push
and mail use independent durable queues; a push failure cannot prevent mail.
Each installation receives its own retryable job. A failed installation does not
cause completed deliveries for other installations to be retried.
Only active owner/manager/sales accounts receive push. Revoking all sessions
removes subscriptions; browsers may re-enable them after signing in again.

Content/price/status writes return their exact revision IDs for a 10-second Undo
action, available inside an open sheet as well as the toast. Item history and
Activity → History provide later restore; large price changes and sensitive
settings still require their normal confirmation/reauthentication. Restore itself
creates a revision. New trip/collection/hero Undo archives the draft; FAQ Undo
returns it to draft. Password changes, recovery use, session revocation, user
offboarding and privacy erasure intentionally have no reversal that resurrects
credentials or erased personal data. Verify a requester before privacy export;
downloaded CSV/JSON files remain the operator's private responsibility.

Compromised account: disable it, revoke all sessions, review audit/revisions,
rotate affected secrets and SSH keys, recover approved content. Site down:
check dependency probes, disk, worker/queue, then previous images. Data loss:
restore and verify **staging first**; production recovery is a separate deliberate
operator action with a fresh safety backup and a maintenance window. Never use
the staging restore command to target production.
