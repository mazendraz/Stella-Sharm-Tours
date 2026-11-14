# Prompt to paste into Codex (one run)

Copy everything between the lines into Codex, with this whole folder as the repo root.

---

You are building the Stella Sharm Tours product (public website, admin dashboard, API, PostgreSQL database) from the files in this repository.

1. Read `AGENTS.md`, then every file in `docs/` in number order, then `docs/DECISIONS.md`, `data/catalog.json`, `assets/ASSETS.md`, and the approved design in `reference/mockup/E-Mobile.dc.html` and `reference/mockup/E-Home.dc.html`.
2. Execute `docs/06-build-order.md` from M0 to M7 **in one continuous run**. After each milestone run its gate, commit (`feat(Mx.y): …`), tick the box in `docs/06-build-order.md`, and continue without waiting for me.
3. Never stop to ask. For any unknown, use `docs/DECISIONS.md`; if it is not there, choose the simplest safe option, write it to `QUESTIONS.md`, and keep going.
4. Non-negotiables: self-hosted PostgreSQL (no Supabase/Firebase), no online payments, mobile first, all prices and texts from the database, EN/IT/ES/FR/DE/RU/TR + auto-translation for every other language (`docs/08-i18n-plan.md`), hero video order from the admin (`hero_slides`), the security plan in `docs/04-security-plan.md`, the **Private** feature exactly as `docs/01-frontend-plan.md` §3.0, the bright/warm look.
5. Match the mockup closely: colours, fonts (Marcellus + Manrope), radii, copy, animations and timings in `docs/01-frontend-plan.md` §5.
6. When finished, give me: what was built, how to run it locally, how to deploy, the test/Lighthouse results, and the contents of `QUESTIONS.md`.

---

Tip: if Codex's session limit cuts the run, start a new session with: _"Continue `docs/06-build-order.md` from the first unticked box. Same rules as `CODEX_PROMPT.md`."_
