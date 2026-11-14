# Complete core-language handoff — 2026-11-12

The owner requested direct Codex translation of the entire existing public site
into EN/IT/ES/FR/DE/RU/TR, without a translation provider or subscription.

## Delivered

- All 38 existing tours in all seven languages: names, descriptions/summaries,
  duration/run-day/departure labels, itinerary text/time labels, inclusions,
  exclusions/options, notes, price labels and image alt text.
- All seven collections, hero content inherited from collections, Private
  perks, homepage blocks/steps/contact content and the address.
- Four draft package titles; packages stay draft, with no invented prices.
- Seven existing UI dictionaries, translated request controls and confirmation
  messages, correct singular/plural guest wording and localized Other pickup label.
- Language selection now performs document navigation, preserving the page path
  while updating document language, direction and the correct locale font.

`data/i18n/core-source.json` contains 409 unique sources. The companion content
file holds six translations for each of the 374 language-bearing sources; the
other 35 contain only times/punctuation/empty values. English stays the source.
The source-order hash, numeric-fact checks and locale parity guard the mapping.

Seed imports these into the DB with `codex-authored` provenance, and never
overwrites existing human content. No provider key or online translator is
required to display or restore these translations. AI authorship is recorded
honestly; no native human review is claimed. See [data notes](../data/i18n/README.md).

## Verification

- 90 unit tests pass, including all source/locale pairs, numeric facts, source
  order, UI key parity and booking plurals.
- 31 PostgreSQL integration tests pass. One walks every public Text field across
  all 38 tours, collections and site content for each core locale: **zero EN
  fallbacks**. Another submits a real request in each locale and checks translated
  trip/pickup text and unchanged authoritative prices.
- 21 real-API browser language checks pass: seven locales at 390×844, 768×1024
  and 1440×900. Coverage includes the actual switcher, HTML language, home hero,
  collection/trip titles, metadata, run days and request controls. Automated
  WCAG 2/2.1/2.2 A/AA checks report no violations in these flows.
- Build, typecheck and lint pass. Screenshots are in ignored `.local/languages/`.
  Russian mobile and Turkish desktop layouts were visually reviewed.

## Boundaries

Brand/place names and numbers intentionally retain their identity. Customer-entered
names/hotels/notes are never translated. Legal/FAQ content not supplied in the
source remains absent, with localized empty states. No policies, reviews, facts,
prices or trip services were invented to fill gaps.

Future EN content needs six corresponding repository/staff translations; unknown
new source text still has honest EN fallback. Additional non-core languages keep
their optional provider workflow. Existing open production/LCP/media-rights
acceptance limits in the backend handoff are unchanged.

Run `pnpm db:seed` to install the bundled content and `pnpm test:e2e:languages`
against the local real stack to repeat browser verification.
