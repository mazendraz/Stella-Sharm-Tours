# External actions, owner decisions and approvals

Updated 2026-11-28. Items are split into **owner decisions**, **business facts
to confirm**, **work that needs the owner's accounts**, and **work the team can
do without them**. Nothing here was done on the owner's behalf.

## A. Owner decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                     | Options                                                                                                    | Code support (this branch)                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | AI crawlers. Three separate switches in the web env (`allow`/`block`, default `allow`): **AI search** (`AI_SEARCH_CRAWLERS`: OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User), **AI training** (`AI_TRAINING_CRAWLERS`: GPTBot, ClaudeBot, Applebot-Extended, CCBot, meta-externalagent), **Google-Extended** (`GOOGLE_EXTENDED`) | Recommended for visibility: keep AI search **allowed**. Training and Google-Extended are the owner's call. | `apps/web/src/lib/robots-policy.ts`. Google-Extended is one token for both Gemini training **and** grounding in Gemini apps / Vertex AI; blocking it never affects Google Search or AI Overviews. Perplexity says it does not train foundation models. Current production: everything allowed. |
| D2  | Guide languages per trip (especially Italian)                                                                                                                                                                                                                                                                                                                                | yes/no per trip                                                                                            | Facts go into trip notes or highlights per language until a dedicated field exists. Nothing is claimed before confirmation.                                                                                                                                                                    |
| D3  | Legal entity, licence number, address to publish                                                                                                                                                                                                                                                                                                                             | —                                                                                                          | Settings `legal_entity`, `address`; legal pages in Admin → Pages                                                                                                                                                                                                                               |
| D4  | IndexNow (Bing, Yandex, Seznam) on publish                                                                                                                                                                                                                                                                                                                                   | yes/no                                                                                                     | Not built; needs a key file and a worker job. Do **not** use Google's Indexing API (job postings and livestreams only).                                                                                                                                                                        |
| D5  | Analytics: keep Umami only, or add GA4                                                                                                                                                                                                                                                                                                                                       | Umami (no cookies, no consent banner) / GA4 (needs a consent banner in the EU/UK)                          | The site emits `request_submit_ok` and `whatsapp_click` without personal data.                                                                                                                                                                                                                 |
| D6  | Approve the automatic search titles/descriptions per trip, or write own                                                                                                                                                                                                                                                                                                      | Admin → Search (SEO) → Tour pages → "Save automatic texts as our own", then edit                           | Built.                                                                                                                                                                                                                                                                                         |

## B. Business facts to confirm (blocks content)

- **Per tour:** 343 open questions in `TOUR-VERIFICATION-CHECKLIST.md`
  (description, exclusions and fees, what to bring, pickup areas and times,
  guide languages, age and health limits, documents, cancellation/weather).
- **FAQ:** 60 candidates in `FAQ-CANDIDATES.md`; 18 can be answered from how
  the site works or from published trip data, 42 need the owner or legal.
- **Policies:** terms, privacy, cancellation/refund (all seven languages,
  legal review). The pages exist and stay `noindex` until approved.
- **Company:** legal name, licence (if held), office address and opening hours
  (structured), founding year only if documented, team members who agree to be
  shown, official social profiles.
- **Payments:** method, currency, timing, deposit (the site never takes
  payment).
- **Media rights:** which photos and videos are Stella's own
  (`rights_status`), so `VideoObject` and original-photo signals can be used.

## C. Needs the owner's accounts (step by step)

| #   | Action                              | Steps                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | **www**                             | DNS is already done (`www` is a CNAME of the apex, checked 2026-11-28; HTTPS failed because Caddy had no site for it). The Caddy block is on this branch and takes effect on the next deploy. After deploy: `curl -I https://www.stellasharmtours.com/it/` must return `308` to `https://stellasharmtours.com/it/`.                        |
| E2  | Google Search Console               | 1) Add a **Domain** property `stellasharmtours.com` with the DNS TXT record. 2) Submit `https://stellasharmtours.com/sitemap.xml`. 3) Add the developer as a restricted user. 4) After 2–4 weeks check page indexing reasons and Core Web Vitals (field data). 5) URL-inspect `/it` and one trip page after deploy.                        |
| E3  | Bing Webmaster Tools                | Sign in → Import from Search Console → confirm the sitemap. Bing data also covers Copilot.                                                                                                                                                                                                                                                 |
| E4  | Google Business Profile             | Create or claim with the exact trading name, the office address shown on the site (pin matches `officeGeo`), phone/WhatsApp, category "Tour agency", hours, website `https://stellasharmtours.com/en`. Upload original office, team and trip photos. Add the profile URL to Admin → Settings → social links (it then appears in `sameAs`). |
| E5  | Tripadvisor                         | Claim or create the listing under Tours/Activities with the same name, address and phone (NAP identical to site and GBP). Never import or copy reviews.                                                                                                                                                                                    |
| E6  | Bing Places, Apple Business Connect | Same NAP as GBP; Bing Places can import from GBP.                                                                                                                                                                                                                                                                                          |
| E7  | GA4 (only if D5 = GA4)              | Consent banner first; then the tag; mark `request_submit_ok` as a key event; channel group "AI referrals" for chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai.                                                                                                                                             |
| E8  | PageSpeed Insights API key          | Google Cloud key restricted to the PageSpeed API; run mobile tests on `/en`, `/it`, one collection and one trip page monthly. CrUX field data only appears with enough Chrome traffic.                                                                                                                                                     |
| E9  | CDN / firewall                      | Confirm nothing in front of Caddy (hosting firewall, DDoS service) challenges Googlebot, Bingbot, OAI-SearchBot, PerplexityBot or Claude-SearchBot. The admin live check shows what robots.txt allows; it cannot see a firewall.                                                                                                           |

The admin's **Search data** tab shows each account as "Connection required"
until it is connected. It never shows sample numbers.

## D. Work the team can do without the owner's accounts

- Deploy this branch (after approval) and run `pnpm seo:check --base https://stellasharmtours.com`.
- Fill the December benchmark sheet (`docs/seo/benchmark/results/2026-12.csv`).
- Rich Results Test and validator.schema.org on one URL per page type.
- Shorten the one remaining long title (`fr/t/water-activities`, 74 characters).
- Native-speaker review of the new strings (admin SEO screen, automatic metadata templates) in IT/ES/FR/DE/RU/TR.

## E. Reputation, reviews and links (genuine only)

**Reviews (priority 1).** After each completed trip, staff send one WhatsApp
message with the direct Google review link (Tripadvisor as a second option).
Same message to every customer; no incentives, no filtering of unhappy
customers, no staff or family reviews. Reply to every review within 48 hours
in the reviewer's language. The Google Reviews branch can then show verified
Google reviews on the site; never add review markup for them (self-serving
reviews are not eligible, and the crawl check fails on it).

**Citations (priority 2).** Identical NAP on GBP, Bing Places, Apple Business
Connect, Tripadvisor, Facebook/Instagram, and any Egyptian tourism directory
where the company is genuinely listed.

**Links (priority 3, earned).**

1. Hotels and dive centres Stella really works with — a partner mention only
   where the relationship is real.
2. Italian travel media and bloggers: pitch the useful guides (Cairo plane vs
   bus, Ras Mohammed boat vs bus). Any paid placement is `rel="sponsored"`.
3. Local press and tourism events the company actually takes part in.
4. Marketplace distribution (GetYourGuide, Viator, Civitatis) is a sales
   decision, not an SEO tactic; if chosen, keep prices consistent with the site.

Never buy links, swap links at scale, or publish guest posts written only for
links.
