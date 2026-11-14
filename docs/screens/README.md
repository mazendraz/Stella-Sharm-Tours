# Screenshot handoff

The **current** file-06 set is under [current](current/), captured from the
Linux production build and the real isolated PostgreSQL/API on 2026-11-13.
The older PNGs in this directory are retained frontend-fixture evidence;
they are not the latest integrated screenshots.

- [Mobile inventory](current/mobile/index.json): 390×844, every published
  trip/collection and public page, all seven home locales, request/builder and
  collection/trip overlay states.
- [Tablet inventory](current/tablet/index.json): 768×1024, representative page
  families and the seven home locales, with the same interactive states.
- [Desktop inventory](current/desktop/index.json): 1440×900, every published
  trip/collection and public page, the seven home locales and interactive states.
- Each viewport directory also contains `private-confirmation-{locale}.jpg`
  and `confirmation-page-{locale}.jpg` for EN/IT/ES/FR/DE/RU/TR. These are actual
  local synthetic Private requests, not real customers or production bookings.
- [Admin](current/admin/): login in seven languages, the 15 authenticated
  screens, More and the generic offline page at all three sizes. These images
  are captured only under the guarded isolated QA flag, with synthetic staff
  and no actual customer inbox. Auth tokens, passwords, recovery codes and MFA
  setup secrets are not part of this screenshot set.

Most images are viewport JPEGs for usable review sizes. Representative long
public pages are full-page captures; fixed navigation appears at its viewport
position in these images. Viewport screenshots describe actual layouts, not
physical-device or native screen-reader acceptance. API data supplies every
price and fact. Draft packages and unapproved legal content retain honest
empty states; unknown-rights media remains unpublished.

Regenerate with `pnpm test:e2e:integration` against the prepared isolated stack.
For admin captures set `STELLA_INTEGRATION_VERIFY=1` and run
`pnpm test:e2e:admin`. Never point these tests at production. See
[build-order verification](../build-order-verification.md) for exact gates and
remaining launch work.
