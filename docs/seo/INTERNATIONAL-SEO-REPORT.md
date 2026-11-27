# International SEO report

## Architecture (unchanged, verified)

- Subdirectory per language: `/en`, `/it`, `/es`, `/fr`, `/de`, `/ru`, `/tr`;
  machine-translated languages appear when the owner switches them on and are
  `indexable` only when enabled for indexing in the admin.
- Same slug in every language (`/it/t/ras-mohammed-white-island-boat`), so
  equivalent pages are paired 1:1 without a mapping table.
- `<html lang>` and `dir` per locale; CSS logical properties for RTL.
- Self-referencing canonical per language. Italian pages are **not**
  canonicalized to English.
- `hreflang` for every indexable language + `x-default` (→ `/en`) in both the
  page `<head>` and the sitemap; the crawl confirms the two sets match and are
  reciprocal on all 336 URLs.
- `/` uses the saved choice or `Accept-Language` and a 307; crawlers always get
  `/en`. No IP/geo redirects, so every language stays reachable.
- The language switcher links to the same path in the other language.

## Changed on this branch

| Item                              | Before                             | After                                                                                      |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Metadata position for AI crawlers | `<body>`                           | `<head>` for every agent                                                                   |
| Home title / description          | brand only, none                   | localized in 7 languages                                                                   |
| Collection title                  | "The Red Sea"                      | "The Red Sea: excursions from Sharm El Sheikh" pattern, localized                          |
| FAQ / contact descriptions        | none                               | localized                                                                                  |
| `og:locale`                       | `it`                               | `it_IT` + `og:locale:alternate`                                                            |
| JSON-LD language                  | `inLanguage` on business (invalid) | `inLanguage` on WebPage/WebSite only; names and descriptions come from the page's language |

New strings (`apps/web/messages/*.json`): `seoHomeTitle`,
`seoHomeDescription`, `seoCollectionTitle`, `seoFaqDescription`,
`seoContactDescription`, authored in EN/IT/ES/FR/DE/RU/TR. Place names follow
the existing content (Latin "Sharm El Sheikh" in IT/ES/FR/DE, "Шарм-эль-Шейх"
in RU, "Şarm El-Şeyh" in TR). The parity test (`messages.test.ts`) passes.

## Italian market notes

The Italian results page for "escursioni Sharm El Sheikh" is led by
operators and agencies that state an **Italian-speaking guide** (Alpitour,
Civitatis, DLT Viaggi) — see `COMPETITOR-ANALYSIS.md`. It is the clearest
Italian-specific intent we saw. The site does not say which languages guides
speak, and nothing in the repository confirms it, so no page or text claims it.

Once the owner confirms guide languages per trip:

1. Add a "Guide languages" fact per trip (admin field, shown on the page and
   in `TouristTrip` as `availableLanguage` on the provider/offer).
2. Write Italian copy that uses the phrasing Italians search ("escursione con
   guida italiana", "trasferimento dall'hotel incluso"), reviewed by a native
   speaker — `docs/OWNERS.md` still lists native review of the 7 locales as open.

## Remaining

- Native-speaker review of SEO strings and trip content (owner/translator).
- Optional localized slugs: not recommended now; same-slug pairing is simple
  and safe, and changing URLs would need redirects.
- Machine languages: keep them `noindex` until reviewed, as today.
