# 08 · Languages & translation plan

The site must speak every visitor's language. There are two tiers. **Client decision (2026-11-11): 7 core languages EN, IT, ES, FR, DE, RU, TR; every other language is auto-translated for free.**

| Tier     | Languages                                                                                                                                                                                                                                                     | Who writes the text                                                                       | Quality bar                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Core** | English `en` (default + source), Italian `it`, Spanish `es`, French `fr`, German `de`, Russian `ru`, Turkish `tr`                                                                                                                                             | People: staff in the admin; UI strings checked by a native speaker before launch          | Publication quality, reviewed                            |
| **Auto** | Every other language the provider supports. Launch set (enabled by default): Polish `pl`, Czech `cs`, Slovak `sk`, Ukrainian `uk`, Romanian `ro`, Hungarian `hu`, Dutch `nl`, Portuguese `pt`, Arabic `ar` (RTL), Chinese `zh`; owner can switch any other on | Machine translation from EN, done by the worker, stored in the DB, redone when EN changes | Good enough, clearly labelled "Translated automatically" |

The owner can switch any auto language on or off in the admin (**More → Languages**) **without a deploy**.

**Owner update (2026-11-12):** Codex is to author the complete existing core site
translations directly, without a translation provider/subscription. They are
versioned in `data/i18n/` and seeded into the database with `codex-authored`
provenance. All 38 tours, four draft package titles and existing site content
are covered; native human approval is not claimed. Existing human values remain
authoritative. Core display no longer depends on provider keys. Extra optional
languages keep the provider workflow below.

---

## 1. Rules

- **Standing owner rule (2026-11-12): every future addition or edit must include all seven core languages in the same task.** Update UI/content/SEO/alt text and confirmation/error wording together; review all corresponding translations after source changes. Author these directly without a provider/subscription. Verify shared behavior/layout/price changes in all seven locales. New missing/stale translations or EN fallback are not an accepted completion state.
- **EN is the source of truth.** Every translatable field must have EN. Everything is translated _from_ EN.
- **Never machine-translate**: prices, numbers, times, phone numbers, slugs, URLs, brand and place names (glossary, §5), and anything a customer typed (names, notes, booking requests). **No personal data is ever sent to the translation provider.**
- **A human value always wins.** If a core field has a value written by staff, the machine never overwrites it.
- When EN changes: auto translations are regenerated automatically; human core values are **kept** but flagged "EN changed — review" in the admin.
- Anything still missing → show EN and set `lang="en"` on that element.

## 2. Routing & detection

- Every route is prefixed by the locale: `/en`, `/it`, `/es`, `/fr`, `/de`, `/ru`, `/tr`, and `/<auto>` (e.g. `/pl`, `/ar`). The list of live locales comes from settings (cached, tag `locales`); unknown locale → 404.
- First visit: best match of `Accept-Language` among live locales (`es-MX` → `es`, `pt-BR` → `pt`); core wins a tie. Then remembered in the `NEXT_LOCALE` cookie; never auto-redirect again after the visitor chooses. No redirect for bots (`x-default` = `en`).
- **Language switcher** (`LangSwitch`): the 7 core languages first with native names (English, Italiano, Español, Français, Deutsch, Русский, Türkçe); under them a "More languages" list (native names from `Intl.DisplayNames`), searchable when there are more than 8; each auto entry has a small "auto" tag.
- Auto-locale pages show a slim notice at the top of the content: "This page was translated automatically · Read in English" (the notice itself is translated). Dismissible, remembered in localStorage.

## 3. Data model

- Core translations stay in the entity columns as jsonb: `{ "en": "...", "it": "...", "es": "...", "fr": "...", "de": "...", "ru": "...", "tr": "..." }` (zod: `en` required, the others optional).
- New table for machine translations and for tracking freshness:

```sql
create table content_translations (
  id uuid primary key default gen_random_uuid(),
  entity text not null,       -- 'trip','trip_item','itinerary','collection','hero_slide','package','faq','page_block','media','settings','ui'
  entity_id text not null,    -- uuid, or the message namespace for 'ui'
  field text not null,        -- json path: 'title', 'notes[2]', 'perks[1].title', 'alt'
  locale text not null,
  text text not null,
  source_hash text not null,  -- sha256 of the EN source when this text was made
  origin text not null check (origin in ('machine','human')),
  provider text,              -- 'deepl','google','libre', null for human
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (entity, entity_id, field, locale)
);
create index on content_translations (locale, entity);
```

- `origin='machine'`: auto-language text, or a core-language fallback while staff have not written one yet.
- `origin='human'`: written by the API whenever staff save a core value (or edit an auto one); it stores the EN `source_hash` so the admin can show "EN changed — review".
- **Resolver** (`packages/shared/i18n/resolve.ts`, unit-tested): for `(field, locale)` return
  1. the jsonb value for that locale if it is a core locale and not empty (human);
  2. else the `content_translations` row for that locale (a human edit of an auto language first, then machine; a stale one is still shown while the refresh job runs);
  3. else EN, with `fallback: true` so the UI sets `lang="en"`.
- Settings key `i18n`:

```json
{
  "core": ["en", "it", "es", "fr", "de", "ru", "tr"],
  "auto": ["pl", "cs", "sk", "uk", "ro", "hu", "nl", "pt", "ar", "zh"],
  "auto_live_min_coverage": 0.95,
  "indexable_auto": true,
  "provider_by_locale": { "default": "deepl", "fallback": "google" },
  "free_tier_only": true,
  "monthly_char_budget": 1000000
}
```

## 4. Translation pipeline (worker, pg-boss)

- Adapter interface in `packages/shared/translate`: `translate(texts[], { from: 'en', to, format: 'text'|'markdown'|'icu', glossary })`. Adapters: **DeepL** (default where it supports the language, best quality), **Google Cloud Translation** (fallback, covers the most languages), **LibreTranslate** (optional self-hosted container — no external calls, lower quality), **fake** (tests).
- The language list the admin offers = the union of what the configured providers support. If no provider key is set, auto languages are switched off automatically, the site shows only the 7 core languages, and the admin shows a warning.
- Jobs:
  - `i18n.translate_entity` — enqueued on every save of EN content (debounced 30 s per entity). Translates the changed fields for every enabled auto locale, and for core locales whose human value is empty. Skips a field if `source_hash` is unchanged (idempotent, saves cost).
  - `i18n.backfill_locale` — when the owner enables a new language: translates all published content + UI messages. The language appears in the switcher, sitemap and hreflang only when coverage ≥ `auto_live_min_coverage`.
  - `i18n.refresh_stale` — nightly: anything whose `source_hash` no longer matches EN.
- Batching (≤ 50 strings / call), retries with backoff, per-month character counter; when the budget is reached the jobs stop and the owner gets an admin alert + email (the site keeps showing the last translations).
- After a job writes rows → `revalidate.web` with the right tags (`trip:<slug>`, `site`, `ui:<locale>`…).
- Rough size (measured on `data/catalog.json` ≈ 15k EN characters, + UI strings, FAQ and legal pages): ≈ 50k characters per language → machine fallbacks for ES/FR/DE/RU/TR (until staff write them) + 10 auto languages ≈ 750k characters once, then only what changes (usually a few thousand a month).
- Cost (Nov 2026 list prices): DeepL API Free and Google Cloud Translation both include 500k characters/month free; DeepL Pro is $5.49/month + $25 per million, Google $20 per million above the free 500k. **Free mode (default, `free_tier_only: true`)**: the worker uses DeepL Free up to 500k characters/month, then Google's free 500k, then stops until next month (no billing). So the first backfill (~750k) finishes free within the first month, and later months only translate changes (a few thousand characters). Turning `free_tier_only` off allows paid usage up to `monthly_char_budget`.

## 5. Glossary & safety checks

- Settings `i18n_glossary`: **do-not-translate** terms (Stella, Stella Sharm Tours, Ras Mohammed, Tiran, Naama Bay, Nabq, Sharks Bay, Hadaba, Old Market, St Catherine, Dahab, Petra, Wishwash, Sea Scope…) and optional forced translations per locale. Editable in the admin.
- ICU messages: placeholders (`{count}`, `{name}`, plural/select blocks) are protected before translation and validated after; a result with a broken placeholder is rejected and EN is used.
- Markdown (FAQ, legal) is translated with format preserved, then re-sanitised with the same allow-list.
- Legal pages in auto languages carry the line "The English version is the binding one."

## 6. UI strings

- `messages/en.json`, `it.json`, `es.json`, `fr.json`, `de.json`, `ru.json`, `tr.json` in the repo (ICU, `next-intl`). **CI fails if the 7 files do not have the same keys.**
- Auto locales: the worker translates `en.json` and stores it as `entity='ui'`; the web app loads `GET /v1/public/messages?locale=de` (cached, tag `ui:<locale>`) and merges it over EN. So a new language needs no deploy.
- Plurals through `Intl.PluralRules` (test Russian plural forms 1 / 2–4 / 5+, and Turkish/French rules).

## 7. Typography & layout

- Manrope: load subsets `latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`.
- **Marcellus has no Cyrillic.** For Cyrillic locales (`ru` core, `uk` auto…) headings use **Forum** (similar classical display serif, has Cyrillic), loaded via `next/font` only for those locales.
- Other scripts (`ar`, `zh`, `ja`, `ko`, `el`, `he`, `th`, `hi`…): the matching **Noto Sans** family, loaded only for that locale; headings use it too.
- **RTL** (`ar`, `he`, `fa`, `ur`): `<html dir="rtl">`. Use CSS logical properties everywhere from day one (`ms-/me-`, `ps-/pe-`, `start/end`, `inset-inline`); mirror arrows, swipe direction, carousels and the hero tap zones. Prices, phone numbers and refs wrapped in `<bdi>`.
- German and Russian text is ~30 % longer: buttons and chips must wrap or shrink, never clip. Visual QA at 390 px in `fr`, `de`, `ru` and `tr` (Turkish dotted/dotless i: use `toLocaleUpperCase(locale)` for any uppercase text).

## 8. Formatting

- `Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })`, `Intl.DateTimeFormat`, time zone `Africa/Cairo`.
- Weekday labels ("Sunday · Wednesday · Friday") are generated from `trips.run_days` with `Intl`, not translated as text.

## 9. Booking request & WhatsApp

- Default phone country code by locale (map in `packages/shared`): `it` +39, `es` +34, `fr` +33, `de` +49, `ru` +7, `pl` +48, `cs` +420, `sk` +421, `uk` +380, `ro` +40, `hu` +36, `nl` +31, `pt` +351, `tr` +90; `en` and others: none preselected.
- `booking_requests.locale` is saved. The admin inbox shows a language badge. "Reply on WhatsApp" offers the template in the customer's language for core languages, EN otherwise (templates are translated with placeholders **before** the customer's name is inserted).
- The prefilled WhatsApp message the customer sends uses their locale for core languages, EN for auto languages (staff must be able to read it).
- Staff emails are always EN.

## 10. SEO

- `hreflang` for every live locale + `x-default` = `en`; canonical per locale; sitemap lists every live locale.
- Auto locales indexable by default (`indexable_auto`); when off → `noindex` on auto pages and they leave the sitemap/hreflang.
- Correct `<html lang>`; JSON-LD `inLanguage`.

## 11. Admin

- Every translatable editor (trips, collections, hero slides, packages, FAQ, pages, homepage blocks, media alt): **language tabs EN · IT · ES · FR · DE · RU · TR** (EN first, required). Desktop: EN next to one chosen language. Mobile: one language toggle per section (not per field) to save taps.
- Each non-EN field shows a status: ✓ written by staff · "auto" (machine fallback) · "EN changed — review" · empty.
- "Auto-translate from EN" button per field and per section: fills a draft that staff can correct; saving it makes it human.
- **Translation queue**: all core fields that are empty, auto or stale, filtered by language — so a French-speaking staff member can work through only FR.
- **More → Languages** (owner, manager): core list (fixed), auto languages with on/off switch, coverage %, last run, "Re-translate all", characters used this month vs budget, glossary editor, "index auto languages" switch, preview any page in any language.
- Admin UI language itself: EN + AR (as in the admin plan).

## 12. Security & privacy

- Provider keys (`DEEPL_API_KEY`, `GOOGLE_TRANSLATE_KEY`, `LIBRETRANSLATE_URL`) only in the **worker** env; calls are server-side only, so the web CSP does not change.
- Only published public content is sent. Never: booking requests, customer names/phones/notes, internal notes, audit data. A test with the `fake` provider records every payload and asserts there is no PII.
- Record the provider choice in `docs/adr/` and `docs/OWNERS.md` (who owns the key and the bill).

## 13. Tasks

- [x] I5b Owner-requested complete core content: direct Codex authoring for all 38 tours and existing site content, repository/DB seed, numeric/source-order checks, zero EN fallbacks across seven locales and 21 real browser locale checks. No translator service or subscription. Evidence: `docs/core-languages-verification.md`.
- [x] I1 Locale config from settings + middleware + detection + cookie + `LangSwitch` (core + "More languages"). Live locales are cached 60 s per web instance and served from a settings-only endpoint (2026-11-14).
- [x] I2 `content_translations` table + resolver + unit tests for the fallback order
- [x] I3 Provider adapters (deepl, google, libre, fake) + glossary + placeholder guard + budget counter. Real provider keys/free quota remain operator acceptance.
- [x] I4 Worker jobs `translate_entity`, `backfill_locale`, `refresh_stale` + revalidation
- [x] I5 `es`, `fr`, `de`, `ru`, `tr` message files + key-parity CI check + `/v1/public/messages` for auto locales
- [x] I6 Fonts per script (Forum for Cyrillic, Noto Arabic/SC) + RTL + logical-CSS audit. Only the launch auto set is covered: Forum is applied to `ru`/`uk`; other Cyrillic auto locales and other scripts (he, el, ja, ko, th, hi…) need a font before the owner enables them.
- [x] I7 Admin language tabs, status dots, translation queue, Languages screen. The core "Auto-translate from EN" button is intentionally superseded by the owner's direct-authoring rule (2026-11-12). Admin UI is the seven core languages; Arabic admin UI is later scope (DECISIONS).
- [x] I8 SEO: hreflang, canonical, sitemap for every live locale; auto-translated notice

Code review 2026-11-14: I1–I8 were implemented during M1–M3/file 05 but never ticked here; evidence is in `backend-verification.md`, `frontend-verification.md`, `admin-verification.md` and `core-languages-verification.md`. Acceptance with a real provider (§14 Polish/auto checks) remains open until keys are configured.

## 14. Acceptance checks

- Browser in Spanish → lands on `/es`, all UI and content in Spanish written by people; same for French and German.
- Browser in Russian → `/ru` written by people, headings render in Cyrillic with no missing glyphs; Turkish → `/tr` with correct İ/ı.
- Browser in Polish → `/pl` machine-translated with the notice; prices identical to `/en`.
- Browser in German → lands on core `/de`, without an auto-language notice; missing German content falls back explicitly to EN. Prices match `/en`.
- Staff change an EN trip title → within ~2 minutes `/pl` shows the new translation when Polish is enabled, supported and covered; `/it` keeps the human IT title and the admin flags it "EN changed — review".
- Owner switches on Polish (not in the launch set) → after the backfill `/pl` appears in the switcher and the sitemap, no deploy.
- If Arabic is switched on later, `/ar` renders correctly right-to-left at 390 px (layout is RTL-ready from day one).
- The fake-provider test proves no personal data is ever sent.
