# 90-day content roadmap

Starting after this branch is deployed. Every item needs first-hand facts
from the owner; nothing is published from generic AI text. Each item ships in
all seven core languages at once (AGENTS.md). Prices are linked from the
database, never typed into prose.

## Days 1–30 — fix what exists (highest return)

| #   | Work                                                                                                                                                 | Owner input needed        | Where                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------- |
| 1   | Approve and publish cancellation, terms and privacy pages                                                                                            | legal entity, policy text | Admin → Pages                |
| 2   | FAQ to ~10 verified answers (list in `AEO-GEO-STRATEGY.md`)                                                                                          | answers                   | Admin → FAQ                  |
| 3   | Per trip: exclusions and extra costs, "what to bring", min age, family flag                                                                          | per-trip facts            | Trip editor → items / basics |
| 4   | Distinct SEO title (≤ 60 chars) and description (≤ 155) for every trip, starting with the 3 Cairo trips and the long Nabq/water-activities titles    | review                    | Trip editor → SEO            |
| 5   | Set prices for the 7 trips still "on request" where a fixed price exists                                                                             | prices                    | Trip editor → prices         |
| 6   | 2–4 sentence description per trip, written from experience (what it feels like, who it suits, the honest caveats) — start with the 10 most requested | staff knowledge           | Trip editor → description    |

## Days 31–60 — first guides (informational → commercial links)

Proposed as a small "Guides" page type (needs a build task: route, admin
editor, sitemap, `Article` JSON-LD with real author and date).

| Guide                                                      | Links to                           | Verify                             |
| ---------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| Ras Mohammed: by boat, by bus or private — which to choose | 3 Ras Mohammed trips, White Island | park fee, tide note, snorkel rules |
| Cairo from Sharm: plane or bus, one day or two             | 6 Cairo/Alexandria trips           | timings from itineraries           |
| Group or private: what changes                             | Private collection                 | surcharge rules from DB            |

## Days 61–90 — depth and trust

| Work                                                                       | Notes                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| About page: company history, office, how bookings are confirmed            | only verified facts; no "years of experience" unless proven |
| Guide: Sharm El Sheikh excursions for families                             | built on reviewed family flags                              |
| Guide: desert safari options compared (quad, buggy, 5-in-1, Bedouin night) | from trip data                                              |
| Original photo pass with recorded rights for trips without real images     | `rights_status` in media library                            |
| Review-request routine live (see `LOCAL-SEO-ACTION-PLAN.md`)               | genuine customers only                                      |
| Second AI-visibility benchmark run; compare with month 1                   | `AI-VISIBILITY-BENCHMARK.md`                                |

## Internal linking

- Guides link to trips with descriptive anchors ("Ras Mohammed by boat with
  White Island"), not "click here".
- Trip pages link back to their collection (breadcrumb) and to the relevant
  guide once it exists.
- The home page already links to every collection and featured trips; keep
  every trip reachable from a collection (the crawl check warns if not).
