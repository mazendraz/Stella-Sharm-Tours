# Stella Sharm Tours — Admin Dashboard Rebuild Spec

> **For:** Claude Code
> **Scope:** Rebuild the **admin frontend** (`http://localhost:3001`). Keep the existing API (`http://localhost:4000/v1/admin`) and the public site (`http://localhost:3000`) unless a change is listed in §9 _Backend changes_.
> **Source of findings:** a hands-on audit of every page and button on 2026-11-14. Every API path, field name and enum value below was observed from the running app. If the code disagrees with this document, **the code wins**: stop, note the difference in `REBUILD_NOTES.md`, and adapt.

---

## 0. Ground rules (read first)

1. **Do not touch the public website** (port 3000) or its components. Only the admin app changes, plus the backend items explicitly listed in §9.
2. **Do not change the database schema** unless §9 lists it. Prefer adding endpoints over changing existing ones. Never rename existing API fields.
3. **Do not delete or mutate real data** while developing. Use a local DB copy or seed. Never run destructive scripts.
4. **Work on a new branch** `admin-rebuild`. Commit per milestone (§12). Keep the old admin working until the new one reaches parity. The cleanest approach is to build the new screens in place, page by page, behind the same routes.
5. **Keep the stack.** The admin is **Next.js App Router** (RSC; you'll see `?_rsc=` requests) with plain CSS classes (`.secondary`, `.pill`, `.card`, `.icon-button`, `.check`). Don't add a UI framework (MUI, Chakra, etc.). Small headless libraries are OK if needed and not already present: `@dnd-kit` for drag-and-drop, Radix primitives for dialog/menu/popover. Check `package.json` first and reuse what's installed.
6. **Keep the admin UI i18n.** The admin has a language switcher with EN / IT / ES / FR / DE / RU / TR. Every new string must go through the existing admin i18n system, never hard-coded. Find where current strings like `"Save changes"` and `"Nothing here yet"` live and follow that pattern. Add all 7 locales for every new key; English is the source, and the others can be machine-drafted but must exist.
7. **Keep brand tokens.** Reuse the existing CSS variables/colours (dark green primary, cream background, existing font). Don't invent a new palette.
8. **Never use `window.confirm` / `alert` / `prompt`.** The current app uses `window.confirm("Leave without saving?")`; replace every such call with the shared `ConfirmDialog` (§3.6).
9. **Every destructive or publish-state action needs a `ConfirmDialog` with real text** (§3.6 matrix). No empty "Confirm" dialogs anywhere.
10. **Timezone:** the business is in Egypt. Display every date/time in **`Africa/Cairo`** and convert to/from UTC at the API boundary. Never show "UTC" to the user.
11. **Money:** EUR, always formatted `€1,234.00` → in UI show `€1,234` when there are no cents and `€1,234.50` when there are. Use `Intl.NumberFormat` with the current admin locale. Amount inputs keep 2-decimal strings when sent to the API (the API uses strings like `"260.00"`).
12. **Before writing UI code**, do the discovery in §1 and write the results to `REBUILD_NOTES.md`.

---

## 1. Discovery (do this first, write results to `REBUILD_NOTES.md`)

Find and record:

1. The admin app folder, route files for every page in §5, and the shared layout/sidebar component.
2. The admin i18n mechanism (files and function name) and how locale is persisted.
3. The API client used by the admin (fetch wrapper, auth/cookies, error handling, the `reauth` flow, the toast + Undo mechanism, and how Undo calls `POST /revisions/:id/restore`).
4. **Every write endpoint** the current admin calls, with method, path and body shape. Known so far:
   - `PATCH /trips/:id/basics`
   - `PUT /trips/:id/prices`
   - `POST /trips/:id/publish` / `POST /trips/:id/unpublish`
   - `POST /trips/reorder`
   - `POST /hero-slides/:id/publish` / `POST /hero-slides/:id/unpublish`
   - `POST /collections/:id/publish`
   - `PUT /homepage`
   - `PATCH /media/:id`
   - `POST /media/:id/trim`
   - `PATCH /requests/:id`
   - `POST /prices/bulk/preview` (+ its confirm endpoint)
   - `POST /revisions/:id/restore`
   - `POST /auth/reauth`
   - `POST /auth/2fa/setup`
   - Duplicate, archive, upload, FAQ, pages, settings sections, users, invite, sessions, and each trip-editor section's save (Schedule, Day plan, Included & essentials, Media, Search appearance). **Find all of them.**
5. The role/permission logic (roles seen: `owner`, `manager`, `editor`, `sales`). Note what each role can see and do, both server-side and client-side.
6. How the **"Private with Stella"** virtual collection works. It has `kind: "private_virtual"` and its membership appears to come from `settings.home.private_trip_slugs`, which the trip editor toggles with "Show in the home Private section". Confirm this.
7. Whether `request.items[].dayIndex` is 0-based or 1-based relative to `request.startDate`. Check the public site's "My trip" builder code.
8. How the homepage draft/publish works (`GET /homepage` returns `{home, how_steps, private_perks, draft:{…, publish:boolean}}`). Find out what `PUT /homepage` expects for "save draft" vs "publish".
9. How FAQ & static pages (Contact, Terms, Customer data, Cancellation policy) are fetched and saved (`GET /faqs` exists; `/pages` returns 404, so find the real one).
10. The translation-queue approve/save endpoint and what "I reviewed all seven languages" sends.

---

## 2. Data model reference (observed from the API)

Use these exact field names. `I18n` = an object keyed by locale code (`{en: "...", it: "..."}`), where `en` is the source.

### 2.1 Trip (`GET /trips` → array of trips; `GET /trips/:id` → detail)

- `GET /trips` returns **both trips and packages**: `kind ∈ {"trip","package"}`. The Trips page must filter `kind === "trip"`.
- Trip fields:
  - Identity: `id`, `slug`, `kind`, `collectionId`, `status ∈ {"draft","published"}`, `sort`, `featuredOrder`
  - Text: `title:I18n`, `summary:I18n|null`, `description:I18n|null`
  - Schedule: `daysLabel:I18n`, `runDays:number[]|null` (weekday numbers, e.g. `[0,3,5]`; **verify 0 = Sunday**), `onRequest:boolean`, `departureLabel:string|null`, `returnLabel`, `durationLabel:I18n`, `durationMinutes:number|null`, `daysCount:number`
  - Logistics: `transport:string|null` (free text today: "bus", "plane", "speed boat", "quad + 4x4"…)
  - Format: `format ∈ {"group","private","both"}` (observed `both`, `private`), `privateSurchargePct:number|null`, `privateOnRequest:boolean`
  - Flags: `flight`, `overnight`, `familyFriendly`, `minAge`
  - Notes: `notes:I18n[]`, `editorialNotes`
  - SEO: `seoTitle`, `seoDescription`
  - Timestamps: `createdAt`, `updatedAt`, `archivedAt`
- `GET /trips/:id` → `{ trip, prices[], itinerary[], items[], media[], drafts[] }`
  - `prices[]`: `{id, tripId, label:I18n|null, amountEur:"55.00", unit ∈ {"person","child","quad","buggy","car","boat","group","hour"}, minQty, maxQty, isPrimary:boolean, sort, validFrom, validTo}`
  - `itinerary[]`: `{id, tripId, timeLabel:string, text:I18n, sort}`
  - `items[]`: `{id, tripId, type ∈ {"include","exclude","optional","bring","highlight"}, text:I18n, extraPriceEur, sort}` (UI labels: Included / Not included / Optional / Bring / Highlight)
  - `media[]`: `{tripId, mediaId, role ∈ {"cover","gallery"}, sort}`

### 2.2 Package (`GET /packages`)

- Same shape as a trip, with `kind: "package"`. Observed `status` is `draft` for all of them.
- `GET /package-parts?id=:packageId` → `[{packageId, tripId, dayIndex, sort, primaryAmountEur}]`

### 2.3 Collection (`GET /collections`)

- Fields: `id`, `slug`, `kind ∈ {"normal","private_virtual","packages"}`, `name:I18n`, `shortName:I18n`, `headline:I18n`, `subline:I18n`, `perks:[{title:I18n, sub:I18n}]`, `color`, `coverMediaId`, `heroVideoId`, `sort`, `status`, `createdAt`, `updatedAt`, `archivedAt`
- `private_virtual` = "Private with Stella" (membership from `settings.home.private_trip_slugs`).
- `packages` = "All of Egypt" (holds packages).

### 2.4 Media (`GET /media?page=N`, 60 per page; `GET /media/:id`)

- List fields: `id`, `kind ∈ {"image","video"}`, `variants` (`{jpg, avif, webp}` for images; `{mp4_h, mp4_v, poster}` for videos), `width`, `height`, `durationS`, `alt:I18n`, `credit`, `license`, `rightsStatus ∈ {"owned","licensed","permission","unknown"}`, `status` (observed `ready`), `createdAt`
- Detail adds: `autoEnhance`, `focalX`, `focalY` ("0.500"), `trimStart`, `trimEnd`, `posterTime`, `where_used:{trips:[{id,title}], collections:[…], slides:[…]}`
- `alt.en` is effectively the media "name" in the UI. **Names are duplicated** across items (e.g. two "Dahab Day Trip"), so pickers must show thumbnails.

### 2.5 Hero slide (`GET /hero-slides`)

- Fields: `id`, `videoMediaId`, `imageMediaId`, `collectionId`, `kicker`, `headline`, `subline`, `ctaType`, `ctaTarget`, `ctaLabel:I18n`, `durationS`, `showOn ∈ {"all","mobile","desktop"}`, `startsAt`, `endsAt` (UTC), `sort`, `status ∈ {"draft","published"}`, `createdAt`, `updatedAt`, `archivedAt`
- `ctaType` options in the UI: Collection, Trip, Package, My trip, WhatsApp, Page.

### 2.6 Request (`GET /requests?status=…`, `GET /requests/:id`)

- List fields: `id`, `ref` ("STL-N9D0WSCMPQ"), `mode` (observed `multi`), `locale`, `startDate`, `adults`, `children`, `childAges`, `format`, `pickupArea`, `hotel`, `name`, `phone`, `email`, `notes`, `estimateEur`, `status`, `assignedTo`, `internalNote`, `createdAt`, `updatedAt`, `anonymizedAt`, `tripTitles` (⚠️ **returned empty `[]` in the list** even when the request has trips; see §9)
- `status ∈ {"new","contacted","confirmed","cancelled","spam"}`
- Detail adds `items:[{requestId, tripId, dayIndex, priceSnapshot:{amount, format, on_request, prices[], selected_price_id, private_surcharge_pct, hours}, title:I18n}]`
- Observed: the trips in the test request had `dayIndex` 1, 2, 3, 5. The current UI ignores it and shows one date for all trips. **The new UI must show each trip's own date.**

### 2.7 Other endpoints

| Endpoint                                                                                    | Returns                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /price-list`                                                                           | `[{id, title:I18n, collectionId, privateSurchargePct, format, kind, rows:[price]}]` (trips + packages)                                                                                                                                    |
| `GET /settings`                                                                             | `{contacts:{email, phone, whatsapp_primary, whatsapp_secondary}, address:I18n, legal_entity:I18n, social:[], pickup_areas:string[], request_rules:{max_adults, max_children, min_days_ahead}, i18n:{…}, home:{…}, …}`                     |
| `GET /homepage`                                                                             | `{home:{build_heading, build_text, contact_heading, contact_text, private_heading, private_text, private_trip_slugs[]}, how_steps:[{title, text}], private_perks:[{title, sub}], draft:{…same…, featured_trip_slugs[], publish:boolean}}` |
| `GET /i18n/settings`                                                                        | `{i18n:{core:[7 locales], auto:[10 extra locales], free_tier_only, indexable_auto, provider_by_locale, monthly_char_budget, auto_live_min_coverage}, i18n_runtime:{warning, coverage, supported, providers_available}, usage}`            |
| `GET /i18n/queue?locale=xx`                                                                 | `[{entity, id, field, source, value, state}]`                                                                                                                                                                                             |
| `GET /users`                                                                                | `[{id, email, name, role, totpEnabled, mfaRequired, disabledAt, lastLoginAt}]`                                                                                                                                                            |
| `GET /audit?page=N`                                                                         | `[{id, at, userId, userName, entityTitle, action, entity, entityId, before, after}]`                                                                                                                                                      |
| `GET /audit-actors`, `GET /me/sessions`, `GET /push/key`, `GET /faqs`, `GET /i18n/glossary` | —                                                                                                                                                                                                                                         |

Extra details:

- **i18n queue:** `entity ∈ {trip, trip_item, itinerary, trip_price, collection, hero_slide, media, settings, ui}`; `state ∈ {"machine","empty"}` (plus a reviewed state, to find); 748 items for `fr`.
- **Audit:** `action ∈ {update, publish, unpublish, restore, prices, reorder, duplicate}`; `entity ∈ {request, settings, collection, hero_slide, media, trip_prices, trip_order, trip, hero_order}`. `entityTitle` is often `null`, which is why the current UI shows "Item".

---

## 3. Shared components (build these first, then use them everywhere)

Put them in one folder (e.g. `admin/components/ui/`). Each component has one job and a consistent API.

### 3.1 `AppShell`

**Desktop (≥ 1024px):** fixed left sidebar, 240px.

- Sidebar top: logo, linking to `/` = Overview (new page, §5.1).
- Sidebar bottom: account menu (avatar initials + name + role → My account, language switcher, Sign out).
- The sidebar scrolls with the page or fits without its own scrollbar. **No inner scrollbar.**
- Nav groups, with small uppercase group labels:

| Group         | Pages                                |
| ------------- | ------------------------------------ |
| —             | Overview                             |
| **Sales**     | Requests (badge = count of `new`)    |
| **Catalog**   | Trips, Packages, Collections, Prices |
| **Website**   | Homepage, Hero, Media, Pages & FAQ   |
| **Languages** | Translations, Language settings      |
| **Admin**     | Settings, Team, Activity             |

**Tablet (640–1023px):** collapsible icon rail (64px) with tooltips.

**Mobile (< 640px):**

- Bottom nav: Overview, Requests (with badge), Trips, Media, More.
- "More" is a full page listing the remaining items **grouped like the sidebar**.
- Top bar: page title + account avatar.

**Rules:**

- Remove the `OWNER · OWNER` eyebrow above every page title.
- Remove the floating language `<select>` at the top-right. The language switcher lives in the account menu.
- The page `<title>` is `"{Page} · Stella Admin"`.

### 3.2 `PageHeader`

- Title (h1) + optional one-line description + right-aligned actions: one primary button max, others secondary or in a `⋯` menu.
- On mobile, the primary action becomes a sticky bottom-right button above the bottom nav.

### 3.3 `DataTable`

- Column definitions, sticky header, row click → navigate (whole row clickable, with a visible hover state), optional leading 40×40 thumbnail, optional drag handle column.
- Built-in states: loading skeleton (5 rows), empty state, filtered-empty state.
- Toolbar slot: search input (debounced 250ms, with a clear ✕), filter chips/selects, result count ("43 trips").
- Pagination: "1–60 of 61" + Prev / Next. Hidden when everything fits on one page.
- **Mobile:** rows become compact list items (thumbnail + title + one meta line + status badge), ~64px tall. **Never render the desktop card-with-buttons layout.**

### 3.4 `StatusBadge` + `StatusMenu`

- One status vocabulary for content (trips, packages, collections, hero, FAQ, pages):
  - `published` → **Published** (green)
  - `draft` → **Draft** (amber)
  - `archivedAt != null` → **Archived** (grey; hidden from lists by default)
- `StatusMenu` is one button that shows the current status and a dropdown with the valid transitions: Publish / Unpublish / Archive (Archive only where §9 adds it).
- Never show "Publish" on something already published. Never show "Off" or "Hide" as labels.
- Request statuses get their own colours: New (blue), Contacted (amber), Confirmed (green), Cancelled (grey), Spam (red).

### 3.5 `Toast`

- **One toast at a time**, bottom-right on desktop and bottom-centre above the nav on mobile. A new toast replaces the current one; **never stack**.
- Auto-dismiss after 5s (8s if it has Undo). Pause on hover.
- The text names the action: "Trip unpublished", "Order updated", "Prices saved", "Package duplicated", "Request marked as contacted". Never the generic "Changes saved".
- Undo lives **only** inside the toast. Remove the floating second Undo button.
- Undo must actually reverse the action, including Duplicate (§9).

### 3.6 `ConfirmDialog`

- Props: `title`, `body`, `confirmLabel`, `tone ∈ {"default","danger"}`, optional `details` (a small list), optional `requireText` (type-to-confirm).
- Focus lands on Cancel for danger dialogs. Esc = cancel. Enter = confirm only for non-danger.
- **Matrix (use these exact texts as the English source):**

| Action                                      | Title                             | Body                                                                                                               | Confirm button                         |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Unpublish trip/package/collection/hero/page | Unpublish "{name}"?               | It will disappear from the website until you publish it again.                                                     | Unpublish                              |
| Publish                                     | Publish "{name}"?                 | It will be visible on the website in all languages that are ready. (List missing languages if any.)                | Publish                                |
| Archive                                     | Archive "{name}"?                 | It will be removed from the website and from lists. You can restore it from Archived. (If media: list Where used.) | Archive (danger)                       |
| Discard unsaved changes                     | Discard unsaved changes?          | Changes in: {Basics, Prices…} will be lost.                                                                        | Discard (danger)                       |
| Restore revision                            | Restore this version from {date}? | Current values will be replaced. You can undo right after.                                                         | Restore                                |
| Request → Cancelled                         | Cancel request {ref}?             | The customer is **not** notified automatically.                                                                    | Mark as cancelled (danger)             |
| Request → Spam                              | Mark {ref} as spam?               | It will move to Spam and stop counting as new.                                                                     | Mark as spam (danger)                  |
| Bulk price change                           | Update {n} prices?                | Shows the before/after table again.                                                                                | Update {n} prices                      |
| Trim video                                  | Apply trim to "{name}"?           | The video will be re-processed. Takes ~1 min.                                                                      | Apply trim                             |
| Sign out everywhere                         | Sign out of all devices?          | You'll stay signed in here.                                                                                        | Sign out others                        |
| Erase customer data                         | Erase all data for {phone}?       | This cannot be undone. Requests will be anonymised. Messages already sent and backups are not affected.            | Erase (danger, `requireText: "ERASE"`) |
| Change own role / disable own account       | **Not allowed**                   | Disable the controls instead (§5.16).                                                                              | —                                      |

### 3.7 `EmptyState`

- Icon + title + one sentence + optional action.
- Distinct variants: first-use empty, filtered-empty ("No trips match "xyz"" + Clear filters), error ("Couldn't load. Retry").
- **"Nothing here yet" must not appear anywhere.**

### 3.8 `EditorLayout`: full-page editor (replaces all large modals)

Used for Trip, Package, Collection, Hero slide, Request detail (desktop split view, §5.2), Homepage, Settings, Media detail (§5.7).

**Header:**

- Back link (← Trips), title (= `title.en`, or "New trip"), StatusBadge.
- Actions: Preview (opens the public preview URL in a new tab), StatusMenu, `⋯` menu (Duplicate, Archive, View history).

**Left section nav (desktop):**

- Anchors to sections, scroll-spy highlight.
- Each section shows a dot when it has unsaved changes and a red dot when it has validation errors.
- On mobile it becomes a horizontal scrollable chip row under the header.

**Content:** sections stacked on one scrolling page, max width 760px, labels above inputs.

**Language bar (sticky under the header, ONE for the whole editor):**

- Chips: EN · IT · ES · FR · DE · RU · TR.
- The selected chip is clearly filled. Each chip has a status dot: green = all translatable fields reviewed, amber = some machine drafts, red = some empty. Tooltip: "FR: 3 missing, 5 AI drafts".
- Switching language switches **every** I18n field in the editor at once.
- In a non-EN locale each I18n field shows the English source as read-only grey text above the input, with a "Copy from English" icon button. Never write "English source" as a label.

**Save bar (sticky bottom):**

- Hidden when clean.
- When dirty: "Unsaved changes in Basics, Prices" + **Discard** + **Save** (primary).
- Save calls only the endpoints of the dirty sections, **sequentially, in section order**:
  - All succeed → one toast "Trip saved".
  - Some fail → keep failed sections dirty, show an inline error at the top of each failed section, toast "Some changes weren't saved".
- **One Save button for the whole editor.** Remove every per-section "Save changes" button.

**Unsaved guard:** route change, browser back, tab close (`beforeunload`) and closing the editor → `ConfirmDialog` "Discard unsaved changes?" listing the sections.

**Keyboard:** `Ctrl/Cmd+S` = Save; Esc does nothing in full-page editors.

**Review checkbox:** remove "I reviewed all seven languages" from each section. Replace it with a per-locale **"Mark {LANG} as reviewed"** button in the language bar's chip menu. Wire it to whatever the checkbox sent before (find in §1).

### 3.9 `I18nField`

- Single-line `input` for short text (title, name, short name, label, headline, button text, search title, time label).
- Auto-growing `textarea` (min 3 rows) for long text (summary, description, supporting text, answer, notes).
- Character counter only where a limit exists (SEO title 60, SEO description 160).

### 3.10 `MediaPicker` (replaces every media `<select>`)

- Modal grid of thumbnails (images: `variants.webp`; videos: `variants.poster` with a ▶ badge and duration).
- Search by `alt.en`, filter Image / Video, and an "Upload new" button inside the picker.
- Single- or multi-select mode. Selected items show a check.
- Used in: trip media (cover + gallery), collection cover/video, hero video/image, homepage if needed.
- In editors, selected media show as thumbnails with a role chip (Cover / Gallery), drag to reorder, and an ✕ to remove.

### 3.11 `SortableList`

- A drag handle (6-dot icon, 24px) on the left of each row + a `⋯` menu (Move up, Move down, Move to top, Remove).
- **No row numbers and no ↑ / ↓ / "Move to first" buttons on the rows.**
- Keyboard: focus the handle, Space to lift, arrows to move, Space to drop (`@dnd-kit` supports this).
- **Persistence is consistent:**
  - Inside an editor, order is part of the form → saved with Save.
  - In list pages (Trips, Hero, Collections), reorder saves immediately → toast "Order updated" with Undo, debounced so 5 quick moves = 1 request + 1 toast.

### 3.12 `ReauthDialog`

- Title "Enter your password to continue", one password field with a show/hide toggle, Confirm/Cancel buttons with a normal gap between them.
- Error text: "Wrong password." (Not "Email, password or code is incorrect.")
- If the user has 2FA, show a 6-digit code field too.
- Remove the stray "Two-step verification" label.

### 3.13 `FormField`

- Label above, optional hint below in muted text, error below in red.
- Every input has a real `<label for>`. Fixes the current raw labels like `address.en` / `min_days_ahead`.
- Validation messages are our own copy, not the browser's default bubble. Use `noValidate` + custom messages.

---

## 4. Global behaviour rules

1. **Lists are tables, editors are pages, small things are dialogs.**
   - Dialogs only for: confirm, reauth, invite teammate, FAQ item, add social link, media picker, bulk price change, create-new forms with ≤ 3 fields (then redirect to the full editor).
2. **Create flow:** "New trip" opens a small dialog: Title (EN), Collection, Page address (auto-generated from title as kebab-case ASCII; editable; shows the prefix `…/en/t/`). Create → navigate to `/trips/:id` in the editor. The button says **"Create trip"**, not "Save changes". Same pattern for package, collection and hero slide.
3. **Duplicate:** creates "{title} (copy)" with slug `{slug}-copy` (then `-copy-2`…) as **Draft**, then navigates to the copy's editor with toast "Duplicated. You're now editing the copy" + Undo (which archives/deletes the copy, §9). No modal-on-modal and no slug prompt.
4. **Save button state:** disabled when nothing changed. Never send no-op saves (they currently create empty audit rows like "€260.00 → €260.00").
5. **Sorting:** lists use the manual `sort` field where one exists, otherwise a stable order (alphabetical by `title.en`). **Never sort by `updatedAt` by default.** Today, Packages and Prices reorder themselves after each save.
6. **Copy style:**
   - Sentence case, short, verbs on buttons ("Create trip", "Send invite", "Update 7 prices").
   - Labels describe the field, not the section (e.g. "Headline" and "Supporting text", never the same label twice).
7. **Accessibility:** every interactive element is reachable by keyboard; visible focus ring only on `:focus-visible` (fix the permanent orange ring on the modal ✕); icon buttons have `aria-label`; colour is never the only signal.
8. **Responsive:** test at 390, 768, 1280 and 1536px widths. No horizontal scroll anywhere. Video previews are max 360px tall.
9. **Loading:** skeletons, not spinners, for lists and editors. Buttons show an inline spinner and are disabled while their request runs (prevents the double/quad requests seen on 2FA setup).
10. **Errors:**
    - API 4xx/5xx → inline message near the action + toast.
    - 401 → redirect to login, preserving the return URL.
    - 403 on a reauth-protected action → open `ReauthDialog`, then retry the action **once**.

---

## 5. Pages

Each page lists: **Route · Layout · Behaviour · Acceptance criteria (AC)**.

### 5.1 Overview (`/`), new page

**Layout:** 4 stat cards + 2 lists.

- **Stat cards:**
  - New requests (link → Requests filtered `new`)
  - Requests this week
  - Trips missing a price (no row with `isPrimary`, and not `onRequest`)
  - Content needing translation (count of queue items for core locales)
- **Lists:**
  - "Latest requests" (5 rows: name, trips count, first trip date, status)
  - "Needs attention": trips with no cover image, no primary price, draft packages, empty static pages (Terms/Contact/Cancellation), missing contact info in Settings (phone/email empty, no social links)

**AC**

- [ ] Every item links to the exact place to fix it.
- [ ] The logo in the sidebar goes here.

### 5.2 Requests (`/requests`, `/requests/:id`)

**Layout:**

- **Desktop:** inbox split view. List on the left (≈ 380px), detail on the right. Selecting a row updates the URL to `/requests/:id`.
- **Mobile:** list → full-page detail.

**List:**

- Tabs with counts: **New · Contacted · Confirmed · Cancelled · Spam · All**. The current UI has no Cancelled/Spam tabs; those requests vanish.
- Search matches name, phone, email, ref **and trip titles**.
- Filters: date range (created), trip date range, assigned to.
- Each row:
  - Line 1: name + StatusBadge
  - Line 2: `ref · {n} trips · first trip date`
  - Line 3: muted trip titles, truncated
  - Plus `estimateEur` and relative created time ("2h ago")
- Pluralise correctly: "1 guest", "2 guests", "2 adults · 1 child".

**Detail:**

1. **Header:** name, ref (copy button), StatusBadge, locale chip (EN), created time.
2. **Primary actions row:**
   - **WhatsApp** opens the existing `wa.me` prefilled link (keep the current message template, but list each trip **with its own date**). After it opens, show an inline prompt "Mark as contacted?" [Mark] [Not now].
   - **Call** (`tel:`) and **Email** (`mailto:`, if an email exists).
3. **Status:** a `StatusMenu` with transitions New → Contacted → Confirmed, plus "Cancel request…" and "Mark as spam…" (both via `ConfirmDialog`, §3.6). Allow moving back to New/Contacted from the menu. The current state is visually selected.
4. **Trip plan:** a table of `items` sorted by `dayIndex`, with columns Date (computed from `startDate` + `dayIndex` per §1.7, formatted "Sun 16 Nov"), Trip (link to the trip editor), Format, Price snapshot ("€90 / person" or "On request").
   - Total row = `estimateEur`, labelled "Estimate".
   - If two items share a date, show a ⚠ "Same day" warning.
5. **Customer:** phone, email, hotel, pickup area, adults/children (+ `childAges`), stay dates parsed from notes if present, notes (full text).
6. **Internal:**
   - "Assigned to" select (users).
   - **Notes timeline:** each note has author + time. If the backend only supports a single `internalNote` string, keep one textarea but show "Last edited by X at Y" from audit, and add a backend item (§9) for a notes array.
7. **History:** human-readable audit entries for this request ("Owner changed status New → Contacted · 20:33"; "Owner assigned to Owner"). Use the audit `before`/`after`. Never show "Restore" on request status history.

**Header actions:**

- **"Export CSV"**: reauth flow; the button lives in the `⋯` menu, not next to search.
- **Remove** the "Customer data" button from this page (moved to Settings → Privacy, §5.15).

**AC**

- [ ] The test request STL-N9D0WSCMPQ shows 4 trips on 4 different dates.
- [ ] Changing status needs 1 click for forward moves, and a confirm for cancel/spam. The badge, the tab counts and the sidebar badge all update without a reload.
- [ ] Search "Ras Mohammed" finds the request.

### 5.3 Trips (`/trips`) — DataTable

**Data:** `GET /trips` filtered `kind === "trip"`.

**Columns:**

1. Thumbnail (cover media)
2. Title (+ muted slug)
3. Collection
4. Format ("Group", "Private", "Group + private")
5. Primary price ("€55 / person" or "On request")
6. Translations (mini progress bar "5/7")
7. Status
8. Updated (relative)
9. `⋯` menu

**Toolbar:**

- Search (title/slug).
- Filters: Collection (multi; excludes the virtual Private collection, but adds a filter chip "On homepage Private section"), Status, Format.
- Group-by-collection toggle (default **on**). Headings show "Pharaohs & Temples · 9". **Hide headings of groups with 0 rows**, including during search.

**Reorder:** drag handle visible only when grouped and not searching. Reorder within a collection → `POST /trips/reorder`, debounced.

**Row `⋯`:** Open, Preview, Duplicate, Unpublish/Publish, Archive (§9).

**Primary action:** "New trip" → create dialog (§4.2).

**AC**

- [ ] No card layout, no ↑ / ↓ / "Move to first" buttons, no row numbers.
- [ ] Packages don't appear here.
- [ ] No empty "Private with Stella" heading.
- [ ] Search "xyz" shows the filtered-empty state with Clear.

### 5.4 Trip editor (`/trips/:id`) — EditorLayout

Sections, in order (section names in bold are the nav labels):

**1. Basics**

- Title (I18n, single line), Summary (I18n, textarea), Description (I18n, textarea).
- Collection (select of `normal` collections only).
- **Page address** (`slug`, with prefix; editable with a warning "Changing this breaks old links").

**2. Format & audience** (replaces the 5 overlapping fields)

- **Format:** segmented control Group / Private / Group + private → `format` `group | private | both`.
- **Private supplement %:** shown only when format = `both`.
- `privateOnRequest`: show as a checkbox "Private on request (price confirmed manually)" only when format ≠ `group`. ⚠️ Verify the semantics of `privateOnRequest` vs `format` in code and write them down in `REBUILD_NOTES.md`. If they duplicate each other, keep one control and derive the other on save.
- **"Show in homepage Private section":** a toggle that adds/removes this trip's slug in the homepage `private_trip_slugs` (via whatever endpoint the current checkbox uses). Helper text: "Appears under 'Private with Stella' on the homepage."
- Family friendly (toggle), Minimum age (number, optional).
- Featured position: rename to **"Featured order on homepage (optional)"**, with a helper.

**3. Schedule**

- **Runs on:** weekday chips Sun–Sat → `runDays` (verify index base), plus "Every day" and "On request" chips. On request → `onRequest: true` and disables the chips.
- **Remove the free-text "Departure days" field from the UI.** Generate `daysLabel` per locale from `runDays` on save (e.g. EN "Sunday · Wednesday · Friday", "Every day"), using `Intl.DateTimeFormat(locale, {weekday:'long'})`. ⚠️ Check whether the public site reads `daysLabel` or `runDays`. If the site depends on custom labels, keep `daysLabel` as an advanced "Custom label (optional)" collapsed field.
- **Departure time / Return time:** time inputs (`departureLabel` / `returnLabel` are strings today, like "04:30–06:00", so support "HH:MM" or "HH:MM–HH:MM").
- **Duration:**
  - Number of days (`daysCount`).
  - If 1 day: hours + minutes inputs → `durationMinutes`.
  - `durationLabel` is auto-generated per locale ("~12 h", "2 days · 1 night"), with the same optional custom-label override as above.
- **Transport:** a select with the existing distinct values normalised (Bus, Minibus, Private car, Jeep, Plane, Boat, Yacht, Speed boat, Ferry + bus, Quad, Buggy, Mixed, Transfer) + "Other…" free text. Store as today (string).
- Includes flight / Overnight: toggles.

**4. Prices**

- A table, not cards. Columns: Label (I18n, optional, placeholder "Adult"), Amount € (number input, step 0.01; plus a **"On request"** toggle that sets amount to null and shows an "On request" pill), Per (unit select: person / child / quad / buggy / car / boat / group / hour), Min–Max qty, Valid from–to (date pickers, optional, collapsed under "Seasonal"), Main (radio, **one** across the table, → `isPrimary`), drag handle, ✕.
- "+ Add price row".
- Keep amounts as 2-decimal strings. **Remove the −€5 / +€5 buttons.**
- Price preview line: "Shown on site as: from €260 / person".

**5. Day plan:** a `SortableList` of `{timeLabel, text:I18n}`. Time input + text. "+ Add step".

**6. What's included** (rename from "Included & essentials")

- Four sub-lists with their own headers and add buttons: **Included**, **Not included**, **Optional extras** (with price € field), **What to bring**, plus **Highlights**.
- Map to `items[].type` (`include`, `exclude`, `optional`, `bring`, `highlight`). No per-row type dropdown.

**7. Media**

- Cover (single, `MediaPicker`, required for publish) + Gallery (multi, sortable).
- ⚠️ **Bug to verify:** the current select showed "Romantic Dinner Cruise" for Luxor's media while the API returns Luxor media. The new picker must render from `mediaId`, never from a defaulted `<select>`.

**8. Search appearance**

- SEO title (I18n, counter 60), SEO description (I18n, counter 160).
- A Google-style preview snippet using the current locale.
- Fallback hint: "If empty, the trip title/summary is used" (verify).

**9. History**

- A list of audit/revision entries with a human diff: "Price €40 → €35", "Status Draft → Published", "Title (FR) changed".
- **Restore** on each entry (with `ConfirmDialog`). Hide no-op entries.

**AC**

- [ ] One Save for everything.
- [ ] Editing FR in Basics then switching section keeps FR.
- [ ] Leaving with unsaved Prices + SEO lists both sections in the discard dialog.
- [ ] The trip editor never opens as a modal.
- [ ] The Format section has no contradictory controls.
- [ ] Media shows thumbnails.

### 5.5 Packages (`/packages`, `/packages/:id`)

**List:** DataTable. Columns: Title, Days (`daysCount`), Trips (count from package-parts), Price (sum of `primaryAmountEur`, labelled "From €340" or "On request" if `onRequest`), Status, Updated. Manual order via `sort`.

**Editor** (EditorLayout). Sections:

1. **Basics:** title, summary, description, slug.
2. **Days & trips:** the core section.
   - A day-by-day builder: Day 1 … Day N (N = `daysCount`, with +/− buttons).
   - Each day lists trips (pick from the trips table via a searchable dialog showing thumbnail + price); drag trips between days → `package-parts` (`dayIndex`, `sort`).
   - Show each trip's primary price and a running total.
3. **Price:**
   - A toggle: **Use sum of trips** (shows the computed sum) / **On request** / **Custom price** (if the backend supports it; verify).
   - ⚠️ **Fix the inconsistency:** today Prices shows "On request" while the public preview shows "from €340". The admin must show exactly what the site will show; read the public site's logic to match.
4. **Media**, **Search appearance**, **History**: same as trips.

**Do NOT copy trip-only fields** (Tour format, Departure days, Transport, Private supplement) into packages, unless §1 discovery shows the public site uses them for packages.

**AC**

- [ ] Saving doesn't move the package in the list.
- [ ] Duplicate produces "(copy)".
- [ ] Archive exists (§9).

### 5.6 Prices (`/prices`)

**DataTable** from `GET /price-list`, in a stable order: grouped by collection, then by trip `sort` (same as Trips).

**Columns:** Trip/Package, Kind badge (Trip / Package), Group/main price, Private price (or "+{pct}%" / "On request"), Per, Valid dates (if any).

**Inline edit:**

- Click an amount → it becomes an input. Enter = save that row (`PUT /trips/:id/prices` with the full rows array for that trip), Esc = cancel.
- Toast "Price updated" + Undo.
- Clicking the title opens the trip editor at `#prices`.

**"Change prices together"** (dialog):

- **Apply to:** "All trips" or a specific collection (rename "None" → "All trips"; put "All trips" first and make it explicit).
- **Change by:** segmented control `%` / `€`. The input label follows the choice: "Percent (%)" or "Amount (€)". **Remove the broken label** that currently shows the error string "Couldn't complete this. Check the fields and try again."
- Increase / Decrease toggle (or allow negative numbers, with helper text).
- **Rounding:** select (none / nearest €1 / nearest €5). Show the default the backend uses (observed: 5% of €25 → €26). Verify the rounding in code and expose it if the API supports it; otherwise state it in the helper text.
- **Preview** shows a table: Trip · Before · After · Δ, plus a count. The confirm button says **"Update {n} prices"** and opens the `ConfirmDialog`.

**AC**

- [ ] The order is identical on every visit.
- [ ] No broken labels.
- [ ] The % mode never shows a € label.

### 5.7 Media (`/media`)

**Header:** primary "Upload" button + full-page drag-and-drop zone (overlay "Drop to upload"). Show upload progress per file; new items appear at the top with status "Processing" until `ready`.

**Toolbar:** search by name (`alt.en`), filters **Type** (All / Images / Videos), **Rights** (All / Owned / Licensed / Permission / Unknown), **Usage** (All / Used / Unused), Collection. Count "61 items".

**Grid:** fixed-ratio tiles (4:3, `object-fit: cover`), name below in one line (truncated with tooltip), small chips under the name (rights). Videos: ▶ + duration overlay. Badges never sit on the same line as the name.

**Detail:** a full page `/media/:id`, or a large side drawer, **not** the current modal. Two columns on desktop:

_Left: preview, max 480px tall._

- **Image:** focal point editor. Click/drag a crosshair on the image; X/Y shown as read-only %. ⚠️ **It must NOT auto-save on click.** It changes form state and is saved with Save. Today clicking auto-saves (`PATCH /media/:id`) **and the focal tool disappears**; fix both.
- **Video:** player + **trim timeline** with two handles and a poster-frame marker; numeric inputs stay as a secondary "Precise" toggle. "Apply trim" → `ConfirmDialog` → `POST /media/:id/trim` → toast "Trim applied, processing…" → audit entry. Keep the current behaviour that trim doesn't run on Save, but require the confirm.

_Right:_

- **Description** (I18n alt; label "Image description" for images and "Video description" for videos).
- Credit, Rights (select), License/permission record (textarea).
- "Warm enhancement" toggle with a before/after hover preview (if the variants allow; otherwise just a helper text).
- **Where used:** a list of **links** with type labels: "Trip · Dahab Day Trip", "Collection · Private with Stella", "Hero slide · Private with Stella". ⚠️ Hero slides currently render as raw UUIDs; resolve the name via `collectionId` → collection name, or the headline.
- **History.**
- **Archive** in the `⋯` menu, with the confirm listing Where used.

**AC**

- [ ] Clicking the image never triggers a network request.
- [ ] The focal tool stays visible after interaction.
- [ ] A vertical video doesn't push the form below the fold.
- [ ] No UUIDs visible.

### 5.8 Hero (`/hero`, `/hero/:id`)

**List:** DataTable with a thumbnail (poster), Name (= headline or linked collection name), Button target, Duration ("6s"), Shows on ("Mobile & desktop" / "Mobile only" / "Desktop only"), Schedule ("Always" or "12 Dec → 20 Dec"), Status. Manual order with drag.

**Header actions:** "New slide", **"Preview"** (opens a preview dialog with a **Mobile / Desktop** toggle, autoplaying the published slides in order).

**Editor sections:**

1. **Media:** Video (`MediaPicker`, videos) + fallback image (`MediaPicker`, images).
2. **Text:** Short introduction (`kicker`), Headline, Supporting text (all I18n), Button text (I18n).
3. **Button:** "Button goes to" select → the second field adapts:
   - Collection / Trip / Package / Page → searchable select of that type.
   - My trip → no field.
   - WhatsApp → no field (helper: "Opens WhatsApp with the business number from Settings").
4. **Display:** Duration (3–20s slider + number), Shows on (segmented control), Schedule: starts/ends as **date-time pickers in Cairo time** (convert to UTC for the API), helper "Leave empty to always show".
5. **History.**

**AC**

- [ ] Never shows "Publish" and "Off" together.
- [ ] Never shows "(UTC)".
- [ ] Destination only appears when relevant.

### 5.9 Collections (`/collections`, `/collections/:id`)

**List:** DataTable with a thumbnail (cover), Name, Type (Normal / Packages / **Virtual: managed from Homepage**), Trips count, Status. Manual order.

**Editor:**

1. **Basics:** Name, Short name, Headline, Supporting text (I18n), Colour (colour picker + hex).
2. **Media:** cover image + video via `MediaPicker`.
3. **Perks:** sortable list of `{title, sub}` I18n. Rename the section from "Included & essentials" to **"Perks"**.
4. **Trips in this collection:** a read-only list with links and "Change a trip's collection from the trip editor". If the backend supports bulk assignment, allow adding/removing; otherwise read-only.
   - For `private_virtual`: show the trips from `private_trip_slugs` and link to Homepage → Private section.
5. **History.**

Status via `StatusMenu` (Publish/Unpublish; Archive per §9). **Remove** the "Publish" button that shows on already-published rows.

### 5.10 Homepage (`/homepage`) — EditorLayout

Sections (rename to match what the visitor sees, verify the order against the public homepage):

1. **"Private with Stella" banner:** Headline (`home.private_heading`), Supporting text (`home.private_text`), Perks (`private_perks[]`: Title + Supporting text, sortable), Trips shown (sortable picker of trips → `private_trip_slugs`).
2. **"Build your own trip" banner:** Headline (`build_heading`), Supporting text (`build_text`).
3. **"How it works" steps:** `how_steps[]` (Title + Text), sortable, max 4. ⚠️ **Never call this "Day plan".**
4. **"Not sure what to pick?" contact banner:** Headline (`contact_heading`), Supporting text (`contact_text`).
5. **Featured trips:** `draft.featured_trip_slugs` (sortable picker), if used by the site.

**Draft/publish:**

- The API has `draft` + `publish`. The save bar has **Save draft** and **Publish changes**; the header shows "Draft differs from live" when they differ.
- A **Preview** button opens the public homepage preview with the draft (find the preview-token mechanism used for trips in §1).

**AC**

- [ ] No two fields share a label.
- [ ] Each section header matches the public homepage wording.
- [ ] The language bar is shared across the page.

### 5.11 Pages & FAQ (`/pages`, `/pages/faq`, `/pages/:slug`)

**Index:** a table of pages with status and last updated:

- **FAQ** (count of questions)
- Contact, Terms, **Privacy policy** (rename from "Customer data"), Cancellation policy
- Empty pages show a red "Empty" chip.

**Static page editor** (EditorLayout):

- Page title (I18n) + **Blocks** (`SortableList`). Each block = Heading (I18n, optional) + Text (I18n, rich-ish: paragraphs + bullet lists if the site renders markdown; verify; else plain).
- Remove the "Type" select with a single option, and the duplicate Title + Heading pair. Map to whatever fields the API uses; if a block has both `title` and `heading`, find out which one the site renders and expose only that one.
- StatusMenu instead of the "Publish" checkbox.

**FAQ editor:** a list of Q&A rows (sortable; position = order, **remove the numeric "Position" field**). Click a row to edit it in a dialog (Question I18n, Answer I18n, Published toggle). "Add question".

**Unsaved guard:** switching between pages with unsaved changes → discard dialog. Today block additions are lost silently.

**AC**

- [ ] The tab/page called "FAQ & pages" no longer exists as a sub-item.
- [ ] No content is lost without a prompt.

### 5.12 Translations (`/translations`, replaces `/queue`)

**Header:** language selector with **names**, not codes ("French", "Italian"…) and remaining counts ("French · 748 to review"). Default = the locale with the most pending items, or the last used (remember it in localStorage).

**Filters:**

- Content type: Trips (`trip`, `trip_item`, `itinerary`, `trip_price` grouped), Collections, Hero, Media, Settings, Website text (`ui`).
- State: AI draft / Missing / Reviewed.
- **Hide items where `source` is only digits/times/punctuation** (e.g. "04:00", "00:30–01:00") by default, via a toggle "Show times & numbers".

**Table columns:** Where (e.g. "Trip · Luxor by Plane · Title", made human-readable from `entity` + `field`, with a link to the item), English, Translation (inline editable textarea), State, ✓ button.

- Keyboard: Ctrl+Enter = approve & next.
- Bulk select → "Approve selected" (confirm with count).
- Pagination as in the DataTable.

**AC**

- [ ] Every row says exactly which item and field it belongs to.
- [ ] Approving doesn't need a dialog.

### 5.13 Language settings (`/settings/languages`)

**Core languages (7):** a read-only list with coverage % per language.

**Extra languages:** a checklist of the available auto languages (Polish, Czech, Slovak, Ukrainian, Romanian, Hungarian, Dutch, Portuguese, Arabic, Chinese) with an on/off toggle each. **No duplicates possible.** Today it's 10 dropdowns and Add creates a duplicate "Polish".

**Machine translation:**

- If `providers_available === false`, show a single info callout "Automatic translation isn't set up" and **hide** budget/free-tier/indexing controls (or disable them with an explanation).
- When it is available, show the monthly budget, usage this month (`usage.characters` / budget, as a progress bar), "Free tiers only", "Allow search engines to index auto-translated pages".

**Glossary** (`/i18n/glossary`): an editable list of protected terms, if there's a write endpoint.

### 5.14 Settings (`/settings`) — EditorLayout with sections, one Save

1. **Contact:**
   - WhatsApp (main) = `contacts.whatsapp_primary`.
   - WhatsApp (second line, optional) = `whatsapp_secondary`, with a helper explaining where each is used (verify on the public site).
   - Phone, Email.
   - Show a warning chip when phone/email are empty.
2. **Business details:** Office address (I18n), Opening hours (I18n), Legal company name (I18n).
3. **Booking rules:**
   - Minimum notice (days): helper "0 = same-day requests allowed".
   - Max adults, Max children.
   - Pickup areas: a sortable chip list with add/remove (stored as `pickup_areas:string[]`).
4. **Social links:** a list of {Platform select (Instagram, Facebook, TikTok, YouTube, TripAdvisor, Website), URL}, validated as URLs.
5. **Privacy:**
   - Moved here from Requests. Title "Customer data requests".
   - Phone input → **Export customer data** (reauth) / **Erase customer data** (danger, `requireText`).
   - Both disabled until a valid phone is entered.
   - Show which requests match before erasing ("3 requests found").

**AC**

- [ ] Every field has a proper label (no `address.en`, `min_days_ahead`).
- [ ] One Save.

### 5.15 Team (`/team`)

**Table:** Name, Email, Role, 2-step (✓/—), Last login (relative), Status (Active/Disabled).

**Invite teammate** dialog:

- Name, Email, Role.
- **The default role is the lowest privilege (`sales` or `editor`; check §1.5), never `owner`.**
- Each role option has a one-line description (write them from the permission matrix found in §1.5).
- The button says **"Send invite"**, and the success toast says "Invite sent to {email}".

**Member page** (`/team/:id`):

- Name, Role, Require 2-step, Disable account, Active sessions (device/browser if available + time + "This device" label + per-session Sign out), Sign out everywhere.
- **On your own account:** Role and Disable are read-only with the helper "You can't change your own role or disable yourself."
- **Last owner:** a server-side check too (§9).

### 5.16 Activity (`/activity`)

**Filters:** Person, Type (entity, with human labels), Date **From / To** (rename from "Valid from / Valid until").

**Row:** time · person · sentence, e.g. "Owner unpublished trip **Cairo by Bus — One Day**", "Owner changed price of **Tiran Island by Boat** €40 → €35", "Owner reordered trips".

- Entity names come from `entityTitle`, falling back to a lookup by `entityId`. **Never print "Item" or "None".** System actions show as "System".
- Each row links to the entity.
- Consecutive reorder entries by the same person within 2 min collapse into one ("reordered trips 5×").

### 5.17 My account (`/account`)

- **Profile:** name, email (read-only), role.
- **Password:** Current password, New password (min 12; show the rule), Confirm new password, show/hide toggles, "Update password".
- **Two-step verification:** status + **"Set up two-step verification"** (rename from "Set up your account").
  - Flow: reauth → QR + secret → enter 6-digit code → backup codes.
  - Disable the button while the request runs. Today one click sent **four** `POST /auth/2fa/setup` (all 403).
- **Sessions:** the same component as Team, with "This device" marked.
- **Request notifications:** if `push/key` is available, show a "Turn on browser notifications for new requests" button; otherwise hide the section or explain "Not available on this server".

---

## 6. Copy changes (old → new)

| Where             | Old                                                                         | New                                                 |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| All pages         | `OWNER · OWNER` eyebrow                                                     | _(remove)_                                          |
| Empty states      | Nothing here yet                                                            | Context-specific (§3.7)                             |
| Toasts            | Changes saved                                                               | Action-specific (§3.5)                              |
| Confirm dialogs   | Confirm / Confirm / Cancel                                                  | §3.6 matrix                                         |
| Modal titles      | Trips / Packages / Add / Team / Requests / Media                            | Edit trip / New package / Invite teammate / {name}… |
| Create buttons    | Save changes                                                                | Create trip / Create package / Send invite          |
| Trip status       | Hidden                                                                      | Draft                                               |
| Hero              | Off                                                                         | Unpublish (menu)                                    |
| Homepage          | Private · EN (×2), My trip · EN (×2), Contact · EN (×2)                     | Headline / Supporting text                          |
| Homepage          | Day plan                                                                    | How it works                                        |
| Collection editor | Included & essentials                                                       | Perks                                               |
| Trip editor       | Included & essentials                                                       | What's included                                     |
| Pages             | FAQ & pages (tab) / Customer data                                           | FAQ / Privacy policy                                |
| Activity          | Valid from / Valid until                                                    | From / To                                           |
| Activity          | Item / None                                                                 | Real names / System                                 |
| Prices bulk       | Couldn't complete this… (as a label)                                        | Change by                                           |
| Prices bulk       | None (collection)                                                           | All trips                                           |
| Media             | Image description (on videos)                                               | Video description                                   |
| Media             | Tap the photo to set its focal point X                                      | Focal point (shown as %)                            |
| Account           | Set up your account                                                         | Set up two-step verification                        |
| Reauth            | Two-step verification (stray label) / Email, password or code is incorrect. | Enter your password to continue / Wrong password.   |
| Requests          | 1 · Guests                                                                  | 1 guest                                             |
| Requests          | `· €90.00 · Person`                                                         | €90 / person                                        |
| Translations      | it / es / fr                                                                | Italian / Spanish / French                          |
| Languages         | Monthly character budget (when not configured)                              | _(hidden)_                                          |
| Sidebar           | Translation review                                                          | Translations                                        |
| Sidebar           | Hero videos                                                                 | Hero                                                |
| Sidebar           | FAQ & pages                                                                 | Pages & FAQ                                         |
| Sidebar           | Languages                                                                   | Language settings                                   |

---

## 7. Bugs that must be fixed (regardless of redesign)

1. **Focal point** auto-saves on click and then the focal tool disappears (Media detail).
2. **Bulk price dialog** uses an error string as a field label; the % mode shows a "€" label; "None" silently means all trips.
3. **Undo after Duplicate** doesn't remove the copy.
4. **2FA setup** fires 4× `POST /auth/2fa/setup` per click (all 403) → add an in-flight guard + reauth first.
5. **Trip media select** shows the wrong media name (first option) for Luxor; render from `mediaId`.
6. **Where used** shows a raw hero-slide UUID.
7. **Toasts stack** and cover the page controls.
8. **Requests list** `tripTitles` is empty (`[]`) though the request has 4 items → the list can't show trips; fix the API (§9) or fetch the items.
9. **Request trip dates:** all items show the request `startDate`; use `dayIndex`.
10. **Cancelled / Spam requests** have no tab and vanish from view except under All.
11. **Unsaved changes lost silently** when switching page tabs in Pages & FAQ, and when saving one section of the trip editor.
12. **No-op saves** create audit rows ("€260.00 → €260.00").
13. **Packages and Prices order** changes after every save (sorted by `updatedAt`).
14. **Duplicate-language rows** possible in Languages.
15. **Reauth** returns 422 with the message "Email, password or code is incorrect." even though only a password is asked for. Verify the endpoint works with a correct password and that the message matches the fields shown.
16. **Preview banner** on the public site ("Draft preview — booking is disabled") is clipped at the left edge. _This is the only public-site fix allowed: CSS only._
17. **Next.js dev indicator** ("N" bubble) overlaps the mobile bottom nav. Dev-only, but make sure the bottom nav has safe-area padding and that nothing important sits in the bottom-left 56px.

---

## 8. Data cleanup

- During the audit a test duplicate package was created: **"Family Days"** with slug **`family-days-ui-test`** (status draft). After §9's archive/delete exists, archive it (or delete via a migration script that targets only that slug). Do not touch the original "Family Days".
- The test request **STL-N9D0WSCMPQ** (status contacted, internal note "UI test note") is test data and can be kept for development.

---

## 9. Backend changes (minimal, additive)

Check whether each exists before adding. Use the same auth, audit and revision patterns as the existing endpoints.

1. **Archive/restore** for packages, collections, hero slides, FAQ items (`POST /{entity}/:id/archive`, `POST /{entity}/:id/unarchive`), setting `archivedAt`. List endpoints exclude archived items by default and accept `?archived=1`.
2. **Duplicate** (trip/package): the title gets the suffix " (copy)" in every locale, the slug gets `-copy[-n]`, status is `draft`, and the response returns the new id. The Undo of a duplicate = archive the copy.
3. **Requests list:** return `tripTitles` (or `items` with `title` + `dayIndex`) in `GET /requests`. Support `q` search across trip titles. Add counts per status (`GET /requests/counts`).
4. **Audit:** always fill `entityTitle`. Skip writing an audit row when `before` equals `after`. Provide `GET /audit?entity=…&entityId=…` for per-item history if `/revisions?entity=&id=` doesn't already cover it (it returned `[]` for a trip that had history in the UI; check what the UI history actually uses).
5. **Hero slide name** for Where used: include `collection.name` or `headline` in `media.where_used.slides[]`.
6. **Users:** reject changing your own role, disabling yourself, and demoting/disabling the last owner (HTTP 409 with a clear message).
7. **Internal notes** (optional, if time): a `request_notes` table `{id, requestId, userId, text, createdAt}` + `GET/POST /requests/:id/notes`. Keep `internalNote` for backward compatibility.
8. **Sort stability:** `GET /packages` and `GET /price-list` order by `sort`, then `title.en`.
9. **2FA setup:** idempotent per session; return the existing pending secret on repeat calls.

---

## 10. Out of scope (don't do)

- Redesigning the public website.
- Changing pricing logic, the booking flow or the email/WhatsApp templates (except listing per-trip dates in the admin WhatsApp prefill).
- Adding new locales to the admin UI (Arabic for admin is a separate decision; just make sure the layout supports RTL later by using logical CSS properties `margin-inline-start` etc. in new code).
- Payment features.

---

## 11. QA checklist (run before calling each milestone done)

- [ ] Every button on every page clicked at 1536px and 390px. No dead buttons and no `window.confirm`.
- [ ] Keyboard-only pass: Tab through each page, open/close dialogs, reorder a list with the keyboard.
- [ ] Switch the admin language to IT and RU: no missing keys (no raw keys like `address.en`) and no layout breaks with long strings.
- [ ] Unsaved guard tested on: each editor, Pages & FAQ, Settings, Homepage, browser back, tab close.
- [ ] Undo tested for: unpublish, reorder, price change, duplicate.
- [ ] Network tab: no duplicate requests per click, no no-op PATCH/PUT, no 4xx on normal flows.
- [ ] Dates in Cairo time everywhere, including Activity, History, Hero schedule and Requests.
- [ ] Test request STL-N9D0WSCMPQ: 4 trips with 4 dates; search by trip name works; status changes reflect in the tabs and the sidebar badge.
- [ ] Lighthouse accessibility ≥ 90 on Requests, Trips, Trip editor and Media.
- [ ] `REBUILD_NOTES.md` updated with every discovery answer and every deviation from this spec.

---

## 12. Milestones (commit after each; report what changed and what's left)

1. **Foundation:** discovery notes; AppShell; PageHeader; DataTable; StatusBadge/Menu; Toast; ConfirmDialog; EmptyState; FormField; I18nField; ReauthDialog; remove `window.confirm`.
2. **Requests:** inbox + detail (needs backend §9.3).
3. **Trips list + Trip editor:** EditorLayout, language bar, Save bar, MediaPicker, SortableList.
4. **Packages + Collections + Prices:** + backend §9.1, §9.2, §9.8.
5. **Media + Hero.**
6. **Homepage + Pages & FAQ.**
7. **Translations + Language settings.**
8. **Settings + Team + Activity + My account + Overview:** + backend §9.4–9.6, §9.9.
9. **QA pass** (§11) and data cleanup (§8).
