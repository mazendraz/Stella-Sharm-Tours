# File 05 — local dashboard verification

The dashboard replaces the file-03 probe scaffold. This is local implementation
and synthetic acceptance, not remote deployment or real staff sign-off. Work
stops after file 05 under the owner's numeric-file instruction.

Acceptance resumed on 2026-11-13. The long-running-container check exposed a
repeat-invalidation defect in pinned Next.js; see [the reviewed maintenance
patch](dependency-patches.md). A real-cache regression fails before the patch
and passes afterward. Keyboard reordering now advances one list position per
arrow press regardless of card geometry, including rapid repeated presses;
screen-reader position feedback is authored in all seven languages.

## Implemented phases

- A1: seven-language auth/shell, one-use setup/reset forms, mandatory/optional
  MFA, recovery, recent reauthentication, sessions, nonce CSP, install icons and
  private offline behavior. Cookie/CSRF credentials live in browser session/RAM;
  no token, customer record or draft is stored in localStorage/IndexedDB/cache.
- A2: request search/filter/detail, saved price snapshots, assignees/internal
  notes, statuses/Undo, seven customer-language WhatsApp templates, call link,
  reauthenticated CSV/privacy export/erase and optional generic Web Push.
- A3: grouped/reorderable trips, independent translated editor sections,
  private-home selection, signed preview, duplicate, database-backed prices,
  steppers/on-request/capacity/validity, signed bulk preview/apply and history.
  Collections and packages include ordering, seven-language text and DB sums.
- A4: multi-upload/progress/client resize, private processing/rights filters,
  metadata/focal points/where-used/archive, trim/poster controls, hero media
  upload/picker, schedule/device/CTA, order/buttons/keyboard drag, preview and Undo.
- A5: homepage blocks/FAQ/legal drafts, core translation review/staging, optional
  extra-language settings/budgets/glossary, business contacts, staff/session/MFA
  controls, filtered readable activity/history and account settings.

Every new dictionary string was authored directly in EN/IT/ES/FR/DE/RU/TR.
Meaning changes require all seven content fields and the review checkbox.
Untouched human/AI provenance is preserved; duplicate copies translation rows.
A core-language queue correction affects only its selected field/locale; editor
changes stage privately and require owner/manager approval before publication.
No translation provider, paid subscription or local MT engine was added for core.

## Evidence and reproduction

Use Node 22 and pnpm 10.34.9. Private generated runtime files remain in `.local`.
Never rerun the setup helper over existing configs or reseed a working database.

```bash
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e:admin
```

For Docker acceptance use the existing `stella-integration-verify` project from
[integration verification](integration-verification.md), rebuild API/admin
targets, run migrations, and start its services. Set
`STELLA_INTEGRATION_VERIFY=1` before `pnpm test:e2e:admin`. The helper rejects
other database/origin combinations. Localhost ports: gateway 4983, API 4984,
admin 4986, Mailpit 4987, QA PostgreSQL 4991. Development 3000/3001/4000 and its
55433 DB remain separate. No real WhatsApp/phone link is clicked and no external
mail/translation/push transport is used.

The dashboard suite checks seven-language login/navigation at 390×844,
768×1024 and 1440×900, automated WCAG A/AA scans, production nonces/headers,
MFA setup/recovery/reset form, UI price/request/hero edits and Undo, all-seven
content saves, actual image upload/resize/private processing/rights/alt Undo,
and owner UI → real public-site revalidation within 60 seconds. Shared media
pipeline/publication mutations run once on mobile; duplicate width runs skip
those two scenarios deliberately. Screenshots/traces and detailed logs stay
ignored under `.local/admin/` and `test-results/`.

| Check                | Result                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                 | 105 pass, including seven-language dictionaries, historical snapshots and the real Next.js repeated-invalidation regression.                                                |
| PostgreSQL           | 52 pass: auth/RBAC/CSRF/price/upload/privacy, staged review/Undo, creation/duplicate provenance, nullable media restore and backup/scrub.                                   |
| Dashboard containers | 14 pass, 4 deliberate width skips: seven locales, all 15 screens, three widths, UI saves/Undo, keyboard ordering, MFA, offline recovery and real media processing.          |
| Public containers    | 37 pass, 2 deliberate width skips: actual seven-language pages, bookings/Mailpit, previews, runtime image promotion and repeated cache invalidation.                        |
| Repeated publication | 2 additional passes on the same long-running corrected web process: owner UI price change/Undo and hero order/Undo.                                                         |
| Build/config         | Root/admin builds, typecheck/lint and actual API/web/admin Docker images pass. Fresh production/staging configs include admin URLs; promotion uses identical web image IDs. |
| Dependencies         | Production audit: no known vulnerabilities at verification time.                                                                                                            |

Repeated dashboard suites reset only login-IP/reset/token throttle buckets in
the guarded disposable QA DB; development resets only exact loopback hashes.
Production throttles are unchanged and have separate regression coverage.
An interrupted QA run is cleaned by exact synthetic account/ref/slug signatures;
working development catalog and staff edits are never reseeded.

## Security scope and remaining acceptance

ZAP's local, unauthenticated admin baseline completed with warnings: no High;
Medium 10055 is `style-src unsafe-inline`, explicitly permitted in the current
plan for React/Radix/dnd styles. Low 90004 concerns missing isolation headers;
informational alerts describe a modern non-storable app. No rule is suppressed
and the Medium is not represented as fixed. Authenticated UI/API security is
covered by real browser and PostgreSQL regression tests, not by this baseline.
Actual authenticated staging ZAP/TLS/medium+ launch review remain required.

The source secret scan sends only Git-ignore-aware, non-binary publishable text
to a digest-pinned Gitleaks container with no network, read-only files, no added
privileges/capabilities and zero private environment files. Real remote Git
history/Actions/release gates remain unexecuted.

Final source scan: **347 text files, no leaks**, including the dependency patch;
zero private environment files supplied and scanner networking disabled.
Local web/admin/API readiness probes return 200. The unfinished development
owner's private one-use setup link/email is generated without a default password.

Before launch: two real staff must perform the phone tasks and their top five
issues must be fixed; test installation/native screen readers and real HTTPS
push/SMTP, approve media/legal/native-language copy, finish VPS/remote CI/off-site
restore/monitoring/security gates, and resolve the stricter public LCP budget
already tracked in file 03. Automated Axe results are not certification or a
substitute for those checks. No live infrastructure, recipients or policy
approvals have been invented.
