# Answer and generative engine optimization (AEO / GEO)

Goal: make each page understandable on its own when a search engine or an AI
assistant retrieves it, and make the facts on it worth citing. There is no
switch that makes an AI recommend a business; what helps is accurate,
specific, consistent, crawlable information and genuine third-party signals.

## Done on this branch

- **Crawlable answers**: metadata now reaches AI search crawlers in `<head>`
  (they previously got it deep in `<body>`). Trip content is server-rendered
  and works without JavaScript.
- **Entity clarity**: one `TravelAgency` entity with a stable `@id`, address,
  geo, phone, logo and social profiles, referenced as `provider` by every
  `TouristTrip` and `Offer`.
- **Self-contained trip facts** in JSON-LD: name, description, images,
  itinerary steps, EUR prices with units, provider.
- **Search crawlers allowed**: Googlebot, Bingbot, OAI-SearchBot,
  ChatGPT-User, PerplexityBot, Claude-SearchBot are not blocked. Training
  opt-out is a separate owner switch (`AI_TRAINING_CRAWLERS=block`).
- **`/llms.txt`**: optional index of public pages. Treat it as experimental.
- No hidden text, no instructions aimed at AI systems, no invented claims.

## Each page should answer, in visible text

| Question                         | Where it lives today                       | Gap                                                                               |
| -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Who runs the trip?               | footer, contact page, JSON-LD              | No About page with verified company facts                                         |
| What is it, where?               | trip title, summary, itinerary             | Summaries are short lists (36/38 under 80 chars); no descriptive paragraph (0/38) |
| How long, when?                  | duration, run days, departure/return facts | —                                                                                 |
| What does it cost?               | DB prices, "On request" otherwise          | 7/38 trips have no price set                                                      |
| What is included / not included? | inclusions; exclusions on 6/38             | exclusions and extra costs (park fees, tips, drinks) per trip                     |
| Who is it for?                   | family flag (5/38), min age (0/38)         | age limits, fitness, accessibility                                                |
| What to bring?                   | `bring` items: 0/38                        | per trip                                                                          |
| Pickup?                          | departure time; pickup policy in catalogue | pickup areas and times shown per trip                                             |
| Guide language?                  | not recorded                               | owner confirmation                                                                |
| Cancellation?                    | legal page pending                         | approved cancellation terms                                                       |
| How do I book?                   | request flow + WhatsApp                    | FAQ has one entry                                                                 |

All gaps need first-hand, verified information from the owner. The admin
already has the fields for most of them (items of type `exclude`, `bring`,
`optional`; notes; family flag; min age; SEO title/description).

## Writing rules for new content

1. Open with a direct one- or two-sentence answer, then the detail.
2. Use question headings only where travellers actually ask the question.
3. Prefer tables for comparisons (bus vs plane to Cairo, group vs private).
4. Prices and times come from the database; guides link to the trip rather
   than repeating a price that could go stale.
5. State the source and the date for facts that change (park fees, seasons).
6. Same facts in all seven languages (AGENTS.md rule); never an EN fallback.
7. No filler to reach a word count; no duplicated descriptions across trips.

## FAQ priorities (answers must come from the owner)

1. Is hotel pickup included, and from which areas?
2. How and when do I pay? (no online payment)
3. What is the cancellation policy?
4. Can children join, and do they pay less?
5. Which languages do guides speak?
6. Are national-park or entry fees included?
7. Can any trip be made private, and how much more does it cost?
8. What should I bring on a boat trip / desert safari?

## Measuring

See `AI-VISIBILITY-BENCHMARK.md` (repeatable prompt set) and
`EXTERNAL-ACTIONS-REQUIRED.md` (Search Console, Bing Webmaster Tools).
AI referrals can be seen in Umami by referrer (`chatgpt.com`,
`perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`) without any
personal data; Umami is already configured to exclude query strings.
