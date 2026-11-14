# Seven core languages — repository content

The owner requested on 2026-11-12 that Codex translate the entire existing site
directly, without a translation service or subscription. These files contain
those authored translations for EN/IT/ES/FR/DE/RU/TR. No provider API, local MT
engine or paid translation key is needed to seed or display them.

- `core-source.json`: the 409 unique source strings, including clock values.
- `core-content.json`: 374 language-bearing rows. A row is
  `[sourceIndex, Italian, Spanish, French, German, Russian, Turkish]`.
  The other 35 sources contain only times, punctuation or empty values and are
  language-independent. `sourceSha256` pins the source order; do not reorder it.
- UI dictionaries remain in `apps/web/messages/{en,it,es,fr,de,ru,tr}.json`.

Coverage includes all 38 existing tours, four draft package titles, collections,
hero inheritance, homepage content/perks/steps, descriptions/summaries, schedules,
itineraries, price labels, inclusions/exclusions/options, notes, image alternative
text and the contact address. Booking UI and confirmation templates are localized.
Brand/place names, phone numbers, URLs, prices and numeric facts are preserved.
Empty legal/FAQ content is not invented; its existing UI empty states are translated.

`pnpm db:seed` applies the strings to `content_translations` with provenance
`origin=machine`, `provider=codex-authored`. That records AI authorship truthfully,
without claiming external MT or native human review. Existing human/core values
take precedence and human translation rows cannot be overwritten by this import.
The seed also handles draft package content and is repeatable.

When a new EN source is added, append it to the source list, author its six
translations, update the pinned hash after review, and rerun seed. Unrecognized
new text has explicit EN fallback instead of a guessed translation. Core pages
do not require an online translation process. Other optional languages retain
the separate provider/coverage workflow from the language plan.

Standing owner rule: do this for every future addition/edit automatically, not
as a separate translation task. Review all six translations when source meaning
changes. Runtime fallback remains a safeguard; it is not an acceptable delivery
state for newly added or changed core content. Verify the affected pages and
behavior in all seven locales before reporting the task complete.

Verification: unit checks cover all source/locale pairs, exact numeric facts,
source order and confirmation plurals. PostgreSQL tests walk every public Text
field of all 38 tours and site/collections in all seven locales and reject EN
fallback. Browser checks use the real API at 390/768/1440, including language
selection, document language, hero/collection/trip text, metadata and request UI.
