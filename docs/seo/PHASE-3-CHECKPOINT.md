# Phase 3 checkpoint (SEO content, verification, AI visibility)

Living recovery file. Update after every milestone. No secrets, no customer data.
Full details: [PHASE-3-REPORT.md](PHASE-3-REPORT.md).

## Where things are (2026-11-28)

- Worktree `F:\stella-seo`, branch `feat/seo-content`, stacked on
  `feat/seo-foundation` (PR #19, open, base `main`). Phase 3 PR: base
  `feat/seo-foundation` (see `gh pr list --head feat/seo-content`).
- Protected worktree `F:\stella-project-kit` (`feat/google-reviews`,
  uncommitted, 136 status lines, HEAD `6f59b11`). Read-only; verified unchanged
  at the end of the session (status, diff hash, untracked hash, HEAD, branch).
- Local recovery ref of the interrupted state (incl. untracked files):
  `refs/recovery/phase3-wip-2026-11-28` (`29d51a4`).

## Toolchain

`.npmrc` has `engine-strict=true` (Node 22). System Node is 24; use the
project toolchain (read-only use of the other worktree's `.tools`):

```powershell
Set-Location F:\stella-seo
$env:PATH = "F:\stella-project-kit\.tools\node_modules\node-win-x64\bin;F:\stella-project-kit\.tools\node_modules\.bin;$env:PATH"
pnpm typecheck; pnpm lint; pnpm format:check; pnpm test
$env:FFMPEG_PATH = "F:\stella-project-kit\.tools\ffmpeg\ffmpeg.exe"; $env:FFPROBE_PATH = "F:\stella-project-kit\.tools\ffmpeg\ffprobe.exe"
pnpm test:integration          # testcontainers: needs Docker
```

Browser QA: `node tests/fixtures/server.mjs` (:4100), copy
`apps/web/.env.preview.example` to `apps/web/.env.local`, `pnpm --filter
@stella/web build` (the standalone copy step fails on this machine without
symlink rights; `.next` is still usable), `pnpm --filter @stella/web start`,
then `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 pnpm test:e2e`. Delete
`.env.local` afterwards.

Shell `cd` does not persist between tool calls: use absolute paths and
`git -C F:\stella-seo`.

## Status

| Area                                             | State                                   |
| ------------------------------------------------ | --------------------------------------- |
| Interrupted admin routing                        | Recovered and completed                 |
| Travel guides CMS / Verification / AI visibility | Done (admin + API + public routes)      |
| Admin strings (183 keys × 7 languages)           | Done (`data/i18n/admin-content.json`)   |
| Migrations 0017 + 0018 + skip guard              | Done, validated (4 scenarios)           |
| Unit / integration / e2e / SEO crawl             | 500 / 74 / see report / 0 errors        |
| Admin browser tests for new screens              | **Not run** (needs isolated full stack) |
| Competitor research, LCP work, FAQ re-verify     | **Not started**                         |
| Commits / push / PR                              | see `git log` and the PR                |

## Next exact action

1. Review the Phase 3 PR; run `pnpm test:e2e:admin` against an isolated stack
   (fresh DB) for `/content`, `/verification`, `/visibility`.
2. Owner: answer the Verification Center items; then expand the guide drafts.
3. Do not merge Google Reviews without the migration order in the report.
