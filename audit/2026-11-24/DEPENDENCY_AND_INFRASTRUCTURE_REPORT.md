# Dependency and infrastructure report — Stella Sharm Tours

## Dependencies

| Check                                 | Result                                                                                                                                                             | Evidence                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Production tree (`pnpm audit --prod`) | **No known vulnerabilities**                                                                                                                                       | `evidence/audit-prod.txt`        |
| Full tree (`pnpm audit`)              | 9 advisories: 2 critical (tinypool via vitest), 7 moderate (vitest, @vitest/mocker, esbuild via drizzle-kit, glob/minimatch via testcontainers) — **all dev-only** | `evidence/audit-all.txt`, SEC-01 |
| Automated updates                     | Five Dependabot update jobs for exactly these packages **failed** on 2026-11-24                                                                                    | `gh run list`                    |
| Install scripts                       | Disabled for all packages (`onlyBuiltDependencies: []`); CI/Docker use `--ignore-scripts`                                                                          | `pnpm-workspace.yaml`            |
| Lockfile                              | Committed, `--frozen-lockfile` in CI and Docker                                                                                                                    |                                  |
| Version pinning                       | Exact versions; Renovate configured to pin and digest-pin Actions/images                                                                                           | `renovate.json`                  |
| Local patches                         | `next@15.5.29` patch (tag invalidation timestamp on every call) — reviewed, benign, documented in `docs/dependency-patches.md`                                     | ARCH-06                          |
| Overrides                             | `next-intl > @parcel/watcher` removed (cleared the earlier picomatch advisory); `postcss` pinned                                                                   |                                  |
| Runtime images                        | Built from `pnpm install --prod`; non-root; Debian `ffmpeg` from HTTPS mirror                                                                                      | `infra/Dockerfile`               |

Note: Renovate and Dependabot are both present (Dependabot runs are visible in Actions). Pick one to avoid duplicate/competing PRs.

## Build and toolchain

| Check                | Result                                                                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node version         | `.nvmrc` 22, `engines >=22 <23`, `engine-strict=true`. The workstation's default Node is **24.19.0**, so plain `pnpm` commands fail the engine check there; the repo ships Node 22.23.4 and pnpm 10.34.9 in `.tools/` (used for this audit). Document this in the README setup section. |
| Turbo                | Needs a real `pnpm` executable on `PATH` (not a shell function).                                                                                                                                                                                                                        |
| Typecheck            | 6/6 tasks pass (forced, uncached)                                                                                                                                                                                                                                                       |
| Lint                 | pass (`--max-warnings 0`)                                                                                                                                                                                                                                                               |
| Format               | pass                                                                                                                                                                                                                                                                                    |
| Docker build context | ~540 MB of unused media enter the context (BUG-04)                                                                                                                                                                                                                                      |

## CI/CD

| Area                 | Assessment                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions          | `contents: read` default; `packages: write` only on the image build job                                                                                                                                                                                                                      |
| Supply chain         | All actions pinned by commit SHA; no `pull_request_target`; `persist-credentials: false` in CI (not in the deploy job — SEC-05)                                                                                                                                                              |
| Coverage of the gate | format, typecheck, lint, unit, PostgreSQL integration, build, gitleaks source + full history, shellcheck, operations script tests, restic restore, fixture browser suite, **seeded** browser suite (languages, private booking, real-API admin, admin dashboard on mobile), production audit |
| Not gated            | Schema-snapshot drift (BUG-01); `git diff --exit-code` after tests (BUG-02); tablet/desktop seeded runs; full-tree audit; staging acceptance before production tag (SEC-02)                                                                                                                  |
| Duration             | ~33–36 min per run on the PR branch; `main` run for PR #1 was still finishing during the audit                                                                                                                                                                                               |
| Release              | Per-commit images on GHCR; production tags must be ancestors of `main` and `develop`; tag deploys reuse images built from `develop` pushes (a tag whose SHA was never a `develop` head has no image, so `compose pull` fails safely)                                                         |

## Infrastructure (from configuration; the VPS itself was not accessible)

| Area               | Assessment                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exposure           | Only Caddy publishes ports (80/443/443-udp). Internal paths blocked at the edge.                                                                                          |
| Containers         | `read_only`, `cap_drop: ALL`, `no-new-privileges`, `init`, pid and memory limits, log rotation (50 MB × 5)                                                                |
| TLS/headers        | HSTS preload, nosniff, frame-deny, Permissions-Policy, CSP                                                                                                                |
| Deploy safety      | flock per environment, environment/DB-name cross-checks, owner-only compose env, symlink refusal, pre-migration backup, health-gated rollback, immutable per-SHA checkout |
| Persistent volumes | **`webcache` should not be persistent** (BUG-05)                                                                                                                          |
| Backups            | nightly `pg_dump` + restic; staging restore scrubs customer/staff data (integration-tested); off-site restore not yet rehearsed (repair plan 7B)                          |
| Monitoring         | `infra/monitoring/check.sh` health gate; alert service writes to the host journal only (prior audit); no external alerting verified; no cache-correctness signal (BUG-06) |
| Secrets            | Not in Git (gitleaks on full history in CI); environment files mode 600 enforced by `lib.sh`                                                                              |

## Environment inconsistencies found

- Workstation Node 24 vs required 22 (documented above).
- Playwright 1.65 expects Chromium build 1254; the workstation has 1234 (first E2E run blocked).
- Seeded browser tests use `PLAYWRIGHT_CHANNEL=chrome` by default locally but `chromium` in CI.
