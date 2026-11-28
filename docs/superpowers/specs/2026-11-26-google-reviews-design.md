# Google reviews on the website — design

Status: draft for owner approval · 2026-11-26

## 1. Intent

The owner wants the company's real Google reviews on the website, so visitors
deciding whether to book trust Stella. The Google listing is
"Stella sharm tours by heroes travel", 152 Malek El Bahrain Street, Old Market
(same address as `settings.address`). At capture time it showed **5.0 from 499
reviews**.

The owner chose the free route: no Google Places API, no billing account and no
third-party widget. Reviews are copied once from the public listing, imported,
and curated by staff in the admin. A "Leave a review" button sends guests to
Google to write new ones.

## 2. Goals, non-goals, anti-goals

Goals

- Import the captured reviews (`data/google-reviews.json`, 496 reviews, 426
  with text) into the existing `reviews` table, all **hidden** by default.
- Admin: list, filter (rating, language, has text), publish/hide, feature,
  reorder, and update the overall rating + review count.
- Website: a reviews section on home and a compact strip on trip pages, each
  with the overall rating, the review count, a link to the Google listing and a
  "Leave a review on Google" button.
- Re-import later captures without duplicates (match on `externalId`).

Non-goals

- Live sync with Google, the Places API or the Business Profile API.
- Showing Google's owner replies.
- Matching reviews to specific trips automatically.

Anti-goals (fail even if it "works")

- Any edited, shortened, merged or invented review text, author or rating.
- Translating a review and showing it as the reviewer's own words.
- A rating or count on the site that does not come from the database.
- Presenting a curated selection as "all reviews": the overall rating and count
  always show next to it, with the link to Google.
- Loading Google scripts, fonts or iframes (CSP and privacy plan).

## 3. Constraints

- AGENTS.md: never invent content; only real reviews, each with a link to the
  source (`reviews.source_url` is `not null`).
- Seven-language rule: every new UI string (section title, "Leave a review on
  Google", "Read all reviews on Google", "Translated"/"Original" labels if ever
  added, rating aria-labels, admin labels) ships in EN/IT/ES/FR/DE/RU/TR.
  **Review text is a third-party quote, not our content**: it is stored and shown
  in its original language only, so the seven-language rule does not apply to
  it. Record this in `docs/DECISIONS.md`.
- Mobile first 390×844, WCAG 2.2 AA (stars need a text alternative such as
  "5 out of 5"), logical CSS properties for RTL.
- Security plan: no new public write endpoint; admin endpoints use the existing
  `auth.guard('content')` and audit log.

## 4. Data

Source file `data/google-reviews.json`:

- `meta`: place, `placeCid`, `mapsUrl`, `capturedAt`, `ratingAtCapture`,
  `reviewCountAtCapture`, notes.
- `reviews[]`: `externalId` (Google review id), `author`, `rating` 1–5,
  `visitMonth` (YYYY-MM, estimated ±1 month from Google's relative date),
  `edited`, `text` (verbatim, original language, may be empty), `notEnglish`,
  `ownerReplied`.

Rating mix at capture: 487 × 5★, 3 × 4★, 1 × 3★, 3 × 2★, 2 × 1★.
Dates span 2025-12 → 2026-11.

Schema change to the existing `reviews` table (new migration, never edit an
applied one):

| column | type | note |
| --- | --- | --- |
| `external_id` | text, unique where not null | Google review id; import key |
| `lang` | text null | BCP-47 of the original text; set at import (detector) or by staff |
| `featured` | boolean default false | shown first / on home |
| `sort` | int default 0 | manual order among featured |
| `captured_at` | timestamptz | when the text was copied |

`text` stays `localized` jsonb but holds **one** key: the original language
(`{ "<lang>": "…" }`, or `{ "und": "…" }` if unknown). `visit_month` stores the
first day of `visitMonth`. `source = 'google'`, `source_url = meta.listingUrl`.

Settings: new key `reviews` = `{ rating, count, listingUrl, writeReviewUrl,
updatedAt }`. Seed rating/count from `meta`; staff update them in the admin when
the Google numbers move. Owner decision 2026-11-26: both URLs use the listing
link the owner supplied (it opens the listing on its Reviews tab, where guests
tap "Write a review"):

`https://www.google.com/maps/place/Stella+sharm+tours+by+heroes+travel/@27.8669735,34.293776,17z/data=!4m8!3m7!1s0x14533b00629c9acd:0x45ce161e00e9f2bf!8m2!3d27.8669735!4d34.293776!9m1!1b1!16s%2Fg%2F11msgw0xlv`

Staff can replace `writeReviewUrl` in the admin later with a Business Profile
"Ask for reviews" link (`g.page/r/…/review`) if they get one.

## 5. Import

`pnpm reviews:import [file]` (tsx script, idempotent):

1. Validate the file with a zod schema.
2. Upsert by `external_id`; new rows get `status='hidden'`. Existing rows keep
   their status, `featured`, `sort` and `lang`; text/rating/edited are refreshed.
3. Detect `lang` for rows without one (script-based heuristic is enough for
   EN/IT/ES/FR/DE/RU/TR/AR; leave null when unsure).
4. Print a summary (new / updated / unchanged).

The seed does **not** import reviews automatically; the owner runs the import
once per capture.

## 6. Admin (More → Reviews)

- Header: overall rating + count + "Last updated", editable (owner, manager).
- List: author, stars, month, language, first two lines of text, status chip.
  Filters: status, rating, language, with text only.
- Row actions: Publish / Hide, Feature, ↑/↓ reorder among featured.
- Read-only text (no edit field: verbatim rule). A hidden note explains why.
- Bulk: "Publish all 5★ with text in <language>".
- Every change goes to the audit log.

## 7. Website

API: `GET /v1/reviews?locale=xx&limit=n` returns `{ rating, count, listingUrl,
writeReviewUrl, items[] }` from published rows: featured first by `sort`, then
reviews in the visitor's language, then newest. Cached with the catalog and
revalidated on admin change.

Home section (after trips, before FAQ):

- Title, big rating "5.0 ★" with "499 reviews on Google" (link to listing).
- Horizontal scroll-snap cards on mobile, 3-column grid on desktop: stars,
  text (clamped, "Read more" expands in place), author, month, small "Google"
  text label. Each card links to the listing.
- Buttons: "Read all reviews on Google" and "Leave a review on Google"
  (`target=_blank rel="noopener"`).

Trip page: compact line under the price block: "★ 5.0 · 499 Google reviews",
linking to the listing. No per-trip reviews in this version.

If no review is published, the section is not rendered (never an empty state on
the public site). Rating and count still come from settings.

UI copy, all seven languages (to add to `apps/web/messages/*.json`):

| key | EN | IT | ES | FR | DE | RU | TR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| reviews.leave | Leave us a review on Google | Lasciaci una recensione su Google | Déjanos una reseña en Google | Laissez-nous un avis sur Google | Bewerten Sie uns auf Google | Оставьте отзыв о нас в Google | Google'da bize yorum bırakın |

The remaining keys (section title, "reviews on Google", "Read all", "Read more",
star aria-label) are authored in all seven languages during implementation.

## 8. Tests

- Import: schema validation, idempotency, status/featured preserved on re-import.
- API: only published rows; ordering; no hidden text leaks.
- Web: section hidden with zero published reviews; stars have a text
  alternative; 390/768/1440 screenshots; all seven locales render the UI strings.
- Static check: the rendered review text equals the DB text byte-for-byte.

## 9. Owner decisions and open questions

Decided 2026-11-26:

- Listing / review link: the URL in §4 (Settings).
- The owner accepts the Google terms risk of copying the reviews to the site;
  no per-author permission is needed before publishing.

Open:

1. Should staff stop asking guests for reviews before the trip ends? One 2★
   review (Victor Pak, RU) says reviews are requested before returning to the
   pier. Sending the review link after the trip is safer.
