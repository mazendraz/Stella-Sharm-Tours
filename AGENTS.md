# AGENTS.md — Stella Sharm Tours

You (Codex or any coding agent) are building the production website, API and admin dashboard for **Stella Sharm Tours**, a day-trip / excursion company in Sharm El Sheikh, Egypt. Read this file first, then the docs in order.

## Read in this order

1. `docs/00-overview.md` — what we are building, the stack, the repo layout, the phases.
2. `docs/01-frontend-plan.md` — public website (mobile first), design system, animations, pages.
3. `docs/02-backend-database-plan.md` — API, PostgreSQL schema, media pipeline.
4. `docs/03-integration-plan.md` — how web, admin, API, DB and media talk; environments; CI/CD; deployment on the VPS.
5. `docs/04-security-plan.md` — non-negotiable security rules.
6. `docs/05-admin-dashboard-plan.md` — the mobile-first admin.
7. `docs/08-i18n-plan.md` — languages: EN/IT/ES/FR/DE/RU/TR written by people + every other language machine-translated from EN (free tiers).
8. `data/catalog.json` — the real trips, prices and collections (the seed data).
9. `reference/mockup/` — the approved design (Concept E). `E-Mobile.dc.html` is the primary design; `E-Home.dc.html` is desktop.
10. `docs/DECISIONS.md` — defaults for every open question. **Never block on a question; use these.**
11. `docs/06-build-order.md` — the one-run checklist (M0 → M7) with a gate per milestone. This is your task list.

To start: follow `CODEX_PROMPT.md`.

## Hard rules

- **No Supabase, no Firebase, no hosted BaaS.** PostgreSQL runs locally (Docker) in dev and on the client's VPS in production.
- **No online payments.** Bookings are _requests_: stored in our DB, staff notified, customer gets a prefilled WhatsApp message. Never add a payment form.
- **Mobile first.** Every screen is designed and tested at 390×844 first, then scaled up. Most customers arrive on phones.
- **Private tours are a headline feature** (client priority): first hero slide in the seed, a Private section at the top of home, a Private collection, and a Group | Private switch in every collection. Spec: `docs/01-frontend-plan.md` §3.0.
- **Look: bright, warm, optimistic** — light overlays, colour-graded media.
- **Prices come from the database only.** Never hard-code a price in a component. The admin must be able to change any price without a deploy.
- **Never invent content.** No fake reviews, ratings, customer counts, staff photos or "years of experience". If a value is missing, render nothing or "On request".
- **Every language** from day one (spec: `docs/08-i18n-plan.md`). **Core = EN, IT, ES, FR, DE, RU, TR** (client decision, 2026-11-11), written by people: UI strings in `messages/{en,it,es,fr,de,ru,tr}.json`, content fields in the DB are `{ en, it, es, fr, de, ru, tr }`. **Every other language is machine-translated from EN** (DeepL/Google free tiers) by the worker and stored in `content_translations` (switch languages on/off in the admin, no deploy). Never send customer data to the translation provider. Use CSS logical properties so RTL (Arabic) works.
- **Hero videos are admin-controlled.** The home hero slides (which videos, in which order, their text and link) come from the `hero_slides` table and are reordered in the admin (**Homepage → Hero videos**). Never hard-code slides or tie them to the collection order.
- **Seven-language changes are mandatory (owner, 2026-11-12).** Every new or changed user-facing text/content must be updated together in **EN/IT/ES/FR/DE/RU/TR**, without waiting for a separate translation request. This includes pages, trips, collections, UI, forms, errors, confirmations, SEO and media alt text. When wording or meaning changes, review and update all six corresponding translations; a stale flag or EN fallback is not completion. Author core translations directly in the repo/DB; do not add a translation service, subscription or local MT engine unless the owner explicitly requests it. Preserve unrelated human edits, factual details, names, times and numeric values. Apply shared code, layout and DB price changes once, then verify their behavior and presentation in all seven locales; never duplicate prices per language.
- **Accessibility**: WCAG 2.2 AA. Real buttons/links, labels on inputs, 44px touch targets, visible focus, `prefers-reduced-motion` respected.
- Follow `docs/04-security-plan.md` for every endpoint, upload and form. If a task conflicts with it, stop and ask.
- Small, reviewable PRs. One milestone task per PR. Update `CHANGELOG.md` and tick the task in the relevant plan.
- Write tests for: price calculation, booking request validation, auth, RBAC, upload validation.

## Commands (once scaffolded)

```
pnpm i
docker compose --env-file .env -p stella-kit-dev -f infra/docker-compose.dev.yml up -d   # existing dev postgres + mailpit
pnpm db:migrate && pnpm db:seed                         # loads data/catalog.json
pnpm dev                                                # web :3000, admin :3001, api :4000
pnpm test && pnpm lint && pnpm typecheck
```

## Definition of done (every task)

- All affected content/UI and behavior are updated and checked in EN/IT/ES/FR/DE/RU/TR; no newly missing or stale core translations. Update dictionaries/bundled content, source hash and DB seed where affected.
- Typecheck, lint and tests pass.
- Works at 390px, 768px and 1440px.
- Keyboard and screen-reader usable.
- No console errors; Lighthouse mobile ≥ 90 performance / 100 accessibility on public pages.
- No secrets in the repo.
