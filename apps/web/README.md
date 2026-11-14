# Public frontend

Node 22 and pnpm 10 are required. The app uses Next.js 15 App Router.
The normal application reads the real public API, never a catalog file or fixture.

## Normal development

From the repository root:

```powershell
pnpm install
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm dev:web
```

Configure the API and media URLs in the local file. The backend now exists;
use [its setup guide](../api/README.md) to generate matching local credentials,
start PostgreSQL/API/worker and load the real catalog. API outages display an
unavailable state instead of invented catalog data.

## Isolated visual review before backend implementation

In one terminal:

```powershell
pnpm preview:fixture
```

In another:

```powershell
Copy-Item apps/web/.env.preview.example apps/web/.env.local
pnpm dev:web
```

Open http://127.0.0.1:3000/en. The fixture reads the supplied catalog and serves
processed copies of licensed stock images on loopback :4100. It is read-only:
request submissions deliberately fail. Only the browser contract test stubs a
success response. Do not deploy this fixture or its preview environment.

This workstation also has ignored tools under .tools/ because pnpm was initially
absent and the system Node was 24. They do not replace the standard prerequisites.

## Verification

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter @stella/web build
```

For browser QA, start the fixture and a production web build/start with the preview
environment, then run pnpm test:e2e. Tests use the installed Chrome channel.
Screenshots go to docs/screens; Playwright traces are ignored.
The executable response contract and later integration requirements are in
docs/frontend-api-contract.md. Local fonts and licenses are recorded in
src/fonts/SOURCES.md; builds do not contact Google Fonts.

The seven core dictionaries are EN/IT/ES/FR/DE/RU/TR; native approval is pending.
Real request persistence, local SMTP, server pricing and API-driven price/hero
revalidation are verified in [backend evidence](../../docs/backend-verification.md).
`pnpm test:e2e:api` targets that isolated local stack. The admin UI, deployment,
external providers, legal copy and production media permissions remain later
acceptance work. UI fallback content is marked with its actual language.
