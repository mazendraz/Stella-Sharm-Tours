# Security audit (OWASP Top 10 2021 / ASVS 5.0 reference)

Status labels: **Confirmed (reproduced)**, meaning exploited on the local verify stack. **Confirmed (code)**, meaning the code path was verified by reading but not exercised. **Suspected**, meaning it depends on deployment facts that could not be observed.

## Coverage summary

| Area                              | Result                                                                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection (A03)               | **No issue.** All queries go through drizzle or tagged `sql` templates with bound parameters. Identifiers in `runtime-privileges.ts` are quoted with `quote()`. The search `ilike` binds its pattern; see SEC-09 for wildcard handling.                                 |
| XSS (A03)                         | **No issue found.** React escaping, nonce-based `script-src` in web and admin middleware, and staff emails are plain text (`jobs.ts`). The API CSP is `default-src 'none'`. `style-src 'unsafe-inline'` is an accepted, documented ZAP Medium.                          |
| CSRF                              | **No issue.** SameSite=Strict, exact Origin check, and a double-submit token bound to the session by HMAC (`auth.ts:289-299`). Public POSTs require the exact `Origin` and `application/json` (`app.ts:132-141`).                                                       |
| SSRF                              | **No issue.** Server-side fetch targets come only from config (`API_INTERNAL_URL`, `WEB_REVALIDATE_URL`, translation provider URL). ffmpeg and ffprobe use `-protocol_whitelist file,pipe`.                                                                             |
| IDOR / privilege escalation (A01) | **No issue.** Roughly 90 admin routes were enumerated, and each has a guard plus a permission. Revision restore maps the entity to a permission (`admin-more.ts:1294-1320`). User admin blocks self role changes and removing the last owner (`admin-more.ts:162-185`). |
| AuthN / session (A07)             | **Strong.** Argon2id (19 MiB, t=2), dummy-hash timing equalisation, per-IP and per-account login limits, exponential lockout, TOTP replay protection, recovery codes, session rotation on 2FA, password change and reset, plus new-device email.                        |
| Secrets (A02)                     | **No secrets in tracked files.** `.env` is ignored and untracked. gitleaks configs exist. Only env _names_ were inspected.                                                                                                                                              |
| File upload                       | **Strong.** Size caps (25 MB images, 300 MB video), magic-byte type check, pixel limit, codec allowlist, a 3,600 s duration cap, ffprobe protocol whitelist, an environment scrubbed for child processes, and quarantine before content addressing.                     |
| Security headers                  | API: helmet-style `secureHeaders` with `default-src 'none'`. Caddy adds HSTS preload, nosniff, `X-Frame-Options DENY` and Permissions-Policy. Verified live on the verify stack.                                                                                        |
| Dependencies (A06)                | `pnpm audit --prod` is clean. The Next 15.5.29 patch is documented in `docs/dependency-patches.md`. Renovate is configured.                                                                                                                                             |
| GitHub Actions                    | `permissions: contents: read` by default, `packages: write` only on the build job, SSH host pinning via `known_hosts`, inputs validated by regex before `ssh`. See SEC-04 and SEC-05.                                                                                   |
| Rate limiting                     | Present on every public write and auth endpoint, but see SEC-01, SEC-02 and SEC-03.                                                                                                                                                                                     |

---

## SEC-01: Public web proxy can exhaust the shared "catalog-reader" quota and break server-side rendering

- **Severity:** Medium · **Status:** Confirmed (reproduced locally) · **Confidence:** High
- **Files:** `apps/web/src/app/api/trips/route.ts:4-30`, `apps/web/src/app/api/trip-story/route.ts:3-20`, `apps/web/src/lib/api.ts:21-51`, `apps/api/src/app.ts:158-185`
- **Explanation:** Every server-side read from the web app sends `X-Stella-Catalog-Reader`. The API puts all those requests into **one** bucket (`key = 'catalog-reader'`) capped at `max(2400, PUBLIC_READS_PER_MINUTE)` per minute. The unauthenticated public routes `/api/trips?slugs=…` and `/api/trip-story?slug=…` forward any regex-valid slug to the API with that trusted header. Unique slugs miss the Next data cache, so each attacker request spends one unit of the site-wide quota. Once it is spent, every uncached SSR fetch (pages, saved trips, stories, new locales) fails until the minute window rolls over.
- **Evidence / reproduction (local verify stack only):**
  ```
  seq 1 5000 | xargs -P 128 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
    "http://127.0.0.1:4985/api/trips?locale=en&slugs=probe2-{}" | sort | uniq -c
  # → 4827 200, 173 503   (503 = web mapping of API 429 RATE_LIMITED)
  ```
  The local Docker Desktop stack sustained only about 45 requests per second. A Linux VPS would serve faster, so exhaustion would come sooner and last longer.
- **Impact:** Unauthenticated, low-cost partial outage of the public site. Booking writes are unaffected because they go from the browser to the API under per-IP limits.
- **Recommended fix:** (a) Give the public proxy routes their own per-client limit in the web app, or call the API _without_ the trusted header so they fall under the caller's per-IP quota (forward the client IP through a dedicated trusted header). (b) Reserve the trusted bucket for cacheable page reads only. (c) Optionally reject slugs that do not exist via a cached slug index before calling the API.
- **Verification:** Repeat the burst. Page SSR and `/en/...` must keep returning 200, and the attacker's own requests should get 429.

## SEC-02: In-memory public rate-limit map fails closed globally at 10,000 keys

- **Severity:** Medium · **Status:** Confirmed (code), not reproduced (needs more than 10,000 source IPs) · **Confidence:** Medium-High
- **File:** `apps/api/src/app.ts:168-173`
- **Explanation:** When a client's bucket is missing or expired and the map holds more than 10,000 entries with none expired, the code calls `fail(429)` for that client. That also applies to the trusted `catalog-reader` key when its 60-second window rolls over. An attacker who can present more than 10,000 distinct source addresses per minute (botnet, or IPv6 rotation if the VPS is reachable over IPv6; see SEC-03) locks out **every new visitor and server-side rendering**.
- **Reproduction (staging):** From an IPv6 /64, send one request each from 10,001 distinct addresses to `/v1/public/locales` within 60 s. Then a fresh client, and the web SSR after its window rolls, receive 429.
- **Impact:** Site-wide denial of service.
- **Fix:** Evict the oldest entries (LRU) instead of failing closed, or key IPv6 by /64. Always exempt or pre-create the trusted key. Consider rate limiting at Caddy (for example the `caddy-ratelimit` module) as the first line.
- **Verification:** Add a unit test that fills the map to the cap, then asserts a new key and the trusted key are still served.

## SEC-03: Per-IP limits treat each IPv6 address separately; client-IP fidelity behind Docker is unverified

- **Severity:** Low · **Status:** Suspected · **Confidence:** Low-Medium
- **Files:** `apps/api/src/auth.ts:87-98`, `apps/api/src/requests.ts:84-85`, `apps/api/src/app.ts:439`, `infra/docker-compose.prod.yml` (`ports: 80:8080, 443:8443`)
- **Explanation:** (1) The keys `login-ip:`, `request-ip:`, `quote-ip:` and the public read key hash the full IP. One IPv6 subscriber controls at least 2^64 addresses. (2) When Docker publishes ports without IPv6 enabled on the bridge, the userland proxy can present every IPv6 client to Caddy as the gateway IPv4 address. In that case all IPv6 users would _share_ one bucket: 20 logins per 15 minutes and 5 booking requests per 10 minutes, site-wide.
- **Reproduction:** On the VPS, make an IPv6 request and check that the client IP Caddy logs is the real one. Then send six booking requests from two different IPv6 clients.
- **Impact:** Either rate limits can be bypassed, or legitimate users lock each other out.
- **Fix:** Normalise IPv6 to /64 in `clientIp`. On the VPS, either disable the AAAA record or enable Docker IPv6 with `userland-proxy: false` so source addresses are kept. Document it in `infra/server-setup.md`.
- **Verification:** Run the reproduction above on staging, and add a unit test for /64 normalisation.

## SEC-04: GitHub Actions referenced by mutable tags in jobs with registry write and the deploy key

- **Severity:** Low · **Status:** Confirmed (code) · **Confidence:** High
- **Files:** `.github/workflows/release.yml:22-34,49`, `.github/workflows/ci.yml:24,26,31,96`
- **Explanation:** `actions/checkout@v4`, `docker/login-action@v3`, `docker/build-push-action@v6` and others are pinned to tags. A compromised upstream tag would run in the job that has `packages: write`, or in the deploy job with `DEPLOY_SSH_KEY`.
- **Fix:** Pin to full commit SHAs and let Renovate (`renovate.json`) update them.
- **Verification:** `grep -E 'uses: [^.].*@v[0-9]' .github/workflows/*.yml` returns nothing.

## SEC-05: `workflow_dispatch` lets anyone with write access deploy any branch to staging

- **Severity:** Low · **Status:** Suspected (environment rules cannot be observed because there is no remote) · **Confidence:** Medium
- **File:** `.github/workflows/release.yml:6, 44-47`
- **Explanation:** A manual run on any ref builds images and deploys to `staging`. Staging holds a scrubbed copy of production (`infra/backup/restore-to-staging.sh`), so this exposes it to unreviewed code.
- **Fix:** Restrict the `staging` environment to `develop` with deployment branch rules and required reviewers, or remove `workflow_dispatch`.
- **Verification:** GitHub, Settings → Environments shows the branch policy.

## SEC-06: Cryptographic key reuse without domain separation

- **Severity:** Low (defence in depth; no exploit found) · **Status:** Confirmed (code) · **Confidence:** High
- **Files:** `apps/api/src/auth.ts:474` (TOTP secret) vs `auth.ts:693` and `admin-more.ts:125` (setup and reset tokens in `outbox.data`). All are sealed with `TOTP_ENC_KEY` and the **same AAD** (the user id). `app.ts:209-214`: preview tokens are HMAC'd with `SESSION_SECRET` with no purpose prefix, while session and CSRF HMACs use the `session:` and `csrf:` prefixes.
- **Impact:** Anyone with database write access could swap ciphertexts between purposes. The ciphertexts are malleable across contexts, though no remote exploit exists.
- **Fix:** Use purpose-specific AAD (`totp:<id>`, `invite:<id>`, `reset:<id>`) and `preview:` as the HMAC prefix, ideally with HKDF-derived subkeys. Migrate by trying the old AAD on read.
- **Verification:** Unit test that a reset-token ciphertext fails to unseal as a TOTP secret.

## SEC-07: Booking "time-to-submit" bot check uses a client-supplied timestamp

- **Severity:** Low · **Status:** Confirmed (code) · **Confidence:** High
- **File:** `apps/api/src/requests.ts:94-95` (`Date.now() - b.t < 3000`)
- **Explanation:** The client sends `t`, so a bot sets `t = now - 5000`. Spam control therefore rests on the IP and phone limits alone (5 per 10 minutes per IP).
- **Fix:** Issue a signed, short-lived form token from the quote endpoint, or accept that this is a usability heuristic and document it. Note that admins can mark requests as spam.

## SEC-08: Per-phone booking limit can be used to block a real customer

- **Severity:** Low · **Status:** Confirmed (code) · **Confidence:** Medium
- **File:** `apps/api/src/requests.ts:100-108` (20 per 24 h per phone hash)
- **Scenario:** An attacker rotating IPs sends 20 valid requests with a victim's WhatsApp number. The victim's real booking returns 429 for 24 h, and staff get 20 junk requests.
- **Fix:** Count only requests that were not later marked spam, or lower the window, and show a WhatsApp fallback link on 429. The UI may already do this; check `request-sheet.tsx`.

## SEC-09: Admin request search treats `%` and `_` as wildcards

- **Severity:** Informational · **File:** `apps/api/src/admin.ts:653`
- **Explanation:** `'%' + p.q + '%'` is bound safely, so there is no injection, but user `%` and `_` act as wildcards. This only affects authenticated staff search results.
- **Fix:** Escape `\`, `%` and `_`, and add `ESCAPE '\'`.

## SEC-10: Erased customer data persists in backups for up to 12 months

- **Severity:** Medium (privacy compliance) · **Status:** Confirmed (code) · **Confidence:** High
- **Files:** `infra/backup/backup.sh:30` (`--keep-monthly 12`), `apps/api/src/admin.ts:610-650` (erasure)
- **Explanation:** Erasure deletes rows and scrubs revisions (tested), but restic snapshots keep PII for 12 months and local dumps for 7 days. `QUESTIONS.md` already marks "backup erasure/retention" as undefined.
- **Fix:** Document backup retention in the privacy notice. Add a procedure that re-applies the erasure log after any restore (keep a list of hashed phones that must be erased, and re-run erasure after restore).
- **Verification:** Restore drill → re-apply erasure list → no erased phone is present.

## Informational

- **SEC-I1:** `/v1/openapi.json` requires auth only when `NODE_ENV=production` (`app.ts:484`). Both production and staging compose set production, so this is fine. Do not deploy with another `NODE_ENV`.
- **SEC-I2:** `style-src 'unsafe-inline'` in both CSPs, the ZAP Medium noted in `QUESTIONS.md`. Accepted risk while `script-src` is nonce-based.
- **SEC-I3:** The `POSTGRES_USER` (`stella_migrate`) is the cluster superuser (`docker-compose.prod.yml`, `postgres-init-prod.sh`). Runtime roles are restricted. Consider a non-superuser migration owner.
