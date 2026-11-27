# SEO, AEO and GEO — index

Work from 2026-11-27 (branch `feat/seo-foundation`). Start with the audit and
the implementation report; the rest are references.

| File                                                         | What it covers                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| [SEO-AUDIT.md](SEO-AUDIT.md)                                 | Baseline and issues by severity, with status                        |
| [SEO-IMPLEMENTATION-REPORT.md](SEO-IMPLEMENTATION-REPORT.md) | What changed, files, phase status, admin module design, next steps  |
| [TECHNICAL-SEO-REPORT.md](TECHNICAL-SEO-REPORT.md)           | Metadata streaming fix, titles, robots, sitemap, performance status |
| [INTERNATIONAL-SEO-REPORT.md](INTERNATIONAL-SEO-REPORT.md)   | Languages, hreflang, Italian market notes                           |
| [STRUCTURED-DATA-REPORT.md](STRUCTURED-DATA-REPORT.md)       | JSON-LD graph, sources, valid vs rich-result eligible               |
| [KEYWORD-MAPPING.md](KEYWORD-MAPPING.md)                     | One primary intent per page, gaps                                   |
| [COMPETITOR-ANALYSIS.md](COMPETITOR-ANALYSIS.md)             | Who appears for key queries and what to do better                   |
| [AEO-GEO-STRATEGY.md](AEO-GEO-STRATEGY.md)                   | Answer-ready pages, content rules, FAQ priorities                   |
| [AI-VISIBILITY-BENCHMARK.md](AI-VISIBILITY-BENCHMARK.md)     | 55 repeatable prompts (not yet run)                                 |
| [CONTENT-ROADMAP-90-DAYS.md](CONTENT-ROADMAP-90-DAYS.md)     | What to write, in what order                                        |
| [LOCAL-SEO-ACTION-PLAN.md](LOCAL-SEO-ACTION-PLAN.md)         | NAP, profiles, reviews, partnerships                                |
| [SEO-QA-REPORT.md](SEO-QA-REPORT.md)                         | Checks added and their results                                      |
| [EXTERNAL-ACTIONS-REQUIRED.md](EXTERNAL-ACTIONS-REQUIRED.md) | Owner decisions, missing business facts, account work               |

Run the regression check anywhere: `pnpm seo:check --base <url>`.
