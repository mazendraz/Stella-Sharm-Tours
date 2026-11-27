# Structured data report

Builders: `apps/web/src/lib/structured-data.ts` (pure functions, unit-tested in
`structured-data.test.ts`). Every value comes from published settings or
catalogue data; missing values are omitted, never filled in.

## Entity graph

Each page carries one `@graph` from the layout (business + website) and one
from the page. Nodes refer to each other by stable `@id`:

```
{origin}/#organization  TravelAgency  ← provider / offeredBy / about / publisher
{origin}/#website       WebSite       ← isPartOf
{url}#webpage           WebPage | CollectionPage | FAQPage | ContactPage
{url}#trip              TouristTrip   ← mainEntity of a trip page
{url}#breadcrumb        BreadcrumbList
```

## Nodes and sources

| Node                               | Pages                           | Properties                                                                                                                                                                                                                                                                                                      | Source                                                |
| ---------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `TravelAgency` (a `LocalBusiness`) | all                             | name, url, logo (`/brand/logo.webp`, 415×360), image, telephone, email (if set), `PostalAddress` (street = admin address; locality Sharm El Sheikh; region South Sinai; country EG), `GeoCoordinates` (office pin used by the contact map), `hasMap`, `areaServed`, `sameAs` (https social links from settings) | settings, `links.ts` office pin                       |
| `WebSite`                          | all                             | name, url, publisher, `inLanguage` = indexable languages                                                                                                                                                                                                                                                        | settings                                              |
| `WebPage`                          | home, trip                      | name, `inLanguage`, isPartOf, about, mainEntity, breadcrumb, primaryImageOfPage                                                                                                                                                                                                                                 | page                                                  |
| `TouristTrip`                      | trip                            | name, description (plain text), url, up to 6 unique images, provider, `touristType: Families` only when the trip is flagged family-friendly, `itinerary` as `ItemList`, `subTrip` for package parts, `offers`                                                                                                   | trip                                                  |
| `Offer` + `UnitPriceSpecification` | trip                            | price, `priceCurrency: EUR`, label, unit (person, child, car, boat, hour…), url, offeredBy                                                                                                                                                                                                                      | DB prices only; "on request" prices emit **no** offer |
| `BreadcrumbList`                   | trip (3 levels), collection (2) | positions from 1                                                                                                                                                                                                                                                                                                | page                                                  |
| `CollectionPage` + `ItemList`      | collection                      | trips in display order with URLs                                                                                                                                                                                                                                                                                | collection                                            |
| `FAQPage`                          | FAQ (only when it has entries)  | Question / acceptedAnswer as plain text                                                                                                                                                                                                                                                                         | FAQ                                                   |
| `ContactPage`                      | contact                         | mainEntity → organization                                                                                                                                                                                                                                                                                       | page                                                  |

Removed: `inLanguage` on `TravelAgency` and `TouristTrip` (not defined for
those types) and string-array itineraries.

## Deliberately not emitted

| Type / property             | Why                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AggregateRating`, `Review` | No verified reviews on the site. Self-serving review markup for a LocalBusiness is not eligible for Google review snippets anyway. The test suite fails if either appears. |
| `availability`, `validFrom` | Bookings are requests; availability is not known when the page renders.                                                                                                    |
| `openingHoursSpecification` | Hours are free text in settings; parsing them would risk wrong data. Add structured hours in the admin first.                                                              |
| `priceRange`                | Would be an editorial claim; real prices are on each Offer.                                                                                                                |
| `Person` (guides/authors)   | No verified staff profiles.                                                                                                                                                |
| `VideoObject`               | Video rights and transcripts are not confirmed for every clip (`rights_status`). Add once media rights are recorded.                                                       |
| `duration`                  | `TouristTrip` has no duration property; the visible duration label stays on the page.                                                                                      |

## Valid Schema.org vs Google rich results

| Markup                                        | Valid schema.org | Google rich result?                                                                                               |
| --------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Organization / LocalBusiness (`TravelAgency`) | yes              | Can feed the knowledge panel (logo, contacts); the local panel comes from the Google Business Profile, not markup |
| `BreadcrumbList`                              | yes              | Yes — breadcrumb trail in results                                                                                 |
| `WebSite`                                     | yes              | Site name in results                                                                                              |
| `TouristTrip` + `Offer`                       | yes              | No dedicated rich result; helps understanding and AI answers                                                      |
| `FAQPage`                                     | yes              | **No** for this site — since 2023 Google shows FAQ results only for well-known government and health sites        |
| `ItemList` on collections                     | yes              | Carousel only for specific types (recipes, courses…), not tours                                                   |

## Validation

- Unit tests: 8 cases (ids, no empty or insecure claims, offers only for set
  prices, ItemList itinerary, breadcrumbs, FAQ plain text, safe serialization).
- e2e (`tests/e2e/seo.spec.ts`): trip graph has provider `@id`, ItemList
  itinerary, EUR offers, 3-level breadcrumb, no review markup.
- The crawl check parses every JSON-LD block on all 336 URLs: 0 errors.
- Recommended after deploy: Google Rich Results Test and
  validator.schema.org on one URL per page type (needs the public URL).
