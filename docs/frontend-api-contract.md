# Frontend public API contract

The web app reads only the API in normal operation. It never imports the catalog,
fixtures, original media or reference files. Database implementation remains in
file 02; this contract makes the frontend integration concrete.

Executable response schemas: packages/shared/src/public-contract.ts.
Text fields are { text, lang }: the API resolves human → machine → EN and
provides the actual language so fallback text carries lang="en".
Responses are published content only, without editorial notes or private data.
Money is numeric EUR, null means on request. Slugs are stable ASCII identifiers.

- GET /v1/public/locales → localeSchema[] (only live/covered languages).
- GET /v1/public/site?locale= → siteSchema: contacts, public site settings,
  enabled locales, ordered/scheduled hero slides, featured/private trip DTOs,
  private perks, how-it-works steps, pickup areas, public social links.
  The required home block contains translated private_heading/private_text,
  build_heading/build_text and contact_heading/contact_text; map_image is optional.
- GET /v1/public/collections?locale= → collectionSchema[] with counts, minimum
  primary price, maximum trip days and up to three media previews.
  The virtual Private collection's minimum must use effective private prices;
  an unknown private surcharge cannot advertise the group price as private.
- GET /v1/public/collections/:slug?locale= → { collection, trips, combo }.
  Private is virtual and private-only trips appear first in Private mode.
  Draft packages are excluded; an empty All of Egypt still offers the builder.
- GET /v1/public/trips/:slug?locale= → tripSchema. A published package uses this
  shared detail route; parts include their own price/format data for sum estimates.
- GET /v1/public/faq?locale= → faqSchema.
- GET /v1/public/pages/:key?locale= → pageSchema, 404 if not yet supplied.
- GET /v1/public/messages?locale= → flat ICU key/value map for an auto locale.
- POST /v1/requests → bookingSchema; response confirmationSchema. This shared
  input includes optional price_id and hours per item so a selected alternative
  price and hourly quantities can be recomputed by the backend. Unknown fields,
  estimates and client-generated references must never be trusted.

Processed media URLs must accept the requested w width (480/768/1200/1920) and
return the appropriate processed variant; the image loader never resizes originals.
media.video contains vertical/horizontal URLs and poster = media.url. Unknown
rights are not played. Public DTOs should exclude unknown-rights media entirely.
First hero poster is priority. Videos are muted, visible-only and data-saver aware.

The web caches reads for 60 s with collection:, trip:, site, locales and ui: tags.
POST /api/revalidate requires X-Revalidate-Secret (at least 32 characters) and
a strict { tags: [...] } body. The API worker calls it after a write.
Request POST goes directly from the browser to NEXT_PUBLIC_API_URL; configure
CORS for the exact website origin. No cookies or personal data enter analytics.

## Isolated verification

tests/fixtures/server.mjs is a read-only test fixture on loopback :4100.
It reads the real catalog for UI tests and deliberately rejects booking POST
with 501. The success-contract test intercepts the response in Playwright only.
This fixture is not an API implementation, database substitute or deployment target.
The normal .env.example points to :4000 and no automatic fixture fallback exists.

Backend-dependent gates remain pending: real DB prices/persistence, staff email,
admin reorder/price revalidation, coverage/provider translations and real legal content.
