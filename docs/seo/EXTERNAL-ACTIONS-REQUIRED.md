# External actions and owner decisions

Nothing here was done or verified from the codebase. Each item says who must
act and what the code side already supports.

## Owner decisions

| #   | Decision                                            | Options                                 | Code support                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Allow AI model training on public pages?            | **Keep allowed** (today) or **opt out** | Set `AI_TRAINING_CRAWLERS=block` in the web env to disallow GPTBot, Google-Extended, Applebot-Extended, ClaudeBot, CCBot, meta-externalagent. Search/answer crawlers stay allowed either way. Note: Google-Extended also controls grounding in Gemini apps; blocking it never affects Google Search or AI Overviews. |
| D2  | Confirm guide languages per trip (e.g. Italian)     | yes/no per trip                         | Needs a small admin field; nothing is claimed until confirmed                                                                                                                                                                                                                                                        |
| D3  | Confirm legal entity and licence details to publish | —                                       | Settings `legal_entity`, legal pages                                                                                                                                                                                                                                                                                 |
| D4  | IndexNow for Bing/Yandex on publish                 | yes/no                                  | Proposed worker job; needs a key file                                                                                                                                                                                                                                                                                |

## Business information required

- Cancellation and refund terms; terms; privacy policy (all 7 languages).
- Payment method and timing (cash/card on the day?).
- Pickup areas and times per trip; extra costs (park fees, tips, drinks).
- Age limits, fitness and accessibility notes per trip.
- Company facts for an About page (founding, office, team — only if true).
- Opening hours in a structured form (for `openingHoursSpecification`).

## Accounts and infrastructure

| #   | Action                                                                    | Who               | Detail                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **`www` host**                                                            | VPS/DNS operator  | `www.stellasharmtours.com` does not resolve. Add an A/AAAA (or CNAME) record, then a Caddy site block `www.{$WEB_HOST} { redir https://{$WEB_HOST}{uri} permanent }`. Add the block only after DNS exists, or certificate issuance will retry and log errors. |
| E2  | Google Search Console                                                     | owner             | Verify the domain property (DNS TXT); submit `https://stellasharmtours.com/sitemap.xml`; check Page indexing, hreflang reports, Core Web Vitals; review the generative-AI controls only if the owner wants to limit AI features.                              |
| E3  | Bing Webmaster Tools                                                      | owner             | Import from Search Console; submit the sitemap.                                                                                                                                                                                                               |
| E4  | Google Business Profile, Bing Places, Apple Business Connect, Tripadvisor | owner             | See `LOCAL-SEO-ACTION-PLAN.md`; add profile URLs to Settings → social links.                                                                                                                                                                                  |
| E5  | PageSpeed Insights / CrUX                                                 | dev               | Use an API key (the keyless quota was exhausted on 2026-11-27) and record mobile results for `/en`, `/it` and one trip page.                                                                                                                                  |
| E6  | Rich Results Test + validator.schema.org                                  | dev, after deploy | One URL per page type.                                                                                                                                                                                                                                        |
| E7  | CDN / firewall check                                                      | VPS operator      | Confirm no bot challenge or rate limit blocks Googlebot, Bingbot, OAI-SearchBot, PerplexityBot. The repo's Caddy config has none; anything in front of it was not visible.                                                                                    |
| E8  | Analytics goals                                                           | owner + dev       | In Umami, track `request_submit_ok` and `whatsapp_click` (already emitted) by landing page and referrer, including AI referrers. No personal data.                                                                                                            |
| E9  | Native review                                                             | translators       | SEO strings added on this branch and all trip content (open item in `docs/OWNERS.md`).                                                                                                                                                                        |
