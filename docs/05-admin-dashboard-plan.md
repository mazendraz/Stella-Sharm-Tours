# 05 · Admin dashboard plan (`apps/admin`)

## File execution phases — 2026-11-12

Owner-authorized numeric file order: complete local file 05, then stop before 06.
The standing seven-language rule supersedes the older EN-only/EN+AR UI notes:
all dashboard strings ship in EN/IT/ES/FR/DE/RU/TR; RTL remains supported.
Core content is authored directly, with no automatic provider call required.

- [x] A1 — Auth, MFA/setup/reset, safe session state, nonce CSP and seven-language shell/PWA/offline behavior.
- [x] A2 — Requests, WhatsApp, assignments, privacy actions, notifications and undo.
- [x] A3 — Trips/sections, translated content, prices/bulk/history, collections and packages.
- [x] A4 — Media/upload/trim/rights/focal points and hero order/schedule/preview/undo.
- [x] A5 — Homepage/FAQ/pages, languages/queue, settings, users, audit and account.
- [x] A6 — Local acceptance/handoff verified 2026-11-13: 105 unit, 52 PostgreSQL, 14 dashboard and 37 public browser checks; three widths/seven locales, repeat publication/Undo, source/dependency/build/config checks. Deliberate duplicate-width skips and external gates are documented in `admin-verification.md`.
- [ ] External acceptance — usability with two real staff, live push/SMTP/VPS/TLS and launch security gates. Never claim these from synthetic checks.

Users: Stella's owner and 2–5 staff. They will use it **on their phones**, often between WhatsApp chats, sometimes in bad signal. Design for one-thumb use and very little typing. All seven core UI languages ship together; optional Arabic/RTL remains a future addition. Local evidence and external gates: [admin verification](admin-verification.md).

## 1. Principles

- **3 taps to change a price.** Prices → trip → edit amount → Save.
- **Requests first.** The home tab is the inbox; a new request is one tap away from replying on WhatsApp.
- **Content changes are reversible.** Exact-revision Undo for 10 seconds, including inside open sheets; item history and Activity → History for later restore; archive/draft hiding only. Security revocation and privacy erasure must never resurrect credentials or personal data; see the runbook.
- **Same look as the site** (Manrope, limestone background, ink buttons) but denser. Big touch targets (≥ 48px), bottom tab bar, bottom sheets for edits.
- **Works offline-ish**: installable PWA, caches the shell; shows a clear "You're offline — changes not saved" banner instead of failing silently.

## 2. Navigation

Bottom tab bar (mobile) / left sidebar (desktop):

1. **Requests** (badge = new)
2. **Trips**
3. **Prices**
4. **Media**
5. **More** → **Hero videos**, Collections, Packages, Homepage, FAQ & pages, **Languages**, **Translation queue**, Settings, Users, Activity log, My account

## 3. Screens

### 3.1 Requests

- Segmented filter: New · Contacted · Confirmed · All. Search by name/phone/ref.
- Card: ref, name, trip(s), date, guests, pickup area, estimate, time since.
- Detail: all fields + price snapshot + internal note + assignee.
- Actions (big buttons): **Reply on WhatsApp** (opens `wa.me` with a template: greeting, trip, date, pickup time placeholder), **Call**, **Mark contacted**, **Confirm**, **Cancel**, **Spam**.
- Status change is one tap with undo. Push notification (Web Push) + email on new request.

### 3.2 Trips

- List grouped by collection, drag-to-reorder (long-press on mobile), status pill (Published / Draft / Hidden), quick toggle visibility.
- Trip editor as **sections** (accordion), each saved independently:
  1. Basics — title, summary (language tabs), collection, **format (Group / Private only / Group + private on request)**, private surcharge % (empty = "on request"), family-friendly, featured order, "show in Private section" toggle.
  2. Schedule — run days (weekday chips), departure/return labels, duration, overnight/flight switches.
  3. Prices — rows (label, amount, unit, primary), add/remove row, "On request" switch.
  4. Day plan — itinerary rows (time + text), reorder by drag.
  5. Included / Not included / Optional / Bring — chip lists, tap to add.
  6. Photos & video — pick from Media or upload from camera; set cover; reorder gallery; set focal point by tapping the photo.
  7. SEO — optional overrides, plus **Search keywords** (2026-11-26): words visitors might type to find the trip on the site search, one list per core language (follows the language bar) and "Other languages & spellings" for Arabic, transliterations and typos. Never shown on the site; saved with the SEO section.
- **Language tabs EN · IT · ES · FR · DE · RU · TR** (horizontally scrollable). Desktop shows EN beside the selected translation; mobile shows one language at a time. Changed meaning requires all seven plus review acknowledgement; EN source and current-language inputs have explicit provenance/freshness labels. No core auto-translate/provider button is added under the standing owner rule. Extra languages retain the optional worker workflow in `docs/08-i18n-plan.md` §11.
- "Preview" opens the real site page via a signed preview link.
- Duplicate trip (for seasonal variants).

### 3.3 Prices (the most used screen)

- One list of every trip with its primary price, grouped by collection, searchable; a second column shows the private price (or "on request").
- Tap a row → bottom sheet with all price rows of that trip, numeric keypad input, ± €5 steppers.
- **Bulk change**: select a collection (or all) → "+/- X %" or "+/- €X" → preview table of old → new → confirm. Rounds to whole euros.
- Every change shows "Changed from €35 to €40 · Undo".
- History tab per trip: list of price revisions with who/when and Restore.

### 3.4 Media

- Grid of photos/videos with filters (collection, unused, rights status).
- Upload: multiple files from camera/gallery; progress bars; processing state; client-side resize to max 2560px before upload to save mobile data.
- Each item: alt text (language tabs), credit, license, rights status (Owned / Licensed / Permission / Unknown — "Unknown" items cannot be published on a trip; warning shown).
- Video: trim start/end (simple range slider), choose poster frame, auto-generates vertical + horizontal versions.
- "Where used" list before delete.

### 3.5 Collections & Packages

- Collections: name/headline/sub (language tabs), colour picker (preset swatches), cover, collection-page hero video, order, publish, and a **Search keywords** section (same editor as trips). (The home page hero is managed separately in **Hero videos**, §3.6.)
- Packages: pick trips (search + add), order them by day, set package price or leave as "sum of trips", publish. Shows the sum next to the package price so staff see the discount.

### 3.6 Homepage

#### Hero videos (the first thing visitors see) — also a shortcut under More

- [x] Apply the same headline, media, target and schedule checks to publishing and edits to a live slide. An incomplete legacy slide is omitted from the public homepage while catalog reads and requests continue.

The owner decides which videos play at the top of the home page and in which order (1st, 2nd, 3rd, 4th…).

- **List in display order**: big position number (1, 2, 3…), poster thumbnail (tap = play preview), headline, where the button goes, status (Live / Draft / Off / Scheduled), device badge (All / Mobile / Desktop), duration.
- **Reorder**: drag handle (long-press on mobile, `dnd-kit`) **and** ↑ / ↓ buttons and "Move to first" in the row menu (one tap, accessible, works without dragging). The new order is saved immediately with a toast "Moved _Red Sea_ to position 1 · Undo".
- **Add slide**: pick a video from Media (only `ready` videos with rights ≠ Unknown are selectable) or upload from the phone → pipeline (grade, vertical + horizontal, poster) → trim to ≤ 20 s and choose the poster frame. Then: link to a collection (pre-fills colour, texts and button) or write kicker/headline/sub line (language tabs), button target (collection / trip / package / My trip / WhatsApp / page), seconds on screen (3–20, default 6), show on (all / mobile / desktop), optional start/end date. Save as draft or Publish.
- **Switch off** a slide without deleting it; **Delete** = archive (restorable).
- **Preview**: phone-frame preview that plays the slides in order with the real timing; live preview pane on desktop.
- Warnings (never block, except rights): video without rights → cannot publish; more than 10 live slides; no live slide (site falls back to a cover image); Private slide not near the top (hint: "Private tours are your priority — move this slide first?"; the owner chose All of Egypt 1st and Private 2nd on 2026-11-28).
- Every change → revision + audit log ("Mona moved _Desert_ from 3 to 1") + revalidate `site` (site updates within 60 s).

#### Other blocks

- **Private block** (top of the home page): headline, text and 4 perks (language tabs), pick which private trips appear in its carousel.
- Ordered blocks with toggles: "Easy first days" (pick 4 trips), "Build your own" text, How it works (3 steps, language tabs), Contact card text.
- Live preview pane on desktop; "Preview" button on mobile.

### 3.7 Settings (owner only)

WhatsApp numbers (primary for requests), phone, email, office address, hours, map link, social links (Google, Tripadvisor, Instagram, Facebook), legal entity line, pickup areas list, request rules (min days ahead, max guests), feature flags.

### 3.8 Users & Activity

- Invite by email (link valid 48 h), set role, disable user, see sessions and sign them out.
- Activity log: filter by user/entity/date; each line readable ("Ahmed changed price of Tiran Island from €35 to €40").

### 3.9 Languages & translation queue

- **Languages** (owner, manager): core EN/IT/ES/FR/DE/RU/TR (fixed), auto languages with on/off switch, coverage %, last run, "Re-translate all", characters used this month vs budget, glossary (do-not-translate words), "index auto languages" switch, preview a page in any language.
- **Translation queue**: every core-language field that is empty, machine-made or "EN changed", filtered by language and type; tap → edit with EN shown above → Save.
- Spec: `docs/08-i18n-plan.md` §11.

### 3.10 My account

Change password, active sessions, request notifications, language (EN/IT/ES/FR/DE/RU/TR).

## 4. Admin API (all under `/v1/admin`, cookie + CSRF + RBAC)

```
POST   /auth/login            POST /auth/logout
POST   /auth/password/reset-request|reset
GET    /me                    GET  /me/sessions          DELETE /me/sessions/:id

GET    /requests?status=&q=&page=        GET /requests/:id
PATCH  /requests/:id   {status, assigned_to, internal_note}
GET    /requests/export.csv  (owner/manager, re-auth)

GET    /trips?collection=&q=   POST /trips   GET /trips/:id
PATCH  /trips/:id/basics|schedule|seo    PUT /trips/:id/itinerary   PUT /trips/:id/items
PUT    /trips/:id/prices       PUT /trips/:id/media      POST /trips/:id/duplicate
POST   /trips/:id/publish|unpublish      POST /trips/reorder
POST   /prices/bulk/preview    POST /prices/bulk/apply

GET/POST/PATCH /collections[...]   POST /collections/reorder
GET/POST/PATCH /packages[...]
GET    /media?filter=   POST /media (multipart)   PATCH /media/:id   DELETE /media/:id   POST /media/:id/trim
GET    /hero-slides            POST /hero-slides         PATCH /hero-slides/:id     DELETE /hero-slides/:id
POST   /hero-slides/reorder {ids:[...]}   POST /hero-slides/:id/publish|unpublish
GET/PUT /i18n/settings   GET /i18n/coverage   GET /i18n/queue?locale=&entity=
POST   /i18n/translate {entity, id, fields?, locale}   POST /i18n/backfill/:locale   GET/PUT /i18n/glossary
GET/PUT /pages/:key/blocks     GET/POST/PATCH/DELETE /faqs
GET/PUT /settings              (owner, re-auth for contacts)
GET/POST/PATCH /users          (owner)
GET    /audit?entity=&user=
GET    /revisions?entity=&id=  POST /revisions/:id/restore
POST   /preview-link {path}
```

## 5. Tech notes

- Next.js App Router, client components for forms, **TanStack Query** for server state with optimistic updates on status toggles and price edits.
- Forms: react-hook-form + zod resolver (same schemas as API).
- UI primitives: Radix (Dialog/Sheet, Popover, Select, Switch, Tabs), `dnd-kit` for reorder, `sonner` for toasts.
- PWA: manifest, icons, service worker for shell caching, Web Push (VAPID keys in env) for new requests.
- Every page has a skeleton loading state and an empty state with the next action.

## 6. Tasks

- [x] M5.1 auth screens (login, setup link, reset) + session handling (2FA removed 2026-11-25)
- [x] M5.2 shell: tab bar/sidebar, PWA manifest, offline banner, i18n
- [x] M5.3 Requests list/detail/actions + WhatsApp reply template + push implementation (real delivery remains external acceptance)
- [x] M5.4 Trips list + editor sections + preview link
- [x] M5.5 Prices screen + bulk change + history/undo
- [x] M5.6 Collections + packages
- [x] M6.1 Media library + upload + video trim
- [x] M6.2 **Hero videos** screen (list in order, drag + ↑/↓ reorder, add/trim/publish, switch off, schedule, preview, undo) + Homepage blocks + FAQ/pages editor
- [x] M6.2b Language tabs in every editor + Languages screen + Translation queue
- [x] M6.3 Settings, users, activity log, my account
- [ ] M6.4 Usability test with 2 real staff members on their phones; fix top 5 issues

## 7. Acceptance checks

- Editor saves acknowledge only the submitted revision and keep newer edits available for retry. Verified in an authenticated browser at 390, 768 and 1440 pixels.
- Inline price changes require Save and support Cancel. The shared bulk limit is 5,000 prices and apply rejects stale previews.
- The requests list, count and filtered CSV use the same filters. Date bounds apply to a single excursion, and a full CSV traverses all results in batches.
- The owner can move any hero video to position 1 on his phone in two taps, and undo it.
- A French-speaking staff member can open the Translation queue filtered to FR and fix texts without touching other languages.
- A staff member who has never seen the admin can change a price and reply to a request on their phone without help.
- Every write can be undone or restored from history.
- An `editor` cannot change prices or settings, even by calling the API directly (tested).

## Search (SEO) section (added 2026-11-28)

Website → Search (SEO), content roles: content health per trip and language,
an on-demand live check of the public site, per-tour snippet preview and
completeness checklist, and connection-required states for Search Console,
Bing, GA4 and PageSpeed. Spec and limits: `docs/seo/SEO-IMPLEMENTATION-REPORT.md`.
