# Price & schedule check — send to Stella before launch

Everything in `catalog.json` was typed from Stella's own flyers and price lists (copies in `reference/flyers/`). These points disagree between flyers or are missing. The site will show whatever the admin sets, so this only needs answering once.

## Conflicts between flyers — RESOLVED
Client decision (10 Nov 2026): use one value; Stella will change it in the admin if needed. Seed uses the values in the last column.
| Trip | Flyer A | Flyer B | Used in seed |
|---|---|---|---|
| Cairo by Plane — One Day | €250 (Cairo flyers) | €260 (Excursions price list) | €250 |
| Cairo by Bus — 2 Days | €195 (Five journeys flyer) | €190 (Excursions price list) | €195 |
| Mount Sinai & St Catherine — times | pickup 20:00, back ~13:30 (flyer) | 19:30 → 13:00 next day (price list) | flyer |
| Jerusalem & Bethlehem — departure | 21:00, ~28 h (flyer) | 19:30–24:00 (price list) | flyer |
| Cairo by Plane — One Day — times | departure 04:30–06:00 | 04:30 – 21:00 | both shown |

## Prices missing ("On request" for now)
- Ras Mohammed — private car (Xpander)
- Arabian Night Safari (private)
- Nabq National Park — private morning / afternoon tours
- Camping in Nabq National Park
- Wishwash Lake & Canyon (private only)
- Sharm El Sheikh City Tour (private)

## Units to confirm
- Quad Bike Safari: Single €15 / Double €20 — is Double per quad (2 people) or per person?
- Super Safari 5×1: Single €35 / Double €55 — same question.
- Buggy Car Safari €35 — per buggy or per person? How many per buggy?
- Private Speed Boat €100 / hour — max people? minimum hours?
- Private yacht — not on any flyer; was only in our mockup. Offer it or not?

## Rules we still need
- Children: age bands and prices (free under X? 50 %?).
- Private option on group trips: is there a standard surcharge? (Our mockup used +60 %, that number was invented.)
- How many days in advance can people book? Same-day bookings?
- Cancellation policy (for the legal page).
- Which WhatsApp number receives website requests: +20 100 860 5904 or +20 106 901 2881?
- Legal name for the footer: "Stella Sharm Tours by Heroes Travel"?

## Packages (All of Egypt)
The four packages in `catalog.json` are **suggestions** made from real trips. They are seeded as drafts with no price; Stella sets a package price in the admin (the admin shows the sum of the trips next to it).
