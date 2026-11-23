# VPS setup — Ubuntu 24.04 LTS

These instructions prepare a new, explicitly selected VPS. Nothing here has been
run on the developer's Windows computer. Remote acceptance remains a launch gate.

1. Create `deploy` with a unique SSH key and sudo access. Test a second SSH login
   before changing SSH/firewall settings. Never reuse a shared/root key. Deploy
   must have UID 1000 for the application and Caddy bind mounts; otherwise build
   images with the matching UID and adjust compose users deliberately.
2. Install Docker Engine/Compose from the official Ubuntu repository instructions:
   <https://docs.docker.com/engine/install/ubuntu/>. Use Compose >=2.30 (raw env
   files). Membership in the Docker group is equivalent to root: grant only to
   the named deploy operator. No app mounts its socket.
3. Run `sudo bash infra/server-hardening.sh` **from a tested deploy SSH session**.
   The script refuses a missing key or unexpected user/UID. Review it first.
4. Clone the private repo into `/srv/stella/repo`, owned by deploy. Node 22 is
   needed only for the one-time config helper (alternatively run it in the API
   image). `node infra/configure.mjs production REAL_DOMAIN ghcr.io/ORG` and the
   same for staging create **different secrets, DBs, volumes and directories**.
   Existing configs are never overwritten. Files are 600, private dirs 700.
5. Download the hash-verified blocklist with `pnpm security:setup`, copy it into
   both environments' `security/` directories (readable by UID 1000). Verify file
   modes/ownership. Set real owner/staff email, SMTP/TLS credentials, and Caddy's
   ACME contact. Worker translation keys remain absent for the seven core locales.
6. Resolve Node/Postgres/Caddy image tags to reviewed `@sha256` pins and record
   them in compose config/Docker build args. Registry SHA release tags are never
   reused. Set registry pull access with `docker login ghcr.io`; keep credentials
   owner-only. Application secrets are runtime env files, never build arguments.
7. Create `stella_gateway` once: `docker network create --subnet 172.30.19.0/24
stella_gateway`. Production gateway is .2, staging gateway .3. Production and
   staging app subnets are 172.30.20.0/24 and 172.30.21.0/24. Check these do not
   overlap existing networks. Only Caddy publishes 80/443. DB/app ports stay private.
   **Client addresses over IPv6.** Rate limits and lockouts depend on Caddy seeing
   each visitor's real address. Docker's userland proxy can present every IPv6
   visitor as one gateway IPv4 address, so all IPv6 visitors would share one
   limit. Either publish no AAAA record, or enable IPv6 in Docker with
   `"userland-proxy": false` in `/etc/docker/daemon.json`. Then check that a
   request over IPv6 shows the visitor's real address in the Caddy access log
   before launch (audit SEC-03). The API groups IPv6 visitors by /64.
8. Configure `production/env/backup.env` from the example, create the restic
   password file with mode 600, and run `restic init` explicitly once using the
   configured repository. Store a separate recovery copy of the restic password,
   `TOTP_ENC_KEY` and `SESSION_SECRET` in the owner's password vault. Never send
   these in chat or put them in Git. Test repository access before enabling timers.
9. Copy timer/service units from `infra/backup/` and `infra/monitoring/` into
   `/etc/systemd/system/`; run `systemctl daemon-reload`, then enable
   `stella-backup@production.timer` and `stella-monitor@production.timer`.
   Backup schedule explicitly uses **Africa/Cairo**, independent of server TZ.
   The supplied alert unit writes a critical journal event. To deliver it to an
   operator, install a root-owned HTTPS webhook URL at
   `/etc/stella/alerts/webhook-url` with mode `0600` (keep the directory `0711`
   so the deploy user's health check can confirm the file exists). The endpoint
   receives a JSON event name and the failed unit name. Production health checks
   and deploys **fail** while this webhook or the off-site backup is missing.
   Verify receipt with the named operator from staging before launch.
10. Add an **off-host** uptime monitor (any external HTTP checker) for
    `https://WEB_HOST/healthz`, `https://API_HOST/healthz` and TLS expiry. The
    on-host timers cannot report a host, network or power outage.

## Staging on the same VPS

Use `infra/docker-compose.prod.yml` plus `infra/docker-compose.staging.yml`,
project `stella-staging`, DB `stella_staging`, and its own credentials/data root.
Generate the basic-auth hash with `caddy hash-password` (interactive stdin);
write it literally into `staging/env/staging-gate.env` (600). Raw env format
preserves `$` characters. There is no usable default staging password.

The staging gateway has **no published ports**. Add reviewed staging hostnames
from `infra/caddy/staging-edge.caddy.example` to the production gateway config
and reload Caddy. Both gateways share only `stella_gateway`; the staging gateway
trusts forwarded client IPs only from production gateway .2. It authenticates
requests before routing and sends `noindex` headers. The staging browser uses
same-origin `/v1/requests`, `/v1/requests/quote` and `/media/` so basic-auth credentials work without
cross-origin prompts. The implemented admin uses its own origin `/v1/admin/*`.

Staging worker SMTP is forcibly directed to its isolated Mailpit, with no real
SMTP credentials or translation keys. Never mount production originals into
staging. Do not run API/worker/gateway during a restore or before scrubbing.

## First deploy and seed

`bash infra/deploy-release.sh staging COMMIT_SHA` selects a read-only archive of
the commit under `/srv/stella/release-checkouts`, then pulls the exact images, backs up,
migrates once, starts apps, checks dependencies and records a release only after
health succeeds. Production deliberately refuses the current admin scaffold:
file 05 must supply the dashboard before go-live.

Import the real catalog/media only as an explicit first-run operation after
migrations. Use the `migrate` service image with a read-only bind of approved
`assets/` to `/app/assets`, run `scripts/seed.ts`, and set `SEED_SETUP_FILE` to a
private writable bind path. That link expires in 30 minutes. Never seed via the
runtime API role, dump the link into CI logs, or invent absent legal/media data.
Seeding is not part of routine deployments and must not overwrite staff edits.

## Launch acceptance

- Complete file 05, real legal/rights approvals, strict LCP/manual-device checks.
- CI/remote reviews, branch protections, protected production GitHub environment,
  pinned SSH host key and per-person access verified by the actual repo owner.
- Real DNS/TLS/HTTP redirects, security headers and nonce CSP on all hosts.
  Configure a canonical `www` redirect and real old-site redirects only once
  those hostnames/paths are supplied; do not guess them.
- SMTP deliverability, backup off-site success, restore drill, monitor/alert
  delivery, default analytics/monitoring credentials changed, disk >20% free.
- Staging OWASP ZAP baseline; fix medium+ findings before production.
- Field/production Lighthouse, robots, 404, sitemap, all seven languages and
  actual request-to-staff confirmation; submit sitemap with the owner's account.
