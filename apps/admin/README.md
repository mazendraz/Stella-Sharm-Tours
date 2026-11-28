# Stella staff dashboard

Mobile-first Next.js dashboard: requests, trips/prices, collections/packages,
media/hero videos, homepage/pages/FAQ, languages/review queue, owner settings,
users, audit/history and account security. UI and content tabs cover
EN/IT/ES/FR/DE/RU/TR. Core translations require no external provider.

Run the generated local API/worker and `pnpm dev` (admin `http://localhost:3001`).
Use `localhost` consistently for cookie/origin checks. No default password exists.
Restart generated development services with
`docker compose --env-file .env -p stella-kit-dev -f infra/docker-compose.dev.yml up -d`
from the repository root; keep the project name so the existing DB volume is reused.
For the unfinished seeded development owner, `pnpm admin:setup-link` writes a
private, single-use 30-minute link to `.local/admin/owner-setup.txt`. Open that file
locally; do not paste its token into chat, Git or logs. The helper refuses to
replace an established password. Existing users use **Forgot password** and the
local Mailpit inbox; invites/reset links never go to a real provider in local QA.
Staff sign in with email and password only (owner decision, 2026-11-25).

`pnpm admin:messages` validates/generates all seven dictionaries and offline copy.
`node scripts/admin-icons.mjs` renders PNG install icons from the existing SVG.
`pnpm test:e2e:admin` requires the guarded local development database. For isolated
Docker QA set `STELLA_INTEGRATION_VERIFY=1` first; see
[verification](../../docs/admin-verification.md). Tests create temporary accounts;
traces/screenshots remain ignored under local QA output directories.

Production requires `API_INTERNAL_URL`, runtime `PUBLIC_API_URL` and `SITE_URL`
in `env/admin.env`; the image never freezes staging browser URLs. `/healthz`
reports process health; `/readyz` fails closed on missing/invalid public URLs or
an unavailable API/DB. Containers bind to `0.0.0.0` only inside the Docker network.

Only static shell assets are cached offline. Customer/API data and authenticated
HTML are never persisted. Offline writes are blocked, with no background replay.
Optional VAPID push needs real HTTPS/device acceptance; see the runbook. Keep
external staff usability, SMTP/push and launch security gates open until verified.
