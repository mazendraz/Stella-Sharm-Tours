# 00 · Overview

## What we are building

| Part                | Who uses it                                                                                            | URL (prod)                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Public website**  | Tourists in Sharm (EN/IT/ES/FR/DE/RU/TR + auto-translation for every other language), mostly on phones | `https://stellasharmtours.com` (domain TBC)                           |
| **Admin dashboard** | Stella staff, mostly on phones                                                                         | `https://admin.stellasharmtours.com`                                  |
| **API**             | Website + admin                                                                                        | `https://api.stellasharmtours.com` (or `/api` behind the same proxy)  |
| **Database**        | API only                                                                                               | PostgreSQL 16 on the VPS, never public                                |
| **Media storage**   | API writes, Caddy serves                                                                               | `/srv/stella/media` on the VPS → `https://media.stellasharmtours.com` |

The site sells nothing online. A customer picks one trip, a whole collection, or builds a multi-day mix ("My trip"), then sends a **request**. The request is saved, staff are notified, and the customer is offered a prefilled WhatsApp message. Staff confirm availability, pickup time and payment method by WhatsApp.

## Product structure (from the client)

Trips are grouped into **collections**, shown in this order (admin can reorder/rename): 0. **Private with Stella** ⭐ — _client priority_. A virtual collection: every private-only trip, plus the promise that any other trip can be made private on request. Seeded as the first hero slide (the admin controls the hero order), first on the home page and as a Group | Private switch inside every collection (see frontend plan §3.0).

1. **Pharaohs & Temples** — Cairo (bus/plane, 1–2 days), Alexandria, Luxor, Mount Sinai, St Catherine.
2. **The Red Sea** — Ras Mohammed (bus / boat / private), Tiran, Sea Scope, glass-bottom boat, speed boat, water sports.
3. **Desert & Adventure** — quad, buggy, 5-in-1, 7-in-1, Arabian night, Nabq private tours, camping, Red Canyon, Dahab, Wishwash.
4. **Beyond Egypt** — Petra, Jerusalem & Bethlehem.
5. **Sharm Fun & Relax** — dolphin show, dinner cruise, aqua park, horse riding, spa, city tour.
6. **All of Egypt** — packages that combine trips from the other collections + "Build your own".

The real data (38 trips with prices, schedules, inclusions and itineraries + 7 collections + 4 draft packages) is in `data/catalog.json`. Price conflicts are **resolved** (client: pick one, staff will edit in admin). Remaining unknowns have defaults in `docs/DECISIONS.md` — do not block on them.

**Look & feel:** bright, warm, optimistic. Light overlays on photos, colour-graded video (see `assets/ASSETS.md`). The approved design is `reference/mockup/E-Mobile.dc.html` (+ `E-Home.dc.html`).

## Stack (decided)

- **Monorepo**: pnpm workspaces + Turborepo.
- **Web**: Next.js 15 (App Router, React Server Components, TypeScript), Tailwind CSS v4, `motion` (Framer Motion) for animations, `next-intl` for i18n (core EN/IT/ES/FR/DE/RU/TR + auto locales, see `docs/08-i18n-plan.md`).
- **Admin**: Next.js 15 (separate app, separate subdomain), Tailwind, shadcn/ui-style primitives (Radix), installable PWA.
- **API**: Node 22 + **Hono** (REST, JSON), **Drizzle ORM**, **zod** validation, **pino** logging.
- **DB**: PostgreSQL 16 (Docker volume). Migrations by drizzle-kit, committed to git.
- **Auth**: own implementation — argon2id passwords, server-side sessions in Postgres, RBAC. No 2FA (owner decision, 2026-11-25).
- **Jobs**: `pg-boss` (queue in Postgres — no Redis needed) for image/video processing, notifications and machine translation.
- **Translation**: provider adapters — DeepL (default), Google Cloud Translation (fallback, widest language coverage), optional self-hosted LibreTranslate. Called only from the worker, only with public content.
- **Media**: `sharp` (images → AVIF/WebP/JPEG variants), `ffmpeg` (video → H.264 MP4 + poster).
- **Email**: SMTP (client's mailbox or a transactional provider), **Mailpit** in dev.
- **Reverse proxy & TLS**: **Caddy** (automatic HTTPS, security headers, static media).
- **Deploy**: Docker Compose on one VPS (Ubuntu 24.04 LTS, 2 vCPU / 4 GB RAM / 80 GB SSD minimum). GitHub Actions builds images → GHCR → `docker compose pull && up -d` over SSH.
- **Backups**: nightly encrypted `pg_dump` + media rsync with **restic** to an off-site bucket (Backblaze B2 / Hetzner Storage Box).
- **Analytics**: self-hosted **Umami** (cookieless). No Google Analytics.
- **Monitoring**: Uptime Kuma + Sentry (self-hosted GlitchTip optional) for errors.

## Repo layout

```
stella/
  apps/
    web/          Next.js public site
    admin/        Next.js admin PWA
    api/          Hono API
  packages/
    db/           drizzle schema, migrations, seed (reads data/catalog.json)
    shared/       zod schemas, types, price calculator, i18n keys, constants
    ui/           shared design tokens (CSS variables), icons
  infra/
    docker-compose.dev.yml
    docker-compose.prod.yml
    Caddyfile
    backup/       restic scripts + systemd timers
  data/           catalog.json, PRICE-CHECK.md
  assets/         client media to import (videos, images)
  reference/      mockup + client flyers (do not ship flyers)
  docs/
  AGENTS.md
```

## File execution phases — 00-overview

This section tracks completion of this overview's scope and architecture review.
The M0–M7 table below tracks the entire product, not work completed by reviewing
this file. Implementation gates remain unchecked until verified.

### Phase 00.1 — Product scope

- [x] Establish the public website, admin, API, local/VPS PostgreSQL and media boundaries.
- [x] Confirm request-only bookings, no online payments, database-controlled prices,
      mobile-first accessibility and the Private feature.
- [x] Confirm 7 collections, 38 real trips and 4 draft packages from the catalog.
- [x] Include the current language plan: EN/IT/ES/FR/DE/RU/TR core (client decision 2026-11-11; was EN/IT/ES/RU) + every other language auto-translated, worker translations,
      human overrides, RTL support and no customer data sent to providers.
- [x] Confirm home hero slides come from admin-controlled `hero_slides`, with
      Private first in the seed; collection order does not control hero order.

### Phase 00.2 — Sources and architecture

- [x] Assign layout, CSS and interaction reference to `reference/mockup/`;
      React implementation must replace the canvas runtime and `/_blob/` URLs.
- [x] Assign catalog facts and initial prices to `data/catalog.json`, imported
      through the DB; components do not embed catalog prices or sample prices.
- [x] Keep flyers as source evidence only. Keep public media in the media pipeline,
      original files private, rights checked and existing grading applied once.
- [x] Verify that every non-null catalog media path exists in `assets/`.
- [x] Record missing provenance, internal catalog notes, tool prerequisites and
      cross-file dependencies in `QUESTIONS.md`.

### Phase 00.3 — File order and handoff

- [x] Record the user's chosen order: `00` → `01` → `02` → `03` → `04` → `05`
      → `06` → `07` → `08`; consult `DECISIONS.md` throughout.
- [x] Divide each execution file into phases when work on that file begins.
- [x] Stop after each file and wait for the user's instruction before the next.
- [x] Keep work needing a later file explicit: frontend data integration depends
      on backend reads, real request submission on the request API, and automatic
      translations on DB/worker/provider configuration. Never fake passing gates.
- [x] Separate overview review from scaffold completion: partial tooling files
      already written are unverified WIP, tracked in `07-scaffold-phases.md`.

**Overview review status:** complete. **Product implementation status:** partial
scaffold only; no application build, runtime, database or Lighthouse gate passed.
The next file is `01-frontend-plan.md`, after the user authorizes that handoff.

## Phases & milestones

| #   | Milestone                      | Output                                                                                           | Rough size |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------ | ---------- |
| M0  | Scaffold                       | monorepo, lint/format/typecheck, CI, dev compose, empty apps boot                                | 1–2 days   |
| M1  | DB + seed + read API           | schema, migrations, seed from catalog, public read endpoints                                     | 3–4 days   |
| M2  | Public site — mobile           | home, collection, trip, my-trip, request sheet, contact; EN/IT/ES/FR/DE/RU/TR + auto languages   | 6–8 days   |
| M3  | Public site — desktop & polish | desktop layouts, animations, SEO, performance                                                    | 3–4 days   |
| M4  | Requests                       | request endpoint, anti-spam, email notify, WhatsApp handoff                                      | 2 days     |
| M5  | Admin — core                   | auth, requests inbox, trips & prices, collections                                                | 6–8 days   |
| M6  | Admin — content & media        | uploads, homepage editor + **hero videos order**, languages screen, settings, users, audit, undo | 4–5 days   |
| M7  | Production                     | VPS hardening, compose prod, backups, monitoring, go-live checklist                              | 2–3 days   |

## Open items the client must answer (none of them block the build — defaults in `docs/DECISIONS.md`)

- Domain name and who owns it (build with `example.com` env placeholders).
- Which WhatsApp number receives requests (default: +20 106 901 2881, editable in settings).
- ~~Price conflicts~~ — resolved.
- Child pricing rules (age bands, % off) — currently unknown, so the site shows adult price only and says "children: ask us".
- Real photos of: Stella office, cabins at Nabq, Sea Scope, buggies, parasailing, aqua park, Alexandria. Logo as SVG.
- Permission to use the third-party videos (see `assets/ASSETS.md`).
- Legal entity ("Stella Sharm Tours by Heroes Travel"?) for the footer, terms and privacy policy.
