# 04 · Security plan

## File execution phases — owner-authorized 2026-11-12

Work locally in numeric file order and stop before file 05. Existing backend
and integration controls are audited, not assumed complete from prior checkmarks.

- [x] S1 — Map threats/controls; inspect auth, roles, endpoints, media and operations.
- [x] S2 — Close auth/session/MFA gaps, new-device alerts, revoke-all and regression tests.
- [x] S3 — Close privacy/history erasure and export gaps; prepare factual policy drafts in seven locales without publishing unapproved legal content.
- [x] S4 — Harden nonce/CSP, bodies, CORS/proxy trust, previews and upload boundaries; test adversarial inputs.
- [x] S5 — Verify containers/secrets/dependencies/backups; scoped local ZAP completed with warnings, including the plan's inline-style policy; launch acceptance remains open.
- [x] S6 — Run local code/browser gates, verify seven locales, update evidence/checklists and hand off. See `docs/security-verification.md` for exact scope and open findings.
- [ ] External acceptance — real VPS/HTTPS, authenticated admin UI scan (file 05), off-site restore, legal approval and actual staging ZAP.

Goal: nothing breaks, nothing leaks, and a mistake in the admin can be undone. Baseline: OWASP ASVS L2 for the admin and API, OWASP Top 10 for the public site. Customers are mostly EU (Italy) → **GDPR applies**.

## 1. Threats we design against

| Threat                                           | Mitigation                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin account takeover (phished/reused password) | argon2id, breached-password list, lockout, new-device email alert, session list with "log out everywhere" (no 2FA: owner decision 2026-11-25) |
| Staff mistake (wrong price, deleted trip)        | revisions + one-tap Undo, soft delete, role limits, audit log, staging                                                                        |
| Spam / fake booking requests                     | honeypot, min fill time, rate limits, phone/email format checks, `spam` status                                                                |
| Injection (SQL, XSS)                             | Drizzle parameterised queries only, zod validation, React escaping, sanitised rich text, strict CSP                                           |
| Malicious upload                                 | magic-byte check, re-encode everything, no SVG/HTML, size limits, files served from a separate subdomain with `nosniff`                       |
| Server compromise                                | SSH keys only, firewall, unattended upgrades, non-root containers, DB not public, secrets outside git                                         |
| Data loss                                        | encrypted off-site backups, monthly restore test                                                                                              |
| Data leak of customers' phone numbers            | least-privilege roles, IP hashing, log scrubbing, retention limit, HTTPS everywhere                                                           |

## 2. Authentication (admin)

- Passwords: argon2id (`m=19456, t=2, p=1` minimum), min 12 chars, checked against a local breached-password list (top 100k), no forced rotation.
- **No two-step verification (owner decision, 2026-11-25).** Staff sign in with email + password only; TOTP, recovery codes and the per-user "require 2FA" switch were removed (migration `0013`). Accepted risk: a leaked or phished staff password is enough to sign in, so the new-device email alert, lockout and "log out everywhere" are the remaining account-takeover controls. `TOTP_ENC_KEY` keeps its name and now only encrypts queued setup/reset links (AES-256-GCM).
- Login rate limit: 5 attempts / 15 min / account + 20 / 15 min / IP; then exponential lockout. Same generic error for wrong email or password.
- Sessions: random 256-bit id, only HMAC-SHA-256 with `SESSION_SECRET` stored; rotating that secret immediately invalidates cookies. Cookie `__Host-stella_admin` (`Secure; HttpOnly; SameSite=Strict; Path=/`). Idle timeout 8 h, absolute 30 days; re-auth (password) for sensitive actions: changing roles, users, contacts/WhatsApp number, exporting/erasing requests. The file-04 upgrade requires staff to log in again.
- New-device recognition is notification-only, never authentication: a separate random Secure/HttpOnly/Strict cookie expires after 90 days; hashes only, maximum 20 recognized devices per user. Register/send only after complete authentication. Logout everywhere removes sessions and recognized devices. Email copy ships in all seven core locales.
- Password reset: single-use token (hashed, 30 min), sent only to the account email; invalidates all sessions.
- First owner created by a one-time setup link from the seed (no default passwords anywhere).

## 3. Authorization (RBAC)

| Action                                                                                                  | owner | manager | editor                                 | sales |
| ------------------------------------------------------------------------------------------------------- | ----- | ------- | -------------------------------------- | ----- |
| View/handle requests                                                                                    | ✓     | ✓       | –                                      | ✓     |
| Export requests (CSV)                                                                                   | ✓     | ✓       | –                                      | –     |
| Edit trip text & photos                                                                                 | ✓     | ✓       | ✓                                      | –     |
| Change prices                                                                                           | ✓     | ✓       | –                                      | –     |
| Publish / hide trips                                                                                    | ✓     | ✓       | ✓ (draft only → needs manager publish) | –     |
| Collections, homepage                                                                                   | ✓     | ✓       | ✓                                      | –     |
| Hero videos: edit drafts                                                                                | ✓     | ✓       | ✓                                      | –     |
| Hero videos: publish, reorder, switch off                                                               | ✓     | ✓       | –                                      | –     |
| Translations: edit text, auto-translate a field                                                         | ✓     | ✓       | ✓                                      | –     |
| Languages screen (enable languages, budget, glossary)                                                   | ✓     | ✓       | –                                      | –     |
| Settings (contacts, WhatsApp)                                                                           | ✓     | –       | –                                      | –     |
| Users & roles                                                                                           | ✓     | –       | –                                      | –     |
| Audit log                                                                                               | ✓     | ✓       | –                                      | –     |
| Enforced in API middleware (`requireRole`) **and** hidden in the admin UI. Tests cover the full matrix. |

## 4. API & web hardening

- CSRF: admin mutations require header `X-CSRF-Token` (double-submit, tied to the session) **and** an `Origin` check against the admin origin.
- CORS: booking submissions and quote previews (`POST /v1/requests` and `POST /v1/requests/quote`) require the web origin and JSON. The cross-origin booking API uses no credentials. The quote endpoint rejects contact fields, limits previews to 40 per minute per IP and returns no-store responses. Admin routes allow only the admin origin with credentials.
- Validation: zod on every input, max lengths everywhere (name 80, notes 1000, etc.), reject unknown fields.
- Output: never return password hashes, TOTP secrets, IP hashes; separate public DTOs.
- Rich text (FAQ, legal pages): stored as a restricted Markdown subset, rendered with an allow-list sanitizer.
- Rate limiting: in-memory per container + Postgres-backed for login and requests.
- Headers (Caddy):
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `Content-Security-Policy` (web): `default-src 'self'; img-src 'self' https://media.<domain> data:; media-src https://media.<domain>; script-src 'self' 'nonce-…'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://api.<domain> https://stats.<domain>; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me`
  - admin CSP: same idea, `connect-src` API only, `frame-ancestors 'none'`.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(), microphone=()` (camera allowed in admin for photo upload).
- Fonts self-hosted via `next/font` (no request to Google from the visitor's browser — GDPR).
- Dependencies: lockfile committed, `pnpm audit` + Renovate, no packages with postinstall scripts unless reviewed.

## 5. Uploads

Covered in the backend plan §5. Extra: uploads go to a quarantine dir; only processed variants are ever served; the originals dir is not web-accessible; filenames are never user-controlled.

- [x] Public media rights are checked at the origin for each registered rendition. Withdrawing rights or archiving an asset denies delivery immediately after the database change. Existing private previews remain session-protected. Migration 0005 registers the current renditions of active assets with recorded rights. Historical files with no recorded ownership are denied at the origin.
- [ ] On rollout, purge any configured intermediary media cache that previously stored the year-long immutable responses. Copies previously saved by visitors or retained under an older browser cache policy can outlive the origin withdrawal.

## 6. Server (VPS) hardening checklist

- [ ] Ubuntu 24.04 LTS, `unattended-upgrades` on for security updates, automatic reboot window 04:00.
- [ ] SSH: keys only, `PermitRootLogin no`, `PasswordAuthentication no`, non-default port optional, `fail2ban` for sshd.
- [ ] UFW: allow 22 (or custom), 80, 443 only.
- [ ] Docker: containers run as non-root users, `read_only: true` where possible, `no-new-privileges`, resource limits; Docker socket never mounted into apps.
- [ ] Postgres: no published port; strong unique passwords per DB role; app role has no superuser/DDL rights at runtime (separate migration role).
- [x] Scope API and worker grants by table, operation and sensitive column. Migrations remove legacy grants and leave newly created application tables inaccessible to runtime roles by default. The worker uses filtered audit views and fixed routines for privacy cleanup, eligible notifications and translation writes. Only the migration credential manages DDL.
- [ ] Secrets in `/srv/stella/env/*.env` (600), never in images or git; rotated yearly or on staff change.
- [ ] Time sync, log rotation, disk usage alert at 80%.
- [ ] Separate SSH keys per person; remove on offboarding (documented in `docs/OWNERS.md`).

## 7. Privacy (GDPR)

- Data collected: name, phone, optional email, request details. Legal basis: pre-contractual steps at the customer's request.
- Translation provider receives **only published public content** — never names, phones, notes or requests (enforced by the i18n job building payloads from public DTOs only; tested with the fake provider). Provider keys live only in the worker env.
- Privacy policy: factual EN/IT/ES/FR/DE/RU/TR draft authored directly under the owner's standing rule, with AI provenance and no provider call. `pnpm privacy:prepare` creates unpublished blocks only and preserves existing privacy content. Identity/contact, processors/transfers, external retention and legal approval are required before publication; this is not legal certification.
- Retention: requests anonymised after 18 months (job `privacy.purge_requests`).
- IPs stored only as salted hash; analytics cookieless (Umami) → no cookie banner needed if nothing else sets cookies. Google Maps / YouTube embeds only after click-to-load consent.
- Admin can export or delete a customer's data on request (search by phone).
- API export/erase requires owner/manager and recent reauthentication; phone stays in a POST body, never URL/audit metadata. Export includes item/price snapshots without IP/user-agent data. Erasure removes items/history/pending notification payloads and redacts request audit snapshots. Retention uses calendar months and an explicit anonymization marker; anonymized requests cannot regain identifiers through edits/Undo. Mailbox/WhatsApp/backup handling is a separate operator process.
- Booking retry receipts are keyed by an opaque ID and a server-keyed payload fingerprint. Confirmations are available only to matching submissions for 24 hours and are cleared by the maintenance job. Erasure, anonymization and staging scrub remove receipts. The worker has no direct read access to the receipt table.

## 8. Safety nets for content

- Every save on trips, prices, collections, settings creates a `revision`; the admin shows "Undo" for 10 s after saving and a history list per item with restore.
- Prices: a change of more than ±40 % asks for confirmation; all price changes go to the audit log and the weekly owner email.
- Publish workflow: editors save drafts; managers/owner publish.
- "Preview as visitor" link (signed, 1 h) before publishing.

## 9. Incident playbook (short)

1. Suspected admin compromise → owner disables the user, "log out everywhere", rotates `SESSION_SECRET`, reviews audit log, restores revisions.
2. Site down → check Uptime Kuma, `docker compose ps`, roll back to previous tag with `infra/deploy.sh --rollback`.
3. Data loss → restore latest restic snapshot to staging, verify, then to prod.
   Keep `docs/RUNBOOK.md` with the exact commands.

## 10. Security tasks

- [x] Auth module (argon2id, sessions, TOTP, recovery codes, reset); dashboard wiring remains file 05.
- [x] RBAC middleware + matrix tests
- [x] CSRF + Origin checks
- [x] Rate limiter (login, requests)
- [x] Headers/CSP in Caddy + Next middleware nonces; local verification, inline-style finding retained for launch review.
- [x] Upload validation + quarantine
- [x] Audit log + revisions + Undo APIs and actual browser/API mutation checks; UI remains file 05.
- [ ] VPS hardening checklist
- [x] Local encrypted backup/verified restore and actual PostgreSQL restore/scrub; not off-site acceptance.
- [ ] Real off-site backup + restore acceptance
- [x] Calendar-based purge/history scrubbing + verified export/erase API; unpublished policy drafts in seven locales.
- [ ] Approved privacy policy publication with legal identity/contact/processors/transfers/external retention.
- [ ] Pre-launch: run OWASP ZAP baseline scan against staging, fix all medium+ findings

## 11. Accepted risks and follow-ups (audit 2026-11-24)

The full audit, evidence and reproduction scripts are in `audit/2026-11-24/`. Decisions
on its low/informational security items:

- **Staff account lockout (SEC-03).** Anyone who knows a staff e-mail can keep the
  account locked for up to an hour. Kept deliberately: the lockout also slows
  password guessing now that no account uses two-step verification.
- **In-memory public read limits (SEC-04).** Reset on restart and evict the
  oldest callers above 10,000 keys. Accepted for a single VPS; booking, quote and
  login limits are stored in PostgreSQL and unaffected. Add a Caddy rate limit
  if abuse is observed.
- **FFmpeg on uploads (SEC-06).** Only authenticated staff can upload; probing
  runs with a protocol whitelist, timeouts, a scrubbed environment and a
  read-only, capability-free container. Rebuild images when Debian publishes
  FFmpeg security updates.
- **Staging acceptance (SEC-02)** is now enforced by `infra/accept-staging.sh`
  and `infra/deploy.sh`; GitHub environment reviewers remain a recommended
  second control (repository settings, not code).
- **Repository history (BUG-04).** ~585 MB of ignored media remains in Git
  history. Removing it needs an owner-approved history rewrite; untracking alone
  would delete the files from every checkout on the next pull.
- **Calendar touch targets below 390 px.** Day cells are `1fr` of a 7-column grid,
  so on phones narrower than 390 px they are under 44 px wide (still above the
  WCAG 2.2 AA 24 px minimum). Needs a design decision on the sheet's padding.
