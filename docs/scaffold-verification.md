# File 07 — scaffold audit and verification

Local acceptance, 2026-11-13. The owner authorized file 07 after file 06;
stop before file 08. Existing products were preserved, not replaced by shells.

## Delivered phases

1. Reconciled the old M0 supporting checklist with the implemented repository.
   There are six original workspaces and a dedicated worker wrapper, seven in
   total. Web/admin/API run on :3000/:3001/:4000; the worker shares the API's
   validated config with its own DML database role and provider overrides.
2. Verified Node 22.23.4/pnpm 10.34.9, strict TypeScript, Turbo, ESLint, Prettier,
   reviewed Husky setup, lint-staged and install-script restrictions. Installed
   the project-local Husky wrapper and verified `core.hooksPath=.husky/_`;
   no global Git trust/access settings or project commits were changed.
3. Audited app env examples and health/readiness: API/web/worker use Zod; admin
   production readiness rejects missing/invalid runtime public URLs before
   deployment accepts it. Runtime URL promotion remains intact. The existing
   `stella-kit-dev` PostgreSQL/Mailpit project, roles, volumes and secrets remain.
4. Closed tooling gaps: enabled CI's formatting check, excluded generated
   Drizzle metadata/OpenAPI snapshots from hand formatting, and split source
   and complete-history secret scanning. Mechanical formatting changed no UI
   wording, translations, catalog values, schema or generated migration metadata.

The formatter also normalized older/later plan Markdown. This is not execution
or acceptance of file 08. All seven core locales remain the existing directly
authored EN/IT/ES/FR/DE/RU/TR; no translation provider was added or called.

## Secret scanning boundaries

CI checkout now uses `fetch-depth: 0` and `persist-credentials: false`.
`pnpm security:scan:source` copies only ignore-aware publishable text into an
offline, read-only, digest-pinned Gitleaks container. Private working env files,
the checkout Git config and the whole workspace are never mounted.

`pnpm security:scan:history` requires an actual HEAD and non-shallow history.
It exports a bundle of all refs and makes a mirror, retaining remote-only refs
and tags. It removes only the exported remote's configuration, not its refs.
The scanner mounts this isolated export and a trusted config, with no network,
capabilities or writable source mount. The checkout's credential headers and
uncommitted `.env` files are absent. Logs are private; chat output is metadata.
The history rules deliberately do not exempt committed `.local`/tool/env paths:
an accidentally committed secret must still fail after its file is deleted.

Both scanners pin Gitleaks to
`sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055`.
Actionlint 1.7.7 ran offline with only copied workflow text mounted, using
`sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9`.

## Observed local gates

| Gate                        | Result                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen installation         | Pass, offline manifest-only snapshot, all 7 workspaces; lock unchanged, native/lifecycle scripts disabled, live node_modules untouched |
| Unit tests                  | 105 pass, 14 files                                                                                                                     |
| Lint/typecheck/build        | Lint pass; 6 typecheck tasks and 4 build tasks pass                                                                                    |
| Formatting                  | Initially 23 reported files; maintained sources now pass; generator-owned snapshots are not rewritten                                  |
| History scanner regression  | 4 real Git/Gitleaks cases pass; details below                                                                                          |
| Workflow syntax             | Both CI/release files pass offline Actionlint                                                                                          |
| Production dependency audit | No known vulnerabilities                                                                                                               |
| App probes                  | All 6 /healthz and /readyz checks return 200                                                                                           |
| PostgreSQL/Mailpit          | PostgreSQL healthy; inbox HTTP 200, SMTP 220 greeting; no messages sent by these probes                                                |
| Development ports           | PostgreSQL :55433, SMTP :11025, inbox :18025, all bound to 127.0.0.1                                                                   |

`pnpm test:security:history` uses isolated synthetic Git repositories under
ignored `.local/scaffold/`. The four cases prove: empty history is rejected;
a clean history passes despite an uncommitted fake env token and a fake checkout
credential header; a removed fake token in a committed ignored file is found
even when reachable only from a remote-tracking ref; a shallow clone is rejected.
The positive case verifies an actual leak finding and absence of raw tokens in
the private log. No real token, recipient, root commit or remote was created.

Private logs: `.local/scaffold/{install,unit,lint,typecheck,build,format-final,
history-tests,actionlint,audit,health,source-scan}.log`. The final source scan
checked **359 text files with no leaks detected**, supplied zero private env
files and ran with networking disabled. The refreshed local previews pass all
six probes. A source scan cannot substitute for real committed-history QA;
synthetic histories are deliberately identified as test evidence.

## Reproduce and remaining acceptance

With Node 22/pnpm 10 and Docker available:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm format:check
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:security:history
pnpm security:scan:source
pnpm audit --prod --audit-level moderate
```

Do not rerun `dev:setup` over existing configs or reseed a different Compose
project. Existing startup instructions remain in the root README. Run
`pnpm security:scan:history` only against a checkout with real, complete committed
history; this project's current empty history is intentionally not a passing
history scan. No remote Actions/PR or protection settings have been exercised.

File 07 changes tooling and formatting, so file-06's 259 screenshots,
seven-language responsive/keyboard/browser evidence and measured scores are
retained, not represented as a new browser or Lighthouse run. Public mobile
LCP <2.5 s still fails; actual devices/staff, native review, legal/media approval,
staging security and VPS/off-site backup/monitoring gates remain open in
[file 06 verification](build-order-verification.md). No deployment is claimed.
