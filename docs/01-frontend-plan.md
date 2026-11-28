# 01 · Frontend plan — public website (`apps/web`)

Source of truth for the look: `reference/mockup/E-Mobile.dc.html` (phone) and `reference/mockup/E-Home.dc.html` (desktop). They are self-contained HTML prototypes: the markup inside `<x-dc>` is the layout, the `<style>` block is the CSS, and the `class Component` script shows the interaction logic. Re-implement them as React components; do not copy the prototype runtime.

---

## 1. Design system

### 1.1 Tokens (put in `packages/ui/tokens.css` as CSS variables, map them in Tailwind v4 `@theme`)

| Token           | Value     | Use                                             |
| --------------- | --------- | ----------------------------------------------- |
| `--paper`       | `#F4EEE3` | page background (limestone)                     |
| `--paper-2`     | `#FBF8F2` | sheets, sticky bars                             |
| `--card`        | `#FFFFFF` | cards, inputs                                   |
| `--line`        | `#E3D9C7` | borders, dividers                               |
| `--line-strong` | `#D3C8B4` | input borders                                   |
| `--ink`         | `#1B1712` | text, dark buttons (basalt)                     |
| `--ink-2`       | `#5E5548` | secondary text (passes AA on paper)             |
| `--ink-3`       | `#6D6354` | captions                                        |
| `--gold`        | `#E0A84A` | accent buttons, highlights (text on gold = ink) |
| `--history`     | `#1D4A8F` | lapis — Pharaohs & Temples                      |
| `--sea`         | `#0A7F8A` | Red Sea                                         |
| `--desert`      | `#9A5B12` | Desert & Adventure                              |
| `--beyond`      | `#7A2E2A` | Beyond Egypt                                    |
| `--relax`       | `#6B3FA0` | Fun & Relax                                     |
| `--all`         | `#1B1712` | All of Egypt                                    |
| `--danger`      | `#B42318` | errors                                          |
| `--ok`          | `#0A7F8A` | success                                         |

Collection colours come from the DB (`collections.color`) so the admin can change them; tokens above are the defaults.

### 1.2 Type

- Display: **Marcellus** (400). Headings, trip names, big numbers.
- UI/body: **Manrope** (400–800).
- Load with `next/font/local`, `display: swap`, vendored complete faces covering Latin accents and Cyrillic. This preserves the approved families and avoids build-time Google downloads; see [font decision](adr/001-local-fonts.md).
- Marcellus has no Cyrillic → Cyrillic locales use **Forum** for headings; Arabic/CJK/other scripts use the matching Noto Sans family, loaded only on that locale (`docs/08-i18n-plan.md` §7).
- Scale (mobile → desktop): h1 46 → 92px, h2 30–34 → 48–60px, trip title 23 → 25px, body 15.5 → 17px, kicker 12px / 700 / letter-spacing .16em / uppercase.

### 1.3 Shape & spacing

- Radii: cards 22–28px, sheets 28px top, pills 999px, inputs 14px.
- Side gutter 22px (mobile), max content 1320px (desktop).
- Buttons min-height 50px (mobile) / 52px (desktop). All touch targets ≥ 44×44.
- Icons: inline stroke SVG (1.9–2.2 stroke), never emoji. Use `lucide-react`.

---

## 2. Routes

All routes are prefixed by locale: core `/en/...`, `/it/...`, `/es/...`, `/fr/...`, `/de/...`, `/ru/...`, `/tr/...` and every live auto locale (`/pl/...`, `/ar/...` …). Default `en`; detect from `Accept-Language` once, then remember in a cookie. Full rules: `docs/08-i18n-plan.md` §2.

| Route                                                   | Page                                              |
| ------------------------------------------------------- | ------------------------------------------------- |
| `/`                                                     | Home                                              |
| `/c/[collection]`                                       | Collection (e.g. `/c/history`)                    |
| `/t/[slug]`                                             | Trip detail (also used for packages)              |
| `/my-trip`                                              | My trip (builder)                                 |
| `/request/done/[ref]`                                   | Request confirmation (shows the WhatsApp message) |
| `/contact`                                              | Contact & office                                  |
| `/faq`                                                  | FAQ (from DB)                                     |
| `/legal/terms`, `/legal/privacy`, `/legal/cancellation` | Legal pages (from DB)                             |

On mobile the collection and trip pages also open as **overlay layers** from the home page (shared-element style, see §5), but each must also be a real URL so it can be shared and indexed. Implement with Next.js **parallel + intercepting routes** (`@modal/(.)c/[collection]`, `@modal/(.)t/[slug]`): navigating inside the app shows the overlay animation; opening the URL directly renders the full page.

---

## 3. Pages — content & behaviour

### 3.0 PRIVATE — a headline feature (client priority)

Private tours matter most to the business, so they appear in two places:

1. **At the start of the home page**: the seed makes the first hero slide "Private with Stella — Your trip, your way." (the owner can reorder slides in the admin; the admin shows a hint if no Private slide is first), and the first section under the hero is a dark navy/gold block with 4 perks (own car, own guide, own start time, own pace), a carousel of private-only trips, and CTAs "See private trips" / "Ask for a private quote". "Private with Stella" is also the first collection card.
2. **Inside every collection**: a sticky segmented switch **Group trips | Private** under the stats. _Group_ lists group trips. _Private_ shows a short banner ("Make any [collection] trip private"), the private-only trips first, then every other trip tagged **"Private on request"**. Opening Request from Private mode preselects _Private_ in the booking sheet.
   Data: `trips.format` (`group` | `private` | `both`) + `private_surcharge_pct` (null = price on request). The virtual collection `private` = all trips with `format in ('private','both')`.
   Analytics: `private_section_view`, `private_mode_on`, `private_quote_click`.

### Imagery tone

Bright, warm and optimistic. All client video is colour-graded (brighter, warmer, richer) and slowed to 0.85×. Photo overlays are light (max 70% at the bottom edge, only where text sits). Apply a subtle `filter: brightness(1.06) saturate(1.18)` only to stock photos that are not yet graded; client photos are graded at upload time in the media pipeline (sharp: modulate brightness 1.06, saturation 1.18).

### 3.1 Home

1. **Story hero** (full screen, `100svh` minus 64px so the next card peeks).
   - **Slides come from the `hero_slides` table, in the order the owner sets in the admin (Homepage → Hero videos).** They are not tied to the collections: the owner picks which video is 1st, 2nd, 3rd, 4th…, can switch a slide off, schedule it (start/end date) or show it on mobile or desktop only. The seed creates a mobile and desktop slide per collection when both videos are ready, with Private first on each device.
   - Each slide: background video (vertical 720×1280 on mobile, horizontal 1280×720 on desktop, poster first) or an image, kicker, Marcellus headline, sub line (translated), primary CTA (to a collection, trip, package, My trip, WhatsApp or an internal page; default label "See [collection] trips"), secondary "WhatsApp".
   - Each slide stays `duration_s` seconds (default 6, set per slide in the admin). Only slide 1's poster is preloaded (LCP); the next slide's video starts loading only when the current one is playing.
   - No published slide → fall back to a single static slide with the first collection's cover image.
   - Instagram-stories style progress bars at the top (one per slide); auto-advance after the slide's `duration_s`; tap left third = previous, right two-thirds = next; horizontal swipe also works; pills row at the bottom to jump.
   - Pause autoplay when the hero is < 60% visible, when the tab is hidden, when an overlay is open, and when `prefers-reduced-motion`.
   - Desktop: text bottom-left, a vertical list of the slides on the right (same order as admin) with thumbnail + progress bar.
   - RTL locales: tap zones and swipe direction are mirrored.
2. **Content sheet** slides over the hero (rounded top, `margin-top: -24px`). While scrolling, the hero scales to 0.9, gains a 36px radius, darkens to 55% brightness, and its text fades out by 260px.
3. **Private with Stella** — the first section inside the content sheet, before _Choose your journey_ — see §3.0.
4. **Choose your journey** — stacked sticky collection cards (mobile); _Private with Stella_ is the first card. Each card is `position: sticky` with `top: 74 + i*14px`; as the next card arrives, the previous card scales down to 0.93 and dims (overlay opacity to 0.45). Card: cover image, kicker dot in collection colour, name, one line, 3 trip thumbnails, "N trips · from €X", arrow button. Desktop: horizontal accordion (hovered panel flex 3.3, others 1).
5. **Easy first days** — horizontal snap carousel (desktop: 4-column grid) of 4 trips picked in admin (`featured_order`). Each card has a `+` (add to my trip).
6. **Build your own Egypt** — dark card: counters per collection (live from My trip), CTA "Start building" / "Open my trip · N picked". Desktop shows a preview of the first 4 days.
7. **How it works** — 3 steps (from DB): Pick your days → Send one request → We confirm. "No payment online".
8. **Not sure what to pick?** — contact card → WhatsApp.
9. **Footer** — collections, contact, policies, languages, legal entity line.

### 3.2 Collection

- Hero 400px (mobile) / 66vh (desktop): collection video or cover, parallax (translateY 0.4×scroll), kicker, name, sub.
- Stats strip: trip count · day range · "from €X".
- **Group trips | Private** segmented switch (sticky, under the stats) — see §3.0. Hidden on the _Private_ and _All of Egypt_ collections.
- Filter chips under it: All · Family · Under 5h (+ "By plane" for history). Filters are client-side.
- Trip cards (mobile 1 column, desktop 3): image 220px with duration tag, "Private" tag, price tag "from €X / unit"; Marcellus title; one-line summary; round `+` button (toggles My trip).
- **"Collect them" card** at the end: a suggested bundle from this collection (configured in admin as a package). Shows thumbnails, "Together €X" (the package price if set, otherwise the sum), "Add all N".
- For **All of Egypt**: list packages (with chips listing the trips inside) + "Build your own" card.
- Empty filter result: message + "Show all".

### 3.3 Trip detail

- Swipeable gallery (images + optional video, scroll-snap) with dots and "n / N" counter; back button; on desktop it is a right-hand drawer (620px) over the page.
- Collection kicker, title, one-line summary.
- Facts grid: Duration · Days it runs · Pickup time · Format (group/private) · Good for (ages).
- **Price block**: every price row from DB, e.g. "Single €15 / person", "Double €20 / quad"; "On request" when amount is null. Small print "Children: ask us" until child rules exist.
- **Your day / The plan** — vertical timeline (line draws in on open; dots in collection colour).
- Packages: "The days inside" — tappable rows that open each trip.
- [x] Present Included, Not included, Optional extras and What to bring in responsive cards with distinct icons and accessible lists.
- Notes (e.g. Jerusalem documents needed, Petra timing disclaimer).
- Sticky bottom bar: price, `+` toggle, **Request** button → booking sheet.
- SEO: `TouristTrip` JSON-LD with `offers` (price, currency EUR), `itinerary`, `provider`.

### 3.4 My trip (builder)

- List of chosen trips ordered: sea → desert → relax → history/beyond (long days later), each labelled **Day N**.
- Auto-insert a **Beach day** after any trip with `flight=true` or `overnight=true` if another trip follows.
- Multi-day trips advance the day counter by their `days_count`.
- Mix bar: proportional coloured segments per collection.
- Adults stepper → live sample total (per-person × adults; per-boat/per-car prices counted once).
- "Request this trip" → booking sheet in multi mode.
- Persist in `localStorage` (`stella.mytrip.v1`) with try/catch; works without it.
- [x] Resolve saved tours independently. Keep available tours visible, let guests remove withdrawn tours and offer a retry for temporary catalog errors. Enable requests once every remaining tour is available.
- [x] Keep My trip accessible from the active trip or collection. Show a persistent desktop shortcut with the saved count and keep the mobile tab actionable.
- [x] Allow guests to reorder saved tours with a touch drag or move buttons. Recalculate day numbers and rest days from that order and use it for the quote and request.

### 3.5 Booking request sheet (bottom sheet on mobile, centered modal on desktop)

Fields: travel format, a start date with an optional last day of stay, adults (≥1), children (≥0) with ages (optional), pickup area chips (Naama Bay, Nabq Bay, Sharks Bay, Hadaba, Old Market, Other → hotel name text), name, WhatsApp number with a country picker, email (optional), notes.

- If any selected tour is private-only, show Private as the required format before the date and contact fields. Otherwise offer Group and Private. Preselect Private when opened from Private mode.
- Inline validation (zod schema shared with API), errors under fields, focus first error.
- [x] After the guest selects a start date, show each tour’s service dates, its price and the server-calculated total. Show all active rate options for a single tour and select the primary row by ID. If a rate changes before submission, show the updated quote and keep the guest’s form details for review.
- [x] Count stay length through the last day of the last tour, including rest days. Warn if the selected stay is shorter.
- [x] Accept national WhatsApp numbers using the selected country’s dialing rules. Accept pasted international numbers with their own country code. Show the exact international number the team will receive.
- [x] Offer an inline country picker searchable by localized name or calling code. Require a listed pickup area and display its validation message beside the choices.
- [x] Open bookings from tomorrow in Cairo time, or later if configured by staff.
- [x] Show a subtotal for priced tours and leave the full estimate on request when any tour needs a quote.
- [x] Retrying the same request details in the same browser tab recovers the original confirmation. A revised quote or a change to the booking details starts a new submission.
- Submit → `POST /v1/requests` → success screen with reference (e.g. `STL-7F3K2`) and the **prefilled WhatsApp message** + button `https://wa.me/<number>?text=<encoded>`.
- Honeypot field + timing check + rate limit (see security plan). No CAPTCHA by default.
- Copy: "No payment online. The team confirms availability, pickup time and price on WhatsApp."

### 3.6 Contact

WhatsApp buttons (numbers from settings), office address with a static map image (no Google Maps embed until consent), opening hours, languages, links to the real Google / Tripadvisor profiles (no star numbers unless pulled live).

---

## 4. Components (build in this order)

`Button`, `IconButton`, `Pill/Chip`, `Tag`, `Stepper`, `DateChips`, `Segmented`, `Field` (label + input + error), `Sheet` (bottom sheet with focus trap, drag-to-close, Esc), `Drawer`, `Toast`, `VideoBg` (poster first, lazy video), `StoryHero`, `StackCards`, `Accordion` (desktop collections), `TripCard`, `PriceRows`, `Timeline`, `Gallery`, `AddToTripButton` (+ fly-to-badge animation), `TabBar` (mobile), `NavBar` (desktop), `MixBar`, `Footer`, `LangSwitch` (core languages + "More languages"), `AutoTranslatedNotice`.

State: **Zustand** store for My trip + UI (sheet open, toast). Server data via RSC fetches with `revalidate` tags; no client fetching libraries needed except for the request POST.

---

## 5. Motion spec

Use `motion` (Framer Motion). All durations in ms; easing `cubic-bezier(.2,.8,.2,1)` unless noted. Every animation must have a reduced-motion fallback (opacity only or none).

| Element                | Animation                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hero background        | crossfade 1100ms; active image Ken Burns scale 1.16→1.02 over 7.5s                                               |
| Hero text              | lines rise 28px + fade, stagger 80/180/280ms, 900ms `(.16,.84,.24,1)`                                            |
| Story bars             | width 0→100% linear 6s; paused state keeps position                                                              |
| Hero on scroll         | scale 1→0.9, radius 0→36px, brightness 1→0.55 over the first 700px (scroll-linked, `useScroll` + `useTransform`) |
| Stack cards            | scale 1→0.93 and dim 0→0.45 as the next card covers them                                                         |
| Section reveal         | translateY 30→0 + fade, 800–900ms, IntersectionObserver threshold .12, once                                      |
| Open collection        | clip-path inset from the tapped card's rect to full screen, 620ms `(.7,0,.2,1)`; close: fade + scale .97, 320ms  |
| Open trip              | slide in from right 500ms; close slide out 320ms `(.6,0,.8,.4)`                                                  |
| Sheets                 | slide up 450ms `(.2,.9,.25,1)`, backdrop fade 300ms                                                              |
| Add to trip            | gold dot flies from the button to the My-trip tab (700ms, slight overshoot), badge bump scale 1→1.45→1           |
| Timeline               | vertical line scaleY 0→1, 1100ms, delay 300ms                                                                    |
| Lists inside overlays  | stagger 90ms per item, start 450ms                                                                               |
| Shimmer on primary CTA | 3.2s loop, starts after 1.2s; disabled on reduced motion                                                         |

Performance rules: animate only `transform`, `opacity`, `clip-path`, `filter` on the hero only. Use `will-change` sparingly. Scroll handlers via `requestAnimationFrame`, passive listeners. Target 60fps on a mid-range Android.

- [x] Restore the previous panel and its scroll position on Back. Play the exit only when returning to the visible page underneath, and skip the entrance on a restored history entry.

---

## 6. Media rules

- Images come from the API with variants: `w=480, 768, 1200, 1920` × `avif, webp, jpg`. Use `next/image` with a custom loader pointing to `media.` subdomain; always set `sizes`.
- **Video**: vertical (720×1280) for mobile, horizontal (1280×720) for desktop. Show the poster immediately; load the video only when (a) visible, (b) `navigator.connection.saveData` is false, (c) not `prefers-reduced-motion`. `muted playsInline loop preload="none"`. Never autoplay with sound.
- Hero LCP = the poster image, preloaded with `fetchpriority="high"`.
- Every image has an alt text from the DB (core languages by staff, others auto-translated).

---

## 7. i18n

Full spec: **`docs/08-i18n-plan.md`**. Summary:

- `next-intl`; message files `messages/en.json`, `it.json`, `es.json`, `fr.json`, `de.json`, `ru.json`, `tr.json` for UI strings (CI checks same keys). Auto locales get their UI strings from `GET /v1/public/messages?locale=` (machine-translated by the worker).
- Content (trip titles, descriptions, itinerary, includes, hero slides) comes from the DB already resolved for the locale: human core value → machine translation → EN. When EN is used, mark `lang="en"` on that element.
- Auto-locale pages show `AutoTranslatedNotice` ("Translated automatically · Read in English").
- RTL locales (`ar`…): `dir="rtl"`, CSS logical properties only (no `left/right`, `ml/mr` in components).
- Prices formatted with `Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })`.
- Dates with `Intl.DateTimeFormat`. Time zone for trips: `Africa/Cairo`.
- `hreflang` alternates for every live locale + `x-default`; localized slugs optional (keep same slug for v1).

---

## 8. SEO & sharing

- Metadata per page from DB (title, description, OG image = cover variant 1200×630).
- `sitemap.xml` and `robots.txt` generated from published collections/trips.
- JSON-LD: `TravelAgency` (home), `TouristTrip` + `Offer` (trip), `BreadcrumbList`.
- Canonical URLs per locale.
- 2026-11-27 SEO audit (`docs/seo/`): metadata in `<head>` for every user agent (`htmlLimitedBots`), localized home/collection/FAQ/contact titles and descriptions, connected JSON-LD graph (TravelAgency, WebSite, WebPage, TouristTrip, BreadcrumbList, CollectionPage, FAQPage, ContactPage), sitemap images, `AI_TRAINING_CRAWLERS` robots switch, optional `/llms.txt`, and the `pnpm seo:check` crawl gate in CI.

## 9. Performance budget (mobile, 4G, mid Android)

LCP < 2.5s · CLS < 0.05 · INP < 200ms · JS on home < 150 KB gzip · first video bytes only after LCP.

## 10. Analytics events (Umami)

`search_open`, `search_select` (`type`, `slug`, `position`), `search_no_results` (never the query text), `hero_slide_change`, `collection_open`, `trip_open`, `trip_add`, `trip_remove`, `mytrip_open`, `request_open`, `request_submit_ok`, `request_submit_error`, `whatsapp_click`, `lang_change` (with `from`, `to`, `auto: bool`), `auto_notice_read_en`, `private_section_view`, `private_mode_on`, `private_quote_click`. No personal data in events.

## 11. Tasks (tick as you go)

Execution phases for this file (stop before file 02):

- [x] F1 Foundation: web app, tokens, fonts, locales, public API contracts.
- [x] F2 Discovery: hero, home, Private, collections and trip routes/overlays.
- [x] F3 Planning: My trip, day ordering, estimates, request sheet and confirmation.
- [x] F4 Content and polish: contact/FAQ/legal, desktop, motion and SEO.
- [x] F5 Verification executed: typecheck, lint, unit/contract tests, responsive visual QA and Lighthouse. Outstanding acceptance items are listed below; this does not certify production readiness.

Backend-dependent acceptance (real persistence, admin revalidation and automatic
translation jobs) stays pending until the later files provide those services.
Test fixtures are isolated from the production catalog path.

The checks below record frontend implementation and local QA, not the dependent
DB/admin/worker acceptance gates. Full evidence: [frontend verification](frontend-verification.md).

- [x] M2.1 tokens, fonts (incl. Cyrillic + Arabic/Chinese fallbacks), base layout, `TabBar`, `NavBar`, `Footer`, `LangSwitch` (core + "More languages"), `AutoTranslatedNotice`
- [x] M2.1b **Language change (client, 2026-11-11)**: seven core locales EN/IT/ES/FR/DE/RU/TR; added FR/DE/TR UI drafts, shared constants and phone defaults, middleware, switcher and tests. 30 unit and 24 browser tests pass. Native-speaker approval is still pending; these are not represented as human-approved translations.
- [x] M2.1c **Owner update (2026-11-12)**: complete existing core content authored directly by Codex and seeded without a translator subscription; fixed hero inheritance, time labels, confirmations and full-document locale switching. All 38 tours have zero EN fallback in every core locale; 21 real browser language checks pass. See `docs/core-languages-verification.md`.
- [x] M2.2 `StoryHero` from public hero-slide DTOs (admin order, per-slide duration, device filter, schedule) with video, bars, swipe, pause rules
- [x] M2.3 Home sections + `StackCards` + reveal
- [x] M2.3b **Private**: home Private section, Private-first test slide & card, virtual `private` collection page; actual seed remains backend work
- [x] M2.4 Collection page + overlay (intercepting route) + Group|Private switch + filters + combo card
- [x] M2.5 Trip page/overlay + gallery + price rows + timeline + sticky bar
- [x] M2.6 My trip store + page/drawer + day logic + mix bar (unit tests for day logic)
- [x] M2.7 Request sheet + validation + success screen + WhatsApp link; real POST, DB snapshot and local Mailpit verified on 2026-11-12. Send respects the backend's 3-second form minimum.
- [x] M2.8 Contact, FAQ, legal page consumers; absent legal/FAQ content has honest empty states
- [x] M3.1 Desktop layouts (accordion, drawers, modal)
- [x] M3.2 Motion polish + reduced-motion local audit
- [x] M3.3 SEO (metadata, JSON-LD, sitemap) + local Lighthouse score gates; strict LCP budget remains open
- [x] M3.4 Visual QA against the mockup at 390 / 768 / 1440
- [x] M3.5 **Trip search (owner request, 2026-11-26)**: header search button on every public page opens a full-screen (mobile) / centered (desktop) dialog with collection chips and the admin's featured trips; results update per keystroke from a lazily loaded index (`/api/search-index`), across every live language, with typo, accent and Arabic-spelling tolerance and staff keywords. Combobox keyboard pattern, Back/Esc close, RTL, reduced motion, 7-language strings. Spec and plan: `docs/superpowers/specs|plans/2026-11-26-trip-search*`. Golden set (≥ 120 queries) in `packages/shared/src/search-golden.test.ts`; browser checks in `tests/e2e/search.spec.ts`.

### Outstanding acceptance — not signed off

- [ ] Mobile LCP < 2.5 s: 2026-11-14 three-run medians are home 2.87 s and trip 2.97 s (from 3.24/3.12 s) on the local QA stack. CLS and the Lighthouse score gates pass; this stricter budget does not. Remaining critical path: the React/Next/next-intl runtime (~150 kB) sharing bandwidth with the hero; see `build-order-verification.md`.
- [ ] Field INP < 200 ms and mid-range Android motion verification; Lighthouse TBT is not INP.
- [x] Real request persistence, local staff SMTP notification and server-recomputed prices at all three viewport sizes (2026-11-12; backend verification).
- [x] Authenticated admin API price/hero-order changes visible within 60 s using real revalidation, plus Undo (2026-11-12). The admin UI workflow itself awaits file 05.
- [ ] Native-speaker review of EN/IT/ES/FR/DE/RU/TR; provider/coverage tests and per-script font checks before enabling further languages. Auto-locale QA currently exercises English fallback and RTL, not translated content.
- [ ] Approved legal content, confirmed media rights and real production video variants. Video playback rules are implemented; unconfirmed clips remain unpublished.
- [ ] Full assistive-technology/device audit on the integrated site; local checks cover keyboard, focus restoration, reduced motion and automated WCAG rules.

## 12. Acceptance checks

- The hero plays the slides in exactly the order set in the admin; after the owner moves a video to position 1, the site shows it first within 60 seconds.
- The site reads naturally in EN/IT/ES/FR/DE/RU/TR after native-speaker approval, and every enabled auto language works (see `docs/08-i18n-plan.md` §14).
- A first-time visitor on a phone can find a trip, see its real price, and send a request in under 60 seconds.
- Changing a price in the admin shows on the site within 60 seconds (on-demand revalidation via `revalidateTag`).
- With JavaScript disabled, trip pages still render content and the WhatsApp link works.
