# Public website and staff dashboard

## Can customers find trips and complete requests reliably?

### Takeaway

Mixed-format itineraries, stale saved trips and date-sensitive rates can interrupt or misstate a request. All findings below describe the current working source unless explicitly labelled as historical measurements.

### Cited Findings

- **High · A mixed itinerary can fail only after the guest submits personal details.** My Trip opens every selection in Group mode. The store changes it to Private only when _every_ trip is private-only. For a private-only trip plus an ordinary trip, the subtotal accommodates the private component, the request offers Group, and the API rejects the whole request with PRIVATE_ONLY. The guest sees a generic send failure. Set valid modes from all selected trips, explain the available option, and test mixed selections. [Builder](../../apps/web/src/components/my-trip.tsx#L196), [store](../../apps/web/src/components/store.ts#L106), [form](../../apps/web/src/components/request-sheet.tsx#L287), [estimate](../../packages/shared/src/price.ts#L82), [API](../../apps/api/src/requests.ts#L81)
- **High · Unpublishing or renaming one saved trip can strand the entire My Trip list.** On reload the browser restores slugs, while trip objects start in an empty cache. One slug returning 404 rejects the entire batch, which the adapter maps to 503. The UI only renders remove controls for successfully loaded rows and disables Request. A fresh reload can therefore leave no row the visitor can remove. Return per-slug results, distinguish removed items from temporary failures, keep the other rows, and offer removal by saved slug. [Batch](../../apps/web/src/app/api/trips/route.ts#L22), [restored state](../../apps/web/src/components/store.ts#L41), [rows](../../apps/web/src/components/my-trip.tsx#L49), [request control](../../apps/web/src/components/my-trip.tsx#L192)
- **High when seasonal rates are configured · Prices can differ between form and staff, and later itinerary days can be priced against the wrong date.** Public catalog reads default to today in Cairo. Changing the dates does not refetch prices. The POST fetches one catalog priced for the start date of the whole itinerary. It calculates the actual later dates for operating-day checks only. A rate change can make the submitted price differ from the on-screen estimate or make a selected price ID invalid, and a later trip spanning a seasonal boundary uses the first day's price. Resolve quotes per planned excursion date and expose the same calculation to the form when dates or choices change. [Public catalog](../../apps/api/src/catalog.ts#L91), [validity window](../../apps/api/src/catalog.ts#L246), [client calculation](../../apps/web/src/components/request-sheet.tsx#L77), [API pricing date](../../apps/api/src/requests.ts#L51), [trip day](../../apps/api/src/requests.ts#L108)
- **Medium · A date-range hint can understate required days.** The form uses the last row's _starting_ day as the total. A two-day final excursion needs one additional day. The planner emits only its start row. Compute the inclusive end of the last trip and use this duration for the advisory. [Form](../../apps/web/src/components/request-sheet.tsx#L81), [planner](../../packages/shared/src/days.ts#L20), [warning](../../apps/web/src/components/date-range.tsx#L171)
- **Medium · Initial price choice can disagree with the visible option.** The select starts at an empty string with no matching option, so the browser presents the first non-child option. Until changed, the estimate and submitted request instead select the primary price. Sort and primary are separate fields, so these can differ. Initialize from the shared primary ID and submit that displayed ID. [Select state](../../apps/web/src/components/request-sheet.tsx#L57), [options](../../apps/web/src/components/request-sheet.tsx#L311), [calculator](../../packages/shared/src/price.ts#L3), [catalog ordering](../../apps/api/src/catalog.ts#L144)
- **Medium · A temporary catalog read failure emits a successful empty sitemap, and draft legal pages appear indexable.** Sitemap enumeration wraps every collection in the same catch and returns an empty list if any read fails. It always advertises the three legal URLs, even when those pages serve the translated pending-content placeholder and request indexable metadata. Serve the last successful sitemap or return a temporary error. Include approved legal pages only and mark drafts noindex. [Sitemap](../../apps/web/src/app/sitemap.ts#L9), [legal links](../../apps/web/src/app/sitemap.ts#L16), [fallback](../../apps/web/src/app/sitemap.ts#L42), [legal route](../../apps/web/src/app/%5Blocale%5D/legal/%5Bkey%5D/page.tsx#L30), [metadata](../../apps/web/src/lib/seo.tsx#L38)

### Inferences

- The price-selection discrepancy requires a primary price that is not first in display order. The season-boundary case requires date-limited rates. Both are supported configuration states. [Catalog fields](../../apps/api/src/catalog.ts#L285)

### Gaps

- Customer impact in production is unmeasured. The audit did not send live booking requests.

## Can staff make changes reliably?

### Takeaway

Admin editors can silently lose newer work on an ordinary slow save. Price edits have a second, independent silent-discard path.

### Cited Findings

- **High · Staff edits made during Save can disappear.** The shared editor submits a captured state, awaits the API, and replaces current form state and its clean baseline from that original snapshot. The form fields stay enabled. Edits made while the response is pending disappear and the UI can report a clean, successful save. Disable editable controls while submitting or merge each confirmed field into the latest draft with a change generation. Test typing into a second field during a delayed response. [Save snapshot](../../apps/admin/src/lib/editor.ts#L140), [overwrite](../../apps/admin/src/lib/editor.ts#L173), [section rendering](../../apps/admin/src/components/ui/editor.tsx#L202), [active input](../../apps/admin/src/screens/trip-editor.tsx#L780)
- **Medium · Inline price edits silently discard on blur.** Only Enter calls the write. Clicking elsewhere or tabbing to another control exits edit mode and discards the draft without an explanatory cue. Provide visible Save/Cancel controls and handle keyboard focus deliberately. [Price editor](../../apps/admin/src/screens/prices.tsx#L166)
- **Low · Mobile labels an ordinary tour with no price as a sum of trips.** The desktop column distinguishes missing standalone-trip prices from a package whose total derives from its components. The mobile summary unconditionally labels every row without a primary price as a sum of trips. Share the same display helper. [Desktop](../../apps/admin/src/screens/prices.tsx#L149), [mobile](../../apps/admin/src/screens/prices.tsx#L251)

### Inferences

- The save bug is especially relevant for a phone on a slow connection. Its scope includes screens using the shared editor. [Shared hook](../../apps/admin/src/lib/editor.ts#L118)

### Gaps

- No fresh authenticated staff browser acceptance or physical-device interaction was completed in this subreview. Historical admin evidence explicitly identifies its scope. [Existing verification](../../docs/admin-verification.md#L65)

## Do speed, accessibility and release evidence support sign-off?

### Takeaway

Published measurements already miss the mobile LCP budget, and four browser suites target controls that no longer exist. The current booking calendar introduces accessibility defects outside the historical home/trip scans.

### Cited Findings

- **High · Booking browser regression suites are stale.** The fixture E2E, real-API booking, private-booking and runtime tests click a removed date chip and select dial strings, while the new UI uses calendar-day buttons and ISO country values. Those steps cannot complete against the present form. Use accessible date buttons and ISO country choices. Rerun both the fixture suite and isolated real-API booking journeys at 390, 768 and 1440 px. [Fixture suite](../../tests/e2e/frontend.spec.ts#L25), [real API](../../tests/real-api/booking.spec.ts#L20), [runtime](../../tests/integration/runtime.spec.ts#L171), [private](../../tests/integration/private-booking.spec.ts#L50), [calendar](../../apps/web/src/components/date-range.tsx#L125), [country values](../../apps/web/src/components/request-sheet.tsx#L384)
- **Medium · The booking calendar exposes an incomplete accessibility grid, and the date validation focus falls on a hidden input.** The grid contains spans/buttons directly, with no rows, cells or arrow-key handling. Date error handling finds an input of type hidden and attempts to focus it. Provide a conforming grid with a single tab stop and focusable active date, or retain simple button semantics and remove the grid role. Connect the error to the interactive control and test keyboard and screen-reader journeys with the sheet open. [Calendar](../../apps/web/src/components/date-range.tsx#L115), [hidden input](../../apps/web/src/components/date-range.tsx#L175), [invalid-field focus](../../apps/web/src/components/request-sheet.tsx#L150), [W3C grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
- **Low · Controls undershoot Stella's 44 px touch-target standard.** Calendar days are 42 px tall. Desktop admin navigation defines a 32 px minimum at 1024 px and up, which also applies to larger touch tablets. Increase hit areas without inflating visible icons. The W3C AA minimum is 24 px with exceptions, so these dimensions alone establish a project-standard issue. [Calendar CSS](../../apps/web/src/app/globals.css#L2947), [admin CSS](../../apps/admin/src/app/globals.css#L3184), [W3C minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **Medium · Historical mobile LCP misses the release budget despite Lighthouse 95/100.** Latest documented three-run local medians were 2.866 s home and 2.965 s trip, against the project target under 2.5 s. Site speed for live users remains unknown. Rerun cold production builds against representative media and check the actual LCP element, request timing, bytes and rendering delay. Track p75 mobile LCP and INP after deployment. [Measurements](../../docs/build-order-verification.md#L159), [Google guidance](https://web.dev/articles/lcp)
- **Medium · Cold My Trip retrieval repeatedly loads the entire catalog.** The public web batch issues one full trip HTTP fetch per slug, up to 38, plus a site fetch. Each cold upstream trip lookup reassembles a catalog including prices, itineraries, media, and package items before finding one trip. Use a bounded batch DTO query, or a versioned per-locale snapshot read once per batch, and measure cold query counts and p95 as catalog size increases. [Web fan-out](../../apps/web/src/app/api/trips/route.ts#L22), [public endpoint](../../apps/api/src/app.ts#L243), [DB queries](../../apps/api/src/catalog.ts#L144)

### Inferences

- Past home/trip accessibility scores do not exercise an open booking calendar. The verification document itself distinguishes automated scans and manual acceptance. [Scope](../../docs/frontend-verification.md#L27)

### Gaps

- A temporary local dev server and read-only fixture were started for this subreview and stopped. Sandbox HTTP requests returned EACCES and an approved loopback retry timed out, so no fresh screenshot, field INP, real device, or screen-reader result is claimed here. The coordinator may have independent results. Earlier screenshots and documented tests remain historical evidence. [Frontend verification](../../docs/frontend-verification.md#L74)
