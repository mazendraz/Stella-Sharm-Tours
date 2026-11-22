# 06 · Build order — run it all in one go

This is the single checklist Codex follows from an empty repo to a deployable product. Work top to bottom. After each milestone: run the **gate**, commit with the milestone id (`feat(M2.4): …`), tick the box here, continue. Do not wait for approval between milestones unless a gate fails twice.

**Session override:** the user chose numeric file order with a stop after each
file. Verified local artifacts are checked below; real staff/device and remote
production acceptance stay open. See each file's verification document.

File 03 update: scaffold/infrastructure artifacts and local gates are now in
`docs/integration-verification.md`. File 05 replaces the admin probe scaffold with
the dashboard; see `docs/admin-verification.md`. CI and
production scripts are prepared; remote CI, VPS application and go-live gates
are not claimed as run. File 04 local work is verified separately. The current
session is now authorized for file 06; stop before file 07. This checklist
distinguishes local evidence from external launch acceptance.

## File 06 execution phases — 2026-11-13

- [x] B1 — Reconcile M0–M7 against the implementation and prior verification;
      identify stale checklist entries and separate local from external gates.
- [x] B2 — Measure the current Linux production build and address the outstanding
      public rendering budget where the local evidence supports a change.
- [x] B3 — Run affected local gates and prepare current public screenshot evidence;
      preserve all seven core languages and production security boundaries.
- [x] B4 — Complete the reproducible local/deployment/content/backup handoff,
      record results and outstanding owner/operator acceptance, then stop before 07.

External launch gates require actual staff/devices, approved content/media,
remote CI and the client's VPS/domain/provider configuration. A local pass does
not satisfy those gates. Results for this file go in `build-order-verification.md`.

Rules while running:

- Unknowns → `docs/DECISIONS.md` defaults. New questions → append to `QUESTIONS.md`, keep going.
- Design questions → copy what `reference/mockup/E-Mobile.dc.html` does (CSS values, copy, behaviour).
- Never hard-code prices or trip text in components — everything comes from the API/DB.
- Keep every gate green before moving on; if a gate cannot pass, write why in `QUESTIONS.md` and move to the next independent milestone.

---

## M0 · Scaffold

- [x] pnpm workspace + Turborepo: `apps/web`, `apps/admin`, `apps/api`, `packages/db`, `packages/shared`, `packages/ui` (admin UI implemented in file 05).
- [x] TypeScript strict, ESLint, Prettier, husky + lint-staged source config, `.editorconfig`, `.nvmrc` (Node 22).
- [x] `infra/docker-compose.dev.yml` (postgres:16, mailpit) + `.env.example` for every app + zod env validation (admin dependency probe fails closed).
- [x] GitHub Actions CI prepared/validated (typecheck, lint, test, build, audit, gitleaks); remote execution pending.
- [x] `/healthz` and `/readyz` on each app.
      **Gate:** `pnpm i && pnpm typecheck && pnpm lint && pnpm build` passes; `docker compose up` brings Postgres up; all 3 apps start.

File 07 reverified the M0/tooling gate and current app/DB/Mailpit health. CI adds
format enforcement and isolated source/full-history scans; actual remote Actions
and real committed-history acceptance remain open. See `scaffold-verification.md`.

## M1 · Database, seed, public API

- [x] Drizzle schema exactly as `02-backend-database-plan.md` §2 (incl. `collections.kind`, `collections.perks`, `trips.private_on_request`, **`hero_slides`**) + `content_translations` (`08-i18n-plan.md` §3), first migration.
- [x] i18n core: locale settings, resolver (+ unit tests for the fallback order), translation provider adapters incl. `fake`, glossary, placeholder guard, worker jobs `translate_entity` / `backfill_locale` / `refresh_stale` (`08-i18n-plan.md` §4–5). Real providers remain operator acceptance.
- [x] `packages/shared`: zod schemas, DTO types, `price.ts` (+ unit tests: per person, per quad/car/boat/hour, null price, children, packages, private on request).
- [x] Seed from `data/catalog.json`: 7 collections, **hero slides (mobile and desktop video pairs, Private first)**, 38 trips, prices, itinerary, items, 4 draft packages, settings (DECISIONS defaults), media import from `assets/` through the pipeline (rights status per `assets/ASSETS.md`).
- [x] Public endpoints (§1.1) incl. the virtual `private` collection, hero slides in `/site`, `/messages` for auto locales, locale resolution on every endpoint; caching + ETag.
      **Gate:** `pnpm db:migrate && pnpm db:seed` on an empty DB; `GET /v1/public/collections` returns 7 collections; `GET /v1/public/trips/quad-bike-safari` returns two price rows (€15 person, €20 quad); `GET /v1/public/site` returns hero slides with Private first; `?locale=tr` returns TR (or machine/EN fallback flagged) and `?locale=pl` returns the machine translation (or machine/EN fallback flagged); fake-provider test proves no PII is sent; integration tests pass.

## M2 · Public site — mobile first (390×844)

- [x] M2.1 Tokens (`01-frontend-plan` §1), fonts via `next/font` (Cyrillic + per-script fallbacks), layout with CSS logical properties (RTL-ready), TabBar, LangSwitch (core EN/IT/ES/FR/DE/RU/TR + "More languages"), AutoTranslatedNotice, Footer. `messages/{en,it,es,fr,de,ru,tr}.json` + key-parity CI check.
- [x] M2.2 StoryHero from `hero_slides` (**admin order**, per-slide duration, mobile/desktop filter, schedule, Private first in seed); poster-first video, bars, tap/swipe (mirrored in RTL), pause rules.
- [x] M2.3 Home: content sheet over hero + scroll-linked hero scale/radius/brightness; **Private with Stella** section; StackCards; Easy first days; Build your own; How it works; contact card.
- [x] M2.4 Collection page + intercepting-route overlay with clip-path open; **Group trips | Private** switch; chips; combo card; virtual Private collection; All of Egypt packages.
- [x] M2.5 Trip page/overlay: gallery, facts (Duration, Runs, Pickup, Format "Group · private on request"), price rows, timeline, includes/excludes/optional/bring, notes, sticky bar.
- [x] M2.6 My trip: Zustand + localStorage, day ordering (sea → desert → relax → history/beyond), beach day after flight/overnight trips, mix bar, totals with "+ on request".
- [x] M2.7 Request sheet: date chips, guests, Group|Private (preselect rules), pickup chips, name, WhatsApp number, validation, success screen with ref + prefilled WhatsApp link.
- [x] M2.8 Contact, FAQ, legal pages (from DB).
      **Gate:** Playwright mobile (iPhone 13 profile) e2e: open home → open Sea → switch to Private → open Tiran → Request (Private preselected) → submit → see ref + WhatsApp link. Lighthouse mobile ≥ 90 perf / 100 a11y on home and a trip page. Visual check of home + trip at 390px in `en`, `it`, `es`, `fr`, `de`, `ru` and `tr` (no clipped buttons, Cyrillic headings render, RTL correct). Visual side-by-side check against the live Concept E canvas / `reference/mockup/` (layout, spacing, colours, motion).

> **Language change (client, 2026-11-11):** core is now **7 languages: EN, IT, ES, FR, DE, RU, TR** (all written by people); **every other language** is machine-translated. Code built with EN/IT/ES/RU: keep `ru`, add `messages/fr.json`, `de.json`, `tr.json` with human copy, update locale constants, middleware, LangSwitch, key-parity check and tests.

## M3 · Desktop & polish

- [x] Desktop layouts from `E-Home.dc.html`: nav, hero with story list, Private block (2 columns), accordion collections, 3-column collection grid with Group|Private switch, trip drawer, centered booking modal, My trip drawer.
- [x] Motion polish per §5 + reduced-motion audit.
- [x] SEO: metadata, JSON-LD (TravelAgency, TouristTrip + Offer, `inLanguage`), sitemap and hreflang for every live locale, robots, `noindex` switch for auto locales.
      **Gate:** Playwright desktop (1440×900) e2e of the same flow; Lighthouse desktop ≥ 95; no CLS on hero.

File 06 local evidence: the real home → Sea → Private → Tiran request flow
passes in all seven core languages at 390/768/1440; DB snapshots and isolated
Mailpit delivery are verified. Repeated Lighthouse medians: mobile home 92/100,
trip 93/100, desktop home 98/100; CLS 0. These implementation/score checkmarks
do not close the stricter mobile LCP <2.5 s budget (still 3.1–3.2 s), field INP,
native-language approval or physical-device/manual accessibility acceptance.
See `docs/build-order-verification.md` and `docs/screens/README.md`.

## M4 · Requests backend

- [x] `POST /v1/requests` (§4): honeypot, min-time, rate limits, server-side price recompute, snapshots, ref generator.
- [x] pg-boss worker: staff email (Mailpit in dev), `revalidate.web`.
      **Gate:** integration tests for spam rejection, rate limit, price recompute mismatch, email delivered to Mailpit.

## M5 · Admin core (mobile first)

- [x] Auth API and actual seven-language UI: login, TOTP setup/verify, recovery, reset/setup, sessions, recent reauth; RBAC/CSRF/Origin tests.
- [x] Shell: bottom tabs (Requests, Trips, Prices, Media, More), PWA manifest, offline banner.
- [x] Requests inbox + detail + one-tap statuses + "Reply on WhatsApp" template + optional Web Push implementation (real-device acceptance pending).
- [x] Trips editor sections (Basics incl. format & private surcharge, Schedule, Prices, Day plan, Items, Media, SEO) + preview link.
- [x] Prices screen + bulk change preview/apply + history/undo.
- [x] Collections (incl. Private block perks) + Packages.
      **Gate:** e2e on a 390px viewport: owner logs in with TOTP → changes Tiran price to €40 → site shows €40 within 60 s → Undo restores €35. Editor role gets 403 on price change via API.

## M6 · Admin content, media, settings

- [x] Media library: upload from phone, auto-enhance grade, AVIF/WebP variants, video trim + poster + vertical/horizontal outputs, rights status gate.
- [x] **Hero videos** screen (`05-admin` §3.6): ordered list, drag + ↑/↓ + "Move to first", add from Media or upload + trim, texts in language tabs, button target, duration, device, schedule, switch off, preview, undo.
- [x] Homepage blocks editor (Private block, Easy first days, How it works), FAQ & legal pages.
- [x] Seven-language tabs/status/review; **Languages** and **Translation queue**. Core text is authored directly per owner; automatic core translation button intentionally superseded.
- [x] Settings (owner, re-auth), Users & roles, Activity log, My account.
- [ ] Actual two-staff phone usability, native installation/push and remaining launch gates in file 05.
      **Gate:** owner moves the 3rd hero video to position 1 on a 390px viewport → site shows it first within 60 s → Undo restores the old order; a video with `unknown` rights cannot be published as a hero slide; owner enables Polish (not in the launch set) → after backfill `/pl` is in the switcher and sitemap; upload a phone JPEG with GPS EXIF → served variants have no EXIF; an `unknown`-rights clip cannot be set as a published trip's video; audit log shows every change.

## M7 · Production

- [x] `infra/docker-compose.prod.yml`, Caddyfile (TLS, headers, CSP, media), deploy script with migrate + health checks + rollback; isolated local container acceptance, real VPS gate pending.
- [x] VPS hardening checklist (`04-security-plan` §6) as a script/README (`infra/server-setup.md`); not applied to a remote server.
- [x] Backup/restore/monitoring/optional Umami-Kuma artifacts and local drills; actual off-site/tools/alerts acceptance remains pending.
- [x] `docs/RUNBOOK.md`, `docs/OWNERS.md`, `CHANGELOG.md`.
- [ ] OWASP ZAP baseline against staging; fix medium+.
      Local file-04 passive baseline completed with warnings (no High; Medium inline-style directive explicitly present in the plan). Actual staging acceptance and policy/risk review remain open; see `security-verification.md`.
      **Gate:** fresh VPS → `infra/server-setup.md` + `infra/deploy.sh` → site, admin and API live over HTTPS with A rating on securityheaders.com; a restore drill to staging succeeds.

---

## Final hand-off

- [x] `README.md`: five-command fresh local setup, deployment, adding a trip in
      all seven locales, backups and recovery; existing configs/data preserved.
- [x] `QUESTIONS.md`: current owner/operator acceptance separated from history.
- [x] Current real-API screenshots in `docs/screens/current/`: 259 images,
      all 38 trips/7 collections/public pages at mobile and desktop, representative
      tablet/locale states, confirmations and guarded synthetic admin screens.
