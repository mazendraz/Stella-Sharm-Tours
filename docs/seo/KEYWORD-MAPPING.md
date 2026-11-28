# Keyword-to-page mapping (EN / IT)

No search-volume data was available; queries come from the brief, the
competitor results (`COMPETITOR-ANALYSIS.md`) and the real inventory (38 trips,
7 collections). Each indexable page has **one** primary intent so pages do
not compete with each other. Validate with Search Console queries after
launch (`EXTERNAL-ACTIONS-REQUIRED.md`) and adjust.

## Existing pages

| URL (same path in /it)                 | Primary intent EN                                       | Primary intent IT                               | Supporting topics                                           |
| -------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `/en`                                  | Sharm El Sheikh excursions; Sharm El Sheikh tours       | escursioni Sharm El Sheikh                      | best excursions, local tour operator, prices, private tours |
| `/en/c/private`                        | private tours from Sharm El Sheikh                      | escursioni private Sharm El Sheikh              | private car + guide, own start time                         |
| `/en/c/sea`                            | Sharm El Sheikh boat trips / snorkeling                 | escursioni in barca Sharm, snorkeling Sharm     | Ras Mohammed, Tiran, submarine, glass-bottom boat           |
| `/en/c/desert`                         | desert safari Sharm El Sheikh                           | safari nel deserto Sharm El Sheikh              | quad, buggy, Bedouin dinner, Nabq, canyons                  |
| `/en/c/history`                        | Cairo / Luxor day trip from Sharm                       | escursione al Cairo da Sharm                    | pyramids, GEM, Luxor by plane, Mount Sinai, St Catherine    |
| `/en/c/beyond`                         | Petra from Sharm El Sheikh; Jerusalem from Sharm        | Petra da Sharm, Gerusalemme da Sharm            | ferry, border                                               |
| `/en/c/relax`                          | things to do in Sharm in the evening; family activities | cosa fare a Sharm la sera                       | dolphin show, dinner cruise, aqua park, spa, horse riding   |
| `/en/c/all`                            | multi-day Egypt packages from Sharm                     | pacchetti Egitto da Sharm                       | combined journeys                                           |
| `/en/t/ras-mohammed-white-island-boat` | Ras Mohammed and White Island boat trip                 | escursione Ras Mohammed e White Island in barca | price, lunch, snorkel stops                                 |
| `/en/t/ras-mohammed-bus`               | Ras Mohammed by bus / land tour                         | Ras Mohammed via terra                          |                                                             |
| `/en/t/ras-mohammed-private-car`       | private Ras Mohammed trip                               | Ras Mohammed privato                            | per-car price                                               |
| `/en/t/tiran-island-boat`              | Tiran Island snorkeling trip                            | escursione Tiran                                |                                                             |
| `/en/t/cairo-plane-1-day`              | Cairo day trip by plane from Sharm                      | Cairo in aereo da Sharm in giornata             |                                                             |
| `/en/t/cairo-bus-gem`                  | Cairo by bus + Grand Egyptian Museum                    | Cairo in pullman e Grand Egyptian Museum        |                                                             |
| `/en/t/luxor-plane-1-day`              | Luxor day trip from Sharm                               | Luxor in giornata da Sharm                      |                                                             |
| `/en/t/mount-sinai-st-catherine`       | Mount Sinai sunrise trip                                | alba sul Monte Sinai                            | St Catherine                                                |
| `/en/t/quad-bike-safari`               | quad bike Sharm El Sheikh                               | quad Sharm El Sheikh                            |                                                             |
| `/en/t/petra-bus-ferry`                | Petra trip from Sharm by ferry                          | Petra da Sharm in traghetto                     |                                                             |
| other `/t/*`                           | the trip's own name + "Sharm El Sheikh"                 | same in Italian                                 |                                                             |
| `/en/faq`                              | booking questions (navigational for customers)          | domande prenotazione                            |                                                             |
| `/en/contact`                          | Stella Sharm Tours contact / office                     | contatti Stella Sharm Tours                     | address, WhatsApp                                           |

Cannibalisation risks to watch: the three Cairo trips (`cairo-bus-old-museum`,
`cairo-bus-gem`, `cairo-plane-1-day`) and their shared description — give each
a distinct SEO title/description around its real difference (bus vs plane,
old museum vs GEM). The same applies to the two Nabq private trips (morning
vs afternoon) and the two Red Canyon trips.

## Queries without a matching page (content roadmap)

| Query (EN / IT)                                                       | Intent                   | Proposed page                                                         | Condition                   |
| --------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- | --------------------------- |
| things to do in Sharm El Sheikh / cosa fare a Sharm El Sheikh         | informational            | Guide: Sharm El Sheikh by interest, linking to collections            | owner-reviewed facts        |
| Ras Mohammed guide / parco Ras Mohammed                               | informational            | Guide: Ras Mohammed (bus vs boat vs private, what to bring, park fee) | park fee and rules verified |
| can I visit Cairo from Sharm in one day / Cairo da Sharm in un giorno | informational-commercial | Guide: Cairo from Sharm — plane vs bus, timings from our itineraries  | timings from the DB         |
| best excursions for families / escursioni Sharm per famiglie          | commercial               | Guide built on the `family_friendly` flag (5 trips today)             | flags reviewed              |
| private vs group excursions / escursioni private o di gruppo          | commercial               | Guide on what private changes, prices from the DB                     | —                           |
| Sharm El Sheikh excursion prices / prezzi escursioni Sharm            | commercial               | Price overview generated from DB prices, no hard-coded figures        | prices set (31/38 today)    |
| escursioni con guida italiana                                         | commercial (IT)          | Only if Italian-speaking guides are confirmed                         | owner confirmation          |
| best time to visit Sharm El Sheikh / periodo migliore                 | informational            | Seasonal guide                                                        | first-hand, verified        |

Do not create one page per query variant; one guide per real topic.

## Update 2026-11-28 (phase 3 completion): queries 22–51

Mapped from the 30 new queries in `COMPETITOR-ANALYSIS.md`. Still no volume
data. "Guide draft" = an unpublished page in Admin → Travel guides
(`data/content/guides-draft.json`); it stays a draft until its `[CONFIRM]`
items are answered and all seven languages exist.

| Query (#) / intent                                                 | Page that should answer it (one home)                                             | Status / condition                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| things to do in Sharm (22), cosa fare a Sharm (23) — informational | New guide "Sharm El Sheikh by interest" linking to the 7 collections              | Not drafted; media own this result. Write only with first-hand content.          |
| excursion prices (24), prezzi escursioni (25) — commercial         | Home `/en` + collections (prices come from the DB on every card)                  | No price-list page: a generated one would duplicate the cards. Revisit with GSC. |
| best local excursion company (26) — commercial/navigational        | Home + Contact (identity, office, WhatsApp) + Google Business Profile             | Needs reviews/GBP (external, E4).                                                |
| White Island boat trip (27), Isola Bianca (28)                     | `/t/ras-mohammed-white-island-boat`                                               | Live; guide `ras-mohammed-boat-bus-or-private` supports it (draft).              |
| Ras Mohammed tour (29), via terra pullman (30), boat or land (38)  | Guide `ras-mohammed-boat-bus-or-private` (+ destination `ras-mohammed`)           | Draft; FAQ #44 attached (7 languages). Do not also target on the trip pages.     |
| desert safari quad/buggy dinner (31, 32)                           | `/c/desert`; activity draft `desert-safaris-compared`                             | Draft; safari fee needs the owner.                                               |
| escursioni private auto privata (33)                               | `/c/private`                                                                      | Live; FAQ #58–60 drafts.                                                         |
| Cairo by plane GEM (34), Cairo in giornata guida italiana (48)     | Guide `cairo-from-sharm-plane-or-bus`; trips `cairo-plane-1-day`, `cairo-bus-gem` | Draft with FAQ #28, #29, #48. "guida italiana" blocked by D2.                    |
| Luxor in aereo (35)                                                | `/t/luxor-plane-1-day`                                                            | Live.                                                                            |
| Petra traghetto (36), Jerusalem day trip (42)                      | `/t/petra-bus-ferry`, `/t/jerusalem-bethlehem`; `/c/beyond`                       | Live; documents/border questions need the owner and an official source.          |
| famiglie con bambini (37)                                          | Guide `sharm-excursions-for-families`                                             | Draft with FAQ #31.                                                              |
| first time visitors (40) — conversational                          | FAQ page + home                                                                   | No separate page (would be thin); answered by the guides once published.         |
| glass bottom / Sea Scope (41), dolphin show (46)                   | `/t/glass-bottom-boat`, `/t/sea-scope-submarine`, `/t/dolphin-show`               | Live.                                                                            |
| Coloured Canyon Dahab (43)                                         | `/t/red-canyon-blue-hole`, `/t/dahab-day-trip`                                    | Live; FAQ #49 (FAQ page draft).                                                  |
| book on WhatsApp / pay on the day (44), hotel or on the spot (45)  | FAQ page (#2, #3, #17)                                                            | FAQ drafts ready; payment timing/currency need the owner (#18–20).               |
| Mount Sinai climb length (47)                                      | `/t/mount-sinai-st-catherine`; guide `mount-sinai-sunrise-how-the-night-works`    | Draft; walking time needs the owner (#47).                                       |
| Nabq protected area (49)                                           | `/t/nabq-private-morning`, `/t/nabq-private-afternoon`, `/t/camping-nabq`         | Live; the two private Nabq trips must keep distinct titles (cannibalisation).    |
| excursion agency Naama Bay (50) — local                            | Contact page + GBP                                                                | External (GBP, E4).                                                              |
| Sinai-only stamp and Cairo (51)                                    | Cairo guide, only with an official dated source                                   | **Do not publish** from competitor claims; owner + official source (FAQ #42).    |

Cannibalisation check: every new query has one home above. The guide drafts
target comparison/informational intent ("by boat or by bus", "plane or bus"),
while trip pages keep the transactional intent of their own trip name.
