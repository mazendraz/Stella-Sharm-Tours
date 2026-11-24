# Production readiness — Stella Sharm Tours

**Verdict: NOT READY** for production traffic. **READY FOR STAGING** once BUG-05 is fixed.

The application core is in good shape: security controls are strong, the booking and price logic is correct and well tested, and the deployment design is careful. Two things block production. First, a confirmed defect: after every deploy the public website can show trips and pages that staff have withdrawn (BUG-05). Second, the project's own external launch gates (VPS hardening, real HTTPS, SMTP, off-site restore, alerting, legal approval) are still open and could not be verified here.

## Gate assessment

| #   | Gate                           | Status                             | Evidence / reason                                                                                                                                                     |
| --- | ------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Functional correctness         | **Fail**                           | BUG-05 (withdrawn content reappears after restart); BUG-06 (invalidations stopped in a long-running process). API/DB behaviour itself passed 70/70 integration cases. |
| 2   | Security                       | Pass (code)                        | No medium+ findings; 110-route auth sweep clean; probes clean. VPS not verified.                                                                                      |
| 3   | Authentication & authorization | Pass                               | Argon2id, mandatory MFA (owner/manager), CSRF, RBAC; integration + sweep                                                                                              |
| 4   | Data integrity                 | Pass (DB) / **Fail (public view)** | Transactions, idempotency and constraints verified; public site can diverge from DB (BUG-05/06)                                                                       |
| 5   | Error handling                 | Pass                               | Typed error envelope; 503 + Retry-After on catalog outage (prior evidence); worker throws on failed revalidation                                                      |
| 6   | Reliability                    | **At risk**                        | BUG-06 root cause unknown; no cache-correctness monitoring                                                                                                            |
| 7   | Performance                    | Partial                            | Lab latencies fine; LCP target (2.5 s) still missed per repair plan 6B                                                                                                |
| 8   | Scalability                    | Adequate for scope                 | Single VPS; catalog reads O(catalog) but cached                                                                                                                       |
| 9   | External integrations          | Not verified                       | SMTP, Web Push, translation provider mocked in tests                                                                                                                  |
| 10  | Build reproducibility          | Pass                               | Frozen lockfile, digest-pinned base, per-SHA images; `main` CI green                                                                                                  |
| 11  | Deployment safety              | Pass (design)                      | Locks, env checks, backup before migrate, health-gated rollback; not run on the VPS                                                                                   |
| 12  | Monitoring                     | **Incomplete**                     | Health checks only; alerting to host journal; no external alert verified                                                                                              |
| 13  | Logging                        | Partial                            | Error reporting by code only (no PII); web/worker silent on success, which made BUG-06 hard to see                                                                    |
| 14  | Backup & recovery              | Partial                            | Restore/scrub integration-tested; off-site restore not rehearsed                                                                                                      |
| 15  | CI/CD integrity                | Pass with gaps                     | Strong gate; missing drift check, restart scenario, staging-acceptance enforcement                                                                                    |
| 16  | Documentation                  | Pass with gaps                     | Thorough; local toolchain (Node 22 from `.tools`) and browser install steps need noting                                                                               |
| 17  | Maintainability                | Adequate                           | Large route modules; mixed migration modes (BUG-01)                                                                                                                   |
| 18  | Operational readiness          | **Incomplete**                     | Named operators, alert recipients, staff rehearsal outstanding (repair plan 7B/7C)                                                                                    |

## Outstanding blockers

1. **BUG-05** — fix (ephemeral web cache) and add the restart regression to CI.
2. **BUG-06** — at minimum a synthetic API-vs-page monitor with a named recipient before go-live; root-cause investigation in staging.
3. Repair-plan launch gates still open: 6B (mobile LCP), 7B (push retry/alerting/SMTP/off-site restore), 7C (VPS/HTTPS hardening, staging security review, legal approval, staff rehearsal).

## Release risks after the blockers

- BUG-01 can block the next schema change's deploy (fails safely).
- Dev-tooling advisories keep the full audit red and Dependabot is failing (SEC-01).
- Production deploys are not technically tied to a staging sign-off (SEC-02).

## Go / no-go

**No-go** for production today. The path to **go** is short on the code side: one compose change for BUG-05 plus a monitor for BUG-06. The external launch gates are owner and operations work that this audit could not perform.
