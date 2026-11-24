# Production readiness: infrastructure, CI/CD and operations

## Checklist

| Area                                               | State                     | Evidence                                                                                                                       |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Source control and CI ran on the release SHA       | **FAIL**                  | PR-01                                                                                                                          |
| Production environment variables validated at boot | Pass                      | `apps/api/src/config.ts` (zod, HTTPS origins, key lengths, dev-only flags refused)                                             |
| Secrets outside repo, file mode enforced           | Pass                      | `.env` untracked; `infra/lib.sh:18` requires mode 600 and owner                                                                |
| HTTPS / TLS                                        | Pass (design)             | Caddy automatic ACME, HSTS `max-age=63072000; includeSubDomains; preload` (`infra/caddy/common.caddy`)                         |
| Security headers                                   | Pass                      | Verified live on the verify stack: CSP nonce, XFO DENY, HSTS, nosniff                                                          |
| Container hardening                                | Pass                      | `read_only`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit`, `mem_limit`, digest-pinned postgres and caddy                 |
| Network isolation                                  | Pass                      | postgres on the `internal` network only; Caddy blocks `/internal/*`, `/readyz`, `/media/*` on the API host                     |
| Health checks                                      | Pass                      | `/healthz`, `/readyz` (DB), compose healthchecks for every service, worker heartbeat file                                      |
| Rate limiting                                      | Partial                   | Present in the app; SEC-01 (reproduced), SEC-02, SEC-03; no edge rate limit in Caddy                                           |
| Logging                                            | **Partial**               | JSON logs with rotation (50 MB × 5), but errors have no detail (OPS-01)                                                        |
| Error tracking                                     | Optional                  | Sentry envelope with allowlisted codes only (`packages/shared/src/operational-errors.ts`); disabled unless `SENTRY_DSN` is set |
| Alerting and uptime                                | **FAIL**                  | INF-01                                                                                                                         |
| Backups                                            | **Partial**               | Nightly local dump plus a backup before each deploy; off-site optional (INF-02)                                                |
| Restore procedure                                  | Documented, not rehearsed | `infra/backup/restore-snapshot.sh`, `restore-to-staging.sh`; integration test restores a dump                                  |
| Rollback                                           | Pass                      | `infra/deploy.sh`: automatic restore of previous images on failed health, `--rollback`, proxy config snapshot per release      |
| DB connectivity and pooling                        | Pass, with notes          | `pg.Pool max 10`, 5 s connect timeout; no server-side timeouts (DB-02)                                                         |
| Resource limits                                    | Pass                      | api 768 MB, worker 1 GB, caddy 256 MB, postgres 768 MB, tmpfs `/tmp`                                                           |
| Availability                                       | Single host               | Accepted for the business size; deploy recreates containers, so expect a brief blip                                            |
| Launch content and legal                           | **FAIL**                  | PR-02                                                                                                                          |

## Findings

### PR-01: Release provenance. No remote, uncommitted tree, `HEAD` does not build, CI never run

- **Severity:** Critical (release blocker) · **Status:** Confirmed · **Confidence:** High
- **Evidence:**
  - `git remote` is empty. Branches are `main` (1 commit: "baseline import") and `admin-rebuild` (13 commits ahead).
  - `git diff --shortstat`: 166 files changed, +26,758 / −13,920. There are 103 untracked paths, including runtime code such as `apps/api/src/booking-quote.ts`, which is imported by `apps/api/src/app.ts:34`, `publication-languages.ts`, `web-dictionaries.ts` and `apps/web/next.config.mjs`. `apps/admin/next.config.ts` is deleted but its `.mjs` replacement is untracked.
  - `.github/workflows/release.yml` deploys from the `develop` branch or `v*` tags. Neither exists.
  - `QUESTIONS.md:9-12, 28-30` confirms that remote CI, branch protection and deployment were never exercised.
  - Files changed while this audit was running (`request-sheet.tsx` at 19:44).
- **Impact:** Nothing that is tested can be shown to be what is deployed. A clone of `HEAD` fails to compile. All the CI hardening (secret scans, audit, integration, e2e) has never run in practice.
- **Fix:** See remediation steps R1–R3.
- **Verification:** A green CI run on GitHub for the exact SHA that is tagged for release.

### PR-02: Launch prerequisites outstanding (owner-side)

- **Severity:** High (release blocker) · **Status:** Confirmed (project's own records) · **Confidence:** High
- **Source:** `QUESTIONS.md:20-25, 101-113`
- **Items:** a real domain, DNS and VPS with a named operator; production SMTP; HTTPS device push; off-site backup with a restore drill; external alerting; media permissions and source records plus missing real imagery; legal entity and an approved privacy policy in 7 languages; native-speaker review of the 7 authored locales; staff usability sessions; manual accessibility and device checks; mobile LCP under 2.5 s.
- **Note:** `infra/deploy.sh:31-34` already refuses production for `example`, `.invalid` and `.test` hostnames and for a scaffold admin image. Those are good guardrails.

### INF-01: No guaranteed external alerting; no off-host uptime check

- **Severity:** Medium · **Status:** Confirmed (code) · **Confidence:** High
- **Files:** `infra/monitoring/alert.sh:7-8` (`[[ -s "$credential" ]] || exit 0`), `infra/monitoring/stella-monitor@.timer`
- **Explanation:** Without a webhook file, failures go only to the local syslog, and the script exits successfully. All monitoring runs on the same VPS, so a host outage, network loss or full disk that stops systemd alerts nobody.
- **Fix:** Make the webhook mandatory for `production` (fail `check.sh` if it is missing). Add an external uptime monitor (any free HTTP checker) on `https://WEB_HOST/healthz` and `https://API_HOST/healthz`, plus TLS expiry.
- **Verification:** Stop the `web` container on staging. An external alert arrives within 5 minutes.

### INF-02: Off-site backup can be skipped in production

- **Severity:** Medium · **Status:** Confirmed (code) · **Confidence:** High
- **Files:** `infra/backup/backup.sh:27-34`, `infra/monitoring/check.sh:15-19`
- See DB-01. Off-site backup is a warning only when `OFFSITE_BACKUP=pending`. Require it for the first production deploy.

### INF-03: Every media request hits API and DB via `forward_auth`, unthrottled

- **Severity:** Low · **Status:** Confirmed (code) · **Confidence:** Medium
- **File:** `infra/caddy/common.caddy:31-35` (`forward_auth api:4000 … uri /internal/media-access`), `header Cache-Control "public, no-cache, must-revalidate"`
- **Explanation:** This is intentional, so that rights revocation takes effect immediately. But each image or video request, including every revalidation and every video Range chunk, runs a DB query. The `/internal/media-access` path is outside the `/v1/public/*` limiter. A client looping over media URLs drives DB load with no limit.
- **Fix:** Cache the authorization decision for a short time (for example a 30–60 s in-process LRU in the API), or set `max-age=60` plus `no-cache` only on revocation. Add a Caddy rate limit for `MEDIA_HOST`.
- **Verification:** Load test of 200 requests per second on one poster URL. DB queries per second should stay roughly constant.

### CI-01: Possible cancellation race between the standalone CI and the release-called CI

- **Severity:** Low · **Status:** Suspected · **Confidence:** Low-Medium
- **Files:** `.github/workflows/ci.yml:3-10` (`push: [main, develop]`, `concurrency: checks-${{ github.ref }}`, `cancel-in-progress: true`), `.github/workflows/release.yml:12-13` (calls `ci.yml` on push to `develop`)
- **Explanation:** A push to `develop` starts both workflows. Both evaluate the same concurrency group `checks-refs/heads/develop`, so one can cancel the other. If the reusable-workflow copy is the one cancelled, `deploy` is skipped (`needs.checks.result == 'success'` is false).
- **Fix:** Use `concurrency: checks-${{ github.workflow }}-${{ github.ref }}`, or drop `develop` from `ci.yml`'s push trigger.
- **Verification:** Two consecutive pushes to `develop` both reach `deploy`.

### Informational

- **INF-I1:** Workflow supply chain: SEC-04 and SEC-05.
- **INF-I2:** The deploy recreates containers in place, so expect a few seconds of 502s. Acceptable. Document it in the runbook, or add a Caddy `lb_try_duration` to absorb it.
- **INF-I3:** Developers need Node 22, but the host default is 24 (QUAL-02).
