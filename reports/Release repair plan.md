# Stella Sharm Tours release repair plan

This checklist turns the [release audit](<Stella Sharm release audit.md>) and [language evidence](<Language and verification evidence.md>) into implementation work for the public site, admin dashboard, API, worker and deployment. Each checkbox is a separate reviewable change or acceptance task. A phase closes when its acceptance checks pass on the revision being considered for release.

For each product change, run typecheck, lint and the relevant regression tests, update the changelog and the affected project plan. Ship changed wording, errors, metadata and alt text in EN, IT, ES, FR, DE, RU and TR in the same PR. Check affected screens at 390, 768 and 1440 px, including keyboard operation. Use disposable databases for seed and restore tests. Preserve existing staff edits during upgrades.

## 1. Restore a reproducible database and test baseline

- [x] **1A · Untimed itinerary stops.** The [seed importer](../packages/db/src/seed-data.ts#L62) now accepts a missing time while retaining the stop text and order. An empty PostgreSQL 16 database seeded twice. The test verifies the six Jerusalem–Bethlehem stops and five stops on each of the two Ras Mohammed trips remain untimed and appear once. All 52 backend cases and the Docker restore/scrub case passed locally.
- [x] **1B · Return times.** All 19 supplied return times reach the seed, public DTO and trip display. Existing staff-entered times are preserved. The source inventory and hash include the new copy. PostgreSQL verified all 19 values in seven languages, and the return-time browser check passed at 390, 768 and 1440 px.
- [ ] **1C · Browser and CI checks.** Repair stale booking-calendar and phone-country selectors, the service-worker formatting failure and misleading English fixture fallbacks. Add seeded real-API, admin and language journeys to the release workflow. Run the repository’s restore/scrub test in a Docker-capable runner. Where a product case still fails, associate that failure with its repair below and keep it visible until fixed.

  The changed fixture tests passed locally at all three widths, and the restore/scrub test passed with Docker. The seeded GitHub Actions browser step is wired and still needs a run against the release checkout.

**Acceptance.** A clean installation and repeat seed succeed. All 52 backend cases execute, the restore test runs, and the browser checks reach the current controls. Record the revision and results. Newly visible product failures have a repair task and must pass before release.

## 2. Protect publication, media and privileged operations

- [x] **2A · Live homepage edits.** Publishing and live edits share headline, media, target and schedule validation. A rejected edit preserves the previous slide. Catalog serialization skips an incomplete legacy slide individually. The regression checks the homepage and trip endpoints and successfully submits a booking with such a slide present.
- [x] **2B · Media withdrawal and recovery.** The origin checks current rights for registered renditions, including earlier versions. Private previews still require a staff session. A duplicate upload retries a failed record once or restores an archived record as private. PostgreSQL regression tests and a local Caddy origin check passed.
- [x] **2C · Database privileges.** Explicit grants replace the broad legacy grants for the API and worker, including defaults on future tables. The integration suite ran API and worker paths under separate login roles and verified permission denials, notifications, media processing, authentication, audit writes, Undo, and retention.
- [x] **2D · Production dependency advisory.** Remove the unused next-intl extraction watcher and install a separate production dependency tree in Docker. The production npm audit passed and the standalone watcher and picomatch packages were absent from the web, admin and API release images. The web image passed its seven-language browser checks and the admin image rendered sign-in. [Dependency maintenance notes](../docs/dependency-patches.md)

**Acceptance.** A rejected live edit leaves the homepage working and a booking succeeds. A previously public media URL stops serving at the origin after withdrawal, authorized recovery works, runtime roles pass positive and negative permission checks, and the release satisfies the project’s dependency gate.

## 3. Make the booking request reliable from basket to staff inbox

- [x] **3A · Basket recovery and tour modes.** My Trip resolves each saved tour independently. Guests can remove a withdrawn tour or retry a temporary failure while keeping the other selections. The request sheet requires Private if any remaining tour is private-only. Browser checks covered keyboard removal, retry, both travel formats and all seven core languages at 390, 768 and 1440 px. PostgreSQL verified that the mixed itinerary rejects Group and saves both tours under Private.

  My Trip scored 90 for performance and 100 for accessibility in a mobile Lighthouse run with a restored basket on the local fixture.

- [x] **3B · One date-aware quote.** Plan service dates before selecting eligible rates. Preview and submission use the same calculation, and the chosen price ID, service dates and whole-euro amounts reach the booking snapshot. Preserve “On request” and ask the guest to review any changed quote before saving. The 45 seed price rows contain no fractional values. Existing stored rates retain their precision.

  PostgreSQL verified a mixed Private itinerary crossing a seasonal boundary after a rest day, with a two-day final excursion. The revised quote matched the stored request and WhatsApp confirmation. The accepted request queued one notification. Browser checks verified primary selection and the quote review in all seven core languages at 390, 768 and 1440 px. My Trip scored 91 for performance and 100 for accessibility in a local mobile Lighthouse run.

- [x] **3C · Dates and contact details.** The stay warning counts through the last tour’s final day, including any rest days. The booking form handles national dialing rules and pasted international numbers and shows the exact E.164 value saved and sent to staff. The API checks that value before applying the phone quota.

  Browser tests verified the stay warning, phone guidance, validation and submission in all seven core languages at 390, 768 and 1440 px. PostgreSQL and the test mail transport received the displayed value. The production dependency audit passed, and My Trip scored 90 for performance and 100 for accessibility in local mobile Lighthouse.

- [x] **3D · Safe retries.** Save the submission ID, request, confirmation and outbox entry together. The same submission recovers its original confirmation for 24 hours. Changed details cannot replace the request, and expired IDs cannot create a duplicate. PostgreSQL verified five concurrent attempts, one booking and one staff email queued. Browser tests covered lost-response recovery in all seven core languages at 390, 768 and 1440 px. The staging restore test verified that receipts are scrubbed.

**Acceptance.** Submit a mixed private/flexible basket across a seasonal boundary, with a two-day final excursion. The selected option, service dates and estimate match the stored snapshot and confirmation. Reload a basket with an unpublished trip, remove it and complete the request. Retry after a lost response and verify one booking reference and one queued staff notification.

## 4. Make staff edits, prices and exports trustworthy

- [x] **4A · Editor saves.** Preserve edits made while a previous save is in flight. Only mark the submitted values clean after acknowledgement. Test a delayed response, a failed response and a subsequent save.
- [x] **4B · Price tools.** Add explicit save/cancel behavior to inline price editing. Use consistent labels for unpriced tours and derived packages on mobile and desktop. Give bulk-price preview and apply the same supported size, or store a short-lived server-side preview. Preserve stale-preview detection.
- [x] **4C · Request filters and CSV.** Apply both date bounds to the same excursion. Reuse the same filtered query for list, count and export. Show the export scope, preserve role and reauthentication checks, and give an explicitly requested full export a complete paginated or streamed path.

**Acceptance.** Staff can save two successive edits under slow-network conditions without losing either. The largest supported price preview applies. With trips on the 1st and 10th, the request is excluded from a 4th–6th filter. A filtered CSV matches the visible selection and contains only those customers.

## 5. Verify all seven languages through publication and confirmation

- [x] **5A · Review and publishing.** Reject blank reviewed fields and enforce the seven-language rule at publication. Make repository-managed UI strings clearly identifiable in admin. Allow editorial reviews of departure, return and itinerary time labels to save, appear publicly and undo correctly. Fix the FAQ invalidation tag.
- [x] **5B · Messages and navigation.** Localize WhatsApp day/night counts, staff and authentication emails, schedule notices and the public 404. Preserve the visitor’s language on the recovery link. Test singular and plural forms, especially Russian.
- [x] **5C · Additional locales.** Exclude the seven core languages from all machine-translation paths. Align supported locale identifiers with provider capabilities and set direction from locale metadata. Exercise enablement, coverage thresholds, fallback and indexing with the test provider, including an RTL locale.

**Acceptance.** For EN, IT, ES, FR, DE, RU and TR, verify the actual seeded homepage, trip, booking confirmation and an authenticated editor. Check SEO and alt text, perform an editorial change and read it back publicly. A blank core translation blocks publication and no core text is dispatched to a provider. Record native-speaker review separately from automated checks.

**Nov 19 local results.** The seeded mobile website passed all seven locale checks for homepage and trip copy, title metadata, media alt text, booking controls and the localized recovery page. PostgreSQL tests cover booking confirmations in all seven core languages, publication rejection, editing/undoing time labels and worker/database rejection of automated core writes. The authenticated editor passed all seven dashboard locales. Native-speaker sign-off remains open.

## 6. Improve accessibility, speed and search indexing

- [x] **6A · Booking accessibility.** Use a complete keyboard calendar pattern or simple accessible date buttons. Put error focus on a visible control and meet the project’s 44 px touch-target minimum in the calendar and dashboard navigation.
- [ ] **6B · Public and admin delivery.** Measure the homepage poster and first trip-gallery image with realistic production media. Optimize mobile variants and brand images. Load admin screens on demand and measure sign-in and an authenticated editor on a phone.
- [x] **6C · API and cache cost.** Use bounded, itinerary-specific reads for booking and My Trip. Index translations per read, invalidate only dependent pages, coalesce bulk changes and give trusted internal catalog reads an appropriate limit while retaining public throttling. Reuse the authenticated principal within an admin request and bound session-activity writes.
- [x] **6D · Search indexing.** Retain the last valid sitemap or return a retryable error on temporary catalog failure. Expose approved legal pages in the sitemap and prevent draft placeholders from being indexed.

**Acceptance.** Complete the booking form using keyboard and screen reader, including recovery from a date error. Run three cold mobile Lighthouse measurements on representative media. Target median LCP below 2.5 seconds, performance at least 90 and accessibility 100 on the tested public pages. Compare query count, p95 API latency, admin JS and session writes against a baseline, then check price edits still reach visitors within the project’s cache window.

**Nov 19 local results.** All seven mobile keyboard checks recovered from a date error and measured at least 44 px on both axes. The authenticated price-edit and Undo rehearsal confirmed cache updates. On a five-trip itinerary, the cold path fell from six HTTP reads and 66 catalog SELECTs to one read and 11 SELECTs. In 30 paired local samples p95 fell from 180 ms to 35 ms. Session activity writes occur at most once per five minutes. Next.js first-load JavaScript fell from 435 kB to 316 kB for admin, 164 kB to 129 kB for the homepage and 161 kB to 126 kB for the trip page. The isolated API-outage test returned HTTP 503 with `Retry-After: 60`. Manual screen-reader acceptance is open.

On a 390 × 844 Edge viewport with cache disabled, one unthrottled local run showed the admin sign-in field in 182 ms and the authenticated editor field in 1.14 s. The sign-in and editor loaded about 317 kB and 401 kB of encoded JavaScript respectively. The legal sitemap checks covered an unpublished placeholder and a temporary published QA page.

Three final cold mobile Lighthouse runs on the seeded poster and gallery measured a median performance/accessibility of 90/100 on the homepage and 87/100 on the trip. Both median LCPs were 3.27 seconds against the 2.50-second target. Phase 6B remains open on the mobile budgets.

## 7. Rehearse deployment, recovery and launch

- [x] **7A · Deployment isolation.** Use an immutable checkout per release/environment or lock the shared checkout before changing it. Prune runtime images while keeping migration tooling available. Rehearse overlapping deployments and rollback using disposable environments.
- [ ] **7B · Notifications and recovery.** Retry push delivery per recipient, connect an external incident alert, verify SMTP and perform a timed off-site restore into isolated staging. Verify both database and media recovery and scrub customer/staff data before any staging use.
- [ ] **7C · Release acceptance.** Complete VPS/HTTPS hardening, staging security review, media-permission checks, legal approval and retention procedures for mailbox, WhatsApp and backup copies. Run the exact release candidate through guest booking, staff notification, authorized response, catalog edit, undo and seven-language verification. Update the deployment docs with the worker, current migrations and dated results.

**Acceptance.** The intended revision and image run in each environment, rollback and restore are demonstrated, an alert reaches a named operator, and staff complete the end-to-end rehearsal. Record outstanding owner approvals explicitly before opening traffic. Begin external preparations, such as arranging SMTP, off-site storage and content reviewers, during Phase 1.

**Nov 19 local results.** Ten deployment and alert scenarios passed with simulated Docker and notification transport. The release images ran on the isolated Docker stack, including the migration service, API and worker. The staging Caddy authentication and no-indexing check passed. A disposable PostgreSQL restore removed customer, staff, session and job data. An encrypted local restic restore reproduced the 15 MiB poster and video files byte for byte. Seven-language Private bookings and email delivery passed against Mailpit. An authenticated staff member produced a localized French WhatsApp draft and persisted a request status change and its Undo in the mobile dashboard. The VPS, actual SMTP, off-site restore, named operator receipt and owner approvals remain launch gates.
