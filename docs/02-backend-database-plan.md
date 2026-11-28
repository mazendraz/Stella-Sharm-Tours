# 02 · Backend & database plan (`apps/api`, `packages/db`)

**PostgreSQL is self-hosted.** Dev: Docker container on the developer's machine. Prod: Docker container on the client's VPS, bound to the private Docker network only (never `0.0.0.0:5432`). No Supabase / Firebase / hosted DB.

---

## 1. API shape

- Hono on Node 22, JSON over HTTPS, versioned under `/v1`.
- Two surfaces with separate routers and middleware:
  - **Public** `/v1/public/*` — read-only catalog + `POST /v1/requests`. Cached, rate-limited, no cookies.
  - **Admin** `/v1/admin/*` — cookie session + CSRF + RBAC. Never cached.
- Validation: every body/query parsed with a zod schema from `packages/shared`. Unknown keys rejected.
- Errors: `{ error: { code, message, fields? } }`, never stack traces.
- OpenAPI generated from zod (`@hono/zod-openapi`) → `/v1/openapi.json` (admin-only in prod).

### 1.1 Public endpoints

| Method | Path                                   | Notes                                                                                                                                                   |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/public/site?locale=`              | settings (contacts, address, hours), live locales, homepage blocks, **hero slides** (published, inside their schedule, in admin order), nav collections |
| GET    | `/v1/public/messages?locale=`          | UI strings for an auto locale (machine-translated `en.json`); core locales use the repo files                                                           |
| GET    | `/v1/public/collections?locale=`       | published collections with counts and min price                                                                                                         |
| GET    | `/v1/public/collections/:slug?locale=` | collection + published trips + combo package. `private` returns all trips with `format in ('private','both')`, private-only first                       |
| GET    | `/v1/public/trips/:slug?locale=`       | full trip incl. prices, itinerary, inclusions, media                                                                                                    |
| GET    | `/v1/public/packages/:slug?locale=`    | package + its trips                                                                                                                                     |
| GET    | `/v1/public/search-index?locale=`      | published trips, packages, collections: display fields + normalized text of every live locale + `search_keywords`                                       |
| GET    | `/v1/public/faq?locale=`               |                                                                                                                                                         |
| GET    | `/v1/public/pages/:key?locale=`        | legal/static pages                                                                                                                                      |
| POST   | `/v1/requests`                         | booking request (see §4)                                                                                                                                |

**Search index** (2026-11-26, spec `docs/superpowers/specs/2026-11-26-trip-search-design.md`): `trips.search_keywords` and `collections.search_keywords` (jsonb, migration `0015`, `{ en?, it?, es?, fr?, de?, ru?, tr?, extra? }`, ≤ 30 words of ≤ 60 chars per list, no case-insensitive duplicates) are staff-edited matching aids: never displayed, never machine-translated. The seed fills them from `data/search-keywords.json` without overwriting admin edits. `from_price_eur` is computed with `estimateTrip` exactly like the trip card. Matching runs in the browser (`packages/shared/src/search.ts`); its quality contract is `search-golden.test.ts`.

Responses set `Cache-Control: public, s-maxage=60, stale-while-revalidate=600` and an `ETag`. The web app also uses Next.js tags (`collection:<slug>`, `trip:<slug>`, `site`) and the API calls the web app's `/api/revalidate` (secret header) after any admin change.

### 1.2 Admin endpoints (summary — full list in the admin plan)

`/v1/admin/auth/*`, `/v1/admin/requests*`, `/v1/admin/trips*`, `/v1/admin/prices*`, `/v1/admin/collections*`, `/v1/admin/packages*`, `/v1/admin/hero-slides*`, `/v1/admin/i18n*`, `/v1/admin/media*`, `/v1/admin/pages*`, `/v1/admin/settings`, `/v1/admin/users*`, `/v1/admin/audit`, `/v1/admin/revisions/:id/restore`.

---

## 2. Database schema (Drizzle, PostgreSQL 16)

The SQL below is the target shape (illustrative order — in Drizzle, define `admin_users` and `media` first because other tables reference them).
Conventions: `id uuid default gen_random_uuid()`, `created_at/updated_at timestamptz`, translated text as `jsonb` `{ "en": "...", "it": "...", "es": "...", "fr": "...", "de": "...", "ru": "...", "tr": "..." }` validated by zod (`en` required), machine translations for other languages in `content_translations` (schema + resolver in `docs/08-i18n-plan.md` §3); every `?locale=` endpoint returns text already resolved for that locale, money as `numeric(10,2)` in EUR, soft delete with `archived_at`.

```sql
-- catalog
create table collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null default 'normal' check (kind in ('normal','private_virtual','packages')),
  name jsonb not null, short_name jsonb, headline jsonb, subline jsonb,
  perks jsonb,                  -- private collection: [{title:{en,it,es,fr,de,ru,tr}, sub:{...}}] x4
  color text not null default '#1B1712',
  cover_media_id uuid references media(id),
  hero_video_id uuid references media(id),   -- collection PAGE hero only; the home hero uses hero_slides
  sort int not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz default now(), updated_at timestamptz default now(), archived_at timestamptz
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null default 'trip' check (kind in ('trip','package')),
  collection_id uuid not null references collections(id),
  title jsonb not null, summary jsonb, description jsonb,
  days_label jsonb,             -- "Every day", "Sunday · Wednesday · Friday"
  run_days smallint[],          -- 0=Sun..6=Sat, null = every day / on request
  on_request boolean default false,
  departure_label text, return_label text,
  duration_label jsonb, duration_minutes int, days_count smallint default 1,
  transport text,               -- bus, plane, boat, jeep, quad ...
  format text not null default 'group' check (format in ('group','private','both')),
  private_surcharge_pct numeric(5,2),   -- e.g. 60 if private allowed on a group trip
  flight boolean default false, overnight boolean default false,
  private_on_request boolean not null default true,  -- shows 'Private on request' in Private mode
  family_friendly boolean default false, min_age smallint,
  notes jsonb,                  -- array of {en,it,es,fr,de,ru,tr}
  seo_title jsonb, seo_description jsonb,
  featured_order smallint,      -- "Easy first days"
  sort int default 0,
  status text not null default 'draft' check (status in ('draft','published','hidden')),
  created_at timestamptz default now(), updated_at timestamptz default now(), archived_at timestamptz
);

create table trip_prices (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  label jsonb,                  -- null = default; "Single", "Double", "+15 min swim"
  amount_eur numeric(10,2),     -- null = on request
  unit text not null check (unit in ('person','child','quad','buggy','car','boat','group','hour')),
  min_qty smallint, max_qty smallint,  -- e.g. car up to 6
  is_primary boolean default false,    -- the "from" price shown on cards
  sort int default 0,
  valid_from date, valid_to date        -- optional seasonal prices
);

create table trip_itinerary (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  time_label text, text jsonb not null, sort int default 0
);

create table trip_items (        -- included / excluded / optional / bring / highlight
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  type text not null check (type in ('include','exclude','optional','bring','highlight')),
  text jsonb not null, extra_price_eur numeric(10,2), sort int default 0
);

create table package_items (
  package_id uuid references trips(id) on delete cascade,
  trip_id uuid references trips(id),
  day_index smallint, sort int default 0,
  primary key (package_id, trip_id)
);

-- media
create table media (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image','video')),
  original_path text not null,  -- private originals dir
  variants jsonb,               -- {"avif":{"480":"...","768":"..."},"webp":{...},"jpg":{...}} or {"mp4_v":"...","mp4_h":"...","poster":"..."}
  width int, height int, duration_s numeric(6,2), bytes bigint, sha256 text unique,
  alt jsonb, credit text, license text,
  rights_status text not null default 'unknown' check (rights_status in ('owned','licensed','permission','unknown')),
  focal_x numeric(4,3) default .5, focal_y numeric(4,3) default .5,
  status text default 'processing' check (status in ('processing','ready','failed')),
  uploaded_by uuid references admin_users(id), created_at timestamptz default now()
);
create table trip_media (
  trip_id uuid references trips(id) on delete cascade,
  media_id uuid references media(id),
  role text not null check (role in ('cover','gallery','video')),
  sort int default 0, primary key (trip_id, media_id, role)
);

-- site content
create table settings (key text primary key, value jsonb not null, updated_at timestamptz default now(), updated_by uuid);
  -- keys: contacts {whatsapp_primary, whatsapp_secondary, phone, email}, address, hours, social, legal_entity, pickup_areas, request_rules
create table page_blocks (      -- homepage + static pages, ordered blocks
  id uuid primary key default gen_random_uuid(),
  page_key text not null,       -- 'home','contact','terms','privacy','cancellation'
  type text not null,           -- 'how_steps','contact_card','rich_text','faq_list'...
  data jsonb not null, sort int default 0, status text default 'published'
);
create table hero_slides (      -- home story hero; order and content controlled in admin → Homepage → Hero videos
  id uuid primary key default gen_random_uuid(),
  video_media_id uuid references media(id),   -- kind='video', status='ready'; pipeline gives mp4_v, mp4_h, poster
  image_media_id uuid references media(id),   -- image-only slide, or poster override
  collection_id uuid references collections(id),  -- optional: colour, default texts and default CTA come from it
  kicker jsonb, headline jsonb, subline jsonb,    -- null = use the collection's texts
  cta_type text not null default 'collection'
    check (cta_type in ('collection','trip','package','my_trip','whatsapp','page')),
  cta_target text,              -- slug or internal path (validated: internal only, no external URLs)
  cta_label jsonb,              -- null = default "See [collection] trips"
  duration_s smallint not null default 6 check (duration_s between 3 and 20),
  show_on text not null default 'all' check (show_on in ('all','mobile','desktop')),
  starts_at timestamptz, ends_at timestamptz,   -- optional schedule (seasonal offers)
  sort int not null default 0,  -- 0 = first slide
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz default now(), updated_at timestamptz default now(), archived_at timestamptz,
  check (video_media_id is not null or image_media_id is not null)
);
-- Publish rules (API): max 10 published slides; a slide's video must have rights_status <> 'unknown' and status 'ready';
-- headline must resolve (own or from collection). Reorder = one transaction rewriting sort 0..n.

-- content_translations: see docs/08-i18n-plan.md §3

create table faqs (id uuid primary key default gen_random_uuid(), q jsonb not null, a jsonb not null, sort int default 0, status text default 'published');
create table reviews (           -- only real reviews, with a link to the source
  id uuid primary key default gen_random_uuid(), author text, text jsonb, source text, source_url text not null, rating smallint, visit_month date, status text default 'hidden'
);

-- requests
create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,     -- STL-XXXXX (Crockford base32)
  mode text not null check (mode in ('single','multi')),
  locale text not null,
  start_date date not null,
  adults smallint not null check (adults between 1 and 60),
  children smallint not null default 0 check (children between 0 and 40),
  child_ages smallint[],
  format text check (format in ('group','private')),
  pickup_area text, hotel text,
  name text not null, phone text not null, email text, notes text,
  estimate_eur numeric(10,2),   -- recomputed on the server, never trusted from client
  status text not null default 'new' check (status in ('new','contacted','confirmed','completed','cancelled','spam')),
  assigned_to uuid references admin_users(id),
  internal_note text,
  ip_hash text, user_agent text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table booking_request_items (
  request_id uuid references booking_requests(id) on delete cascade,
  trip_id uuid references trips(id),
  day_index smallint, price_snapshot jsonb,   -- prices at request time
  primary key (request_id, trip_id)
);

-- admin & security
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null, name text not null,
  password_hash text not null,  -- argon2id
  role text not null check (role in ('owner','manager','editor','sales')),
  totp_secret_enc bytea, totp_enabled boolean default false, recovery_codes_hash text[],
  failed_logins int default 0, locked_until timestamptz,
  last_login_at timestamptz, disabled_at timestamptz, created_at timestamptz default now()
);
create table sessions (
  id text primary key,          -- 32 random bytes, stored hashed (sha256)
  user_id uuid not null references admin_users(id) on delete cascade,
  created_at timestamptz default now(), expires_at timestamptz not null, last_seen_at timestamptz,
  ip_hash text, user_agent text, mfa_passed boolean default false
);
create table audit_log (
  id bigserial primary key, at timestamptz default now(),
  user_id uuid, action text not null, entity text not null, entity_id text,
  before jsonb, after jsonb, ip_hash text
);
create table revisions (         -- powers "Undo" and price history
  id bigserial primary key, entity text not null, entity_id uuid not null,
  snapshot jsonb not null, created_by uuid, created_at timestamptz default now()
);
```

Indexes: `hero_slides(status, sort)`, `content_translations(locale, entity)`, `trips(collection_id, status, sort)`, `trip_prices(trip_id, sort)`, `booking_requests(status, created_at desc)`, `audit_log(entity, entity_id)`, `revisions(entity, entity_id, created_at desc)`, trigram index on `trips.title->>'en'` for admin search.

Run migrations with `drizzle-kit generate` → review SQL → `drizzle-kit migrate`. Never edit an applied migration.

---

## 3. Seed (`pnpm db:seed`)

- Reads `data/catalog.json`.
- [x] Import itinerary stops with unknown times as null and preserve their descriptions and order. Import supplied return times on fresh installs and fill missing return times on repeat seeds. Preserve existing staff-entered return times.
- Creates the 7 collections (`private` as `kind='private_virtual'`, `all` as `kind='packages'`), 38 trips (`format='private'` where the catalog says private, else `format='both'` with `private_on_request=true`), their prices, itinerary, includes/excludes/optional/notes, and 4 **draft** packages.
- Imports media listed in each trip's `media` from `assets/` through the same pipeline as uploads (so variants are generated).
- Trips whose price is `null` get `on_request = true`.
- Leaves missing `it`, `es`, `fr`, `de`, `ru`, `tr` values empty (collection names/headlines have `it` in the catalog). A configured worker backfills missing core content as machine fallbacks flagged for staff review, and every enabled supported auto locale; without a key the site falls back to EN. Core UI dictionaries stay in the repo and are never machine-overwritten.
- Creates **hero slides**: one per collection: **All of Egypt first, then Private**, then the rest in catalog order (owner, 2026-11-28), `duration_s = 6`. A slide whose video has `rights_status='unknown'` uses the collection cover image instead. Retain the slide as a draft when it has neither a publishable video nor a supplied cover. The current catalog includes a cover for all seven collections.
- Settings `i18n` and `i18n_glossary` with the defaults from `docs/08-i18n-plan.md`.
- Creates the first **owner** user from env `SEED_OWNER_EMAIL` with a one-time setup link printed in the console (no default password).
- Idempotent: upsert by slug.

---

## 4. Booking request flow (`POST /v1/requests`)

Body (zod): `{ mode, items:[{ trip_slug, price_id?, hours?, day_index? }], start_date, adults, children, child_ages?, format, pickup_area, hotel?, name, phone, email?, notes?, locale, quote_id?, hp, t }` where `hp` is the honeypot (must be empty) and `t` the form-open timestamp (reject if submitted < 3s after open).

1. Rate limit: 5 requests / 10 min / IP and 20 / day / phone number. Require the canonical international phone format (E.164) before applying the phone quota and saving the request. The saved number is the one sent in the staff email.
2. Validate dates: not in the past, ≤ 18 months ahead; for trips with `run_days`, warn (not reject) if the day doesn't match — staff can still propose.
3. Plan dates using published trips, then resolve each trip’s eligible rates for its own start date. Rate windows are inclusive. Among eligible options, use the primary row or the first non-child row in display order, unless the guest chooses a specific eligible price ID. Derive package rates from component service dates when the package has no fixed price. Recompute with `packages/shared/price.ts` and save the price IDs, service dates and amounts in the item snapshots.
4. Insert request + items in one transaction; generate `ref`.
5. Enqueue notifications (pg-boss): email to the staff inbox, optional Telegram/WhatsApp Business API later.
6. Return `{ ref, estimate_eur, whatsapp_url, message }`. The WhatsApp number comes from settings.

`POST /v1/requests/quote` accepts only itinerary, guest counts and locale. It uses the same price calculation and returns the dated options, totals and a quote ID. A submission with a stale quote ID returns HTTP 409 with the revised quote before any request or notification is written. Older callers can omit the quote ID and receive the current server-calculated estimate.

`POST /v1/requests` accepts an optional opaque `submission_id` for compatibility with earlier callers. The web form supplies a stable ID for the same booking details in a tab. The booking, receipt and notification commit together. A matching replay returns the original confirmation for 24 hours. Reusing the ID for changed details returns HTTP 409. Expiry clears the confirmation payload and retains the ID and fingerprint until customer-data cleanup, so a late retry cannot create a duplicate.

### Price calculator (`packages/shared/price.ts`, shared by web & API, unit-tested)

- unit `person`: `adults × amount + children × childAmount` where `childAmount` = the `child` price row if it exists, else `amount` (until the client gives child rules).
- unit `quad|buggy|car|boat|group`: `amount × ceil(people / capacity)` when `max_qty` is set, else `amount × 1`.
- unit `hour`: `amount × hours` (default 1).
- `format = private` on a group trip: `× (1 + private_surcharge_pct/100)` only if the surcharge is set; otherwise "on request".
- any `null` amount → whole estimate is "on request" for that item.
- Package: use the package's own price if set, else sum of items.
- Round each completed booking line to a whole euro after calculating the price and surcharge, then sum the rounded lines. Keep the original stored rate and its precision in the snapshot.

---

## 5. Media pipeline

- Upload: `POST /v1/admin/media` multipart, streamed to a temp dir. Limits: images ≤ 25 MB, video ≤ 300 MB.
- Validate by **magic bytes** (file-type), not extension. Allowed: JPEG, PNG, WebP, HEIC/HEIF (phones), AVIF; MP4/MOV (H.264/HEVC). No SVG, GIF, PDF.
- Images (sharp): auto-rotate, strip EXIF/GPS, convert to sRGB, generate widths 480/768/1200/1920 in AVIF + WebP + JPEG (q≈72), keep the original in a private dir.
- **Colour grade** (brand look = bright & warm): images `sharp.modulate({ brightness: 1.06, saturation: 1.18 })` + slight warm tint, toggle "Auto-enhance" (default on) per upload; videos get the ffmpeg grade from `assets/ASSETS.md` and are slowed to 0.85×.
- Video (ffmpeg in a worker): strip audio by default, make `mp4_v` 720×1280 and `mp4_h` 1280×720 (crop around the focal point), H.264 CRF 26 preset veryfast, `+faststart`, max 20s for hero use (trim in admin), poster JPG/AVIF.
- Files are content-addressed at `/srv/stella/media/<sha256[0:2]>/<sha256>/<variant>.<ext>`. Caddy checks the rendition registry and current media rights before serving with `Cache-Control: public, no-cache, must-revalidate`. File delivery still supports conditional requests, AVIF/WebP negotiation and video ranges.
- Delete = soft (hide); a weekly job removes files not referenced for 30 days.

---

## 6. Jobs (pg-boss)

`media.process`, `notify.request.created`, `revalidate.web`, `cleanup.media`, `cleanup.sessions`, `privacy.purge_requests` (anonymise requests older than 18 months).

## 7. Config (env)

`DATABASE_URL`, `SESSION_SECRET`, `TOTP_ENC_KEY` (32 bytes, base64), `MEDIA_ROOT`, `MEDIA_PUBLIC_URL`, `WEB_REVALIDATE_URL`, `WEB_REVALIDATE_SECRET`, `SMTP_*`, `STAFF_NOTIFY_EMAIL`, `SEED_OWNER_EMAIL`, `IP_HASH_SALT`, `CORS_ORIGINS`. Validated at boot with zod; the process exits if anything is missing.

## 8. Tests

- Unit: price calculator, day ordering, ref generator, zod schemas.
- Integration (Testcontainers Postgres): seed, public endpoints, request creation, auth, RBAC matrix, upload rejection cases.
- Contract: OpenAPI snapshot.

## 9. Tasks

### Execution phases for this file

- [x] B1 Foundation: API/worker packages, strict configuration, PostgreSQL schema and reviewed migration.
- [x] B2 Catalog: idempotent real-data seed, safe media import, localized public DTOs and cache/ETag.
- [x] B3 Requests: atomic persistence, shared server pricing, anti-spam limits, snapshots and notification outbox.
- [x] B4 Administration: sessions/2FA/CSRF/RBAC, validated catalog/content/price endpoints, audit and revisions.
- [x] B5 Media and jobs: quarantine, image/video processing, pg-boss handlers, translation/privacy/cleanup/revalidation boundaries.
- [x] B6 Verification: PostgreSQL integration, security/contract tests, frontend real-API checks and handoff evidence (2026-11-12; `docs/backend-verification.md`).

The seven-core-language change (EN/IT/ES/FR/DE/RU/TR) is authoritative.
Auto locales require configured providers and coverage; no provider means core only.
Stale file 08 examples describing DE as auto were corrected. Host-only `__Host-`
sessions follow security §2, overriding
the parent-domain cookie example in integration §1. Stop after this file before 03.

- [x] M1.1 `packages/db` schema + first migration
- [x] M1.2 seed from `data/catalog.json` (+ media import)
- [x] M1.3 public read endpoints + caching + ETag
- [x] M1.4 shared zod schemas + price calculator (+ tests)
- [x] M4.1 `POST /v1/requests` + anti-spam + notification job
- [x] M5.x admin endpoints (API scope; admin screens and UI acceptance remain file 05)
- [x] M6.1 media upload + processing worker

Local results and open launch/performance/content limits are recorded in
`docs/backend-verification.md`. Native copy, external providers, manual device
accessibility and the strict LCP budget are not signed off by these checkmarks.
