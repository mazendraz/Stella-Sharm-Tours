# Stella Sharm Tours — project kit

الحالة الحالية: واجهة الموقع والـAPI وقاعدة PostgreSQL والـworker منفّذين ومختبرين محليًا، مع ٧ لغات أساسية.
محتوى الـ٣٨ رحلة والمجموعات والواجهة والنماذج مترجم للسبع لغات ومحفوظ في المشروع وقاعدة البيانات، من غير خدمة ترجمة أو اشتراك. [نتائج فحص اللغات](docs/core-languages-verification.md).
راجع [تشغيل الباك إند](apps/api/README.md)، و[تشغيل الفرونت](apps/web/README.md)، و[نتائج التحقق والقيود](docs/backend-verification.md).
الشغل بترتيب أرقام الملفات، مع الوقوف بعد كل ملف حسب طلب المستخدم. طلبات الحجز والأسعار ورسائل Mailpit شغالة محليًا؛
ملف 03 أضاف تجهيزات التكامل والتشغيل والنشر والنسخ والاستعادة؛ راجع [دليل التشغيل](docs/RUNBOOK.md).
لوحة الإدارة اتنفّذت واتاختبرت محليًا في ملف 05 بالسبع لغات؛ راجع [نتائج اختبار الإدارة](docs/admin-verification.md). تجربة موظفين فعليين والنشر واعتماد النصوص والحقوق القانونية والأداء الميداني لسه مطلوبين قبل الإطلاق.

ملخص سريع بالعربي:

- **CODEX_PROMPT.md**: البرومبت اللي هتلزقه في Codex عشان يبني المشروع كله مرة واحدة.
- **AGENTS.md**: أول فايل يقراه Codex. فيه القواعد الأساسية وترتيب قراية الملفات.
- **docs/**: الخطط كلها، ومكتوبة بالإنجليزي عشان Codex:
  - `00-overview`: الصورة الكاملة للمشروع، الستاك، شكل الريبو، والمراحل.
  - `01-frontend-plan`: الموقع موبايل فيرست، بالتصميم والأنيميشن بالمللي ثانية والصفحات.
  - `02-backend-database-plan`: الـ API، وسكيما PostgreSQL، وحساب الأسعار، والميديا.
  - `03-integration-plan`: إزاي الأجزاء تكلم بعض، والبيئات، والـ CI/CD، والنشر على الـ VPS، والباك أب.
  - `04-security-plan`: الحماية، والصلاحيات، وتأمين السيرفر، والـ GDPR.
  - `05-admin-dashboard-plan`: لوحة تحكم معمولة للموبايل.
  - `08-i18n-plan`: اللغات — ٧ لغات أساسية (EN/IT/ES/FR/DE/RU/TR)، وباقي اللغات عبر الترجمة الآلية من الإنجليزي وفق إعدادات المزود والتغطية.
  - `06-build-order`: الترتيب اللي Codex هيمشي عليه من الأول للآخر، وبعد كل مرحلة اختبار لازم ينجح قبل ما يكمل.
  - `DECISIONS`: الإجابات الافتراضية لأي سؤال مفتوح، عشان Codex مايقفش يسأل.
- **data/**:
  - `catalog.json`: 38 رحلة حقيقية من فلايرات Stella، و7 مجموعات منها Private. ده مصدر الـ seed بتاع الداتا بيز.
  - `trips-for-client-review.csv`: نفس الرحلات في جدول يتبعت للكلاينت يراجعه.
  - `PRICE-CHECK.md`: الأسعار اللي فيها تعارض أو ناقصة، ولازم الكلاينت يرد عليها.
- **assets/**:
  - `video/`: الكليبات المتقصوصة من الفيديوهات وجاهزة للويب.
  - `video-stock/` و`images/stock/`: صور وفيديوهات ستوك.
  - `ASSETS.md`: حقوق كل فايل.
- **reference/**:
  - `mockup/`: ملفات Concept E.
  - `flyers/`: فلايرات الكلاينت الأصلية، للمرجع بس.

Start here: `AGENTS.md` → `docs/00-overview.md`.

## Fresh local setup — five commands

Prerequisites: Node 22, pnpm 10.34.9, Docker Compose v2 and FFmpeg/ffprobe
with H.264/HEVC support. On Windows set `FFMPEG_PATH`/`FFPROBE_PATH` if the
tools are not in `.tools/ffmpeg/`; on Linux they can come from PATH.
`engine-strict` refuses other Node majors: if your default Node is newer, put
`.tools/node_modules/node-win-x64/bin` (Windows) first on `PATH`, and make sure a
real `pnpm` executable is on `PATH` (Turbo cannot use a shell alias). Browser
tests need Playwright's pinned Chromium: `pnpm exec playwright install chromium`
(or set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome).
Run from the repository root **only for a fresh checkout**:

```sh
pnpm install --frozen-lockfile
pnpm dev:prepare
docker compose --env-file .env -p stella-kit-dev -f infra/docker-compose.dev.yml up -d
pnpm db:prepare
pnpm dev
```

`dev:prepare` verifies the pinned local password blocklist and generates unique,
ignored development credentials; it refuses to overwrite existing configuration.
`db:prepare` applies migrations and imports the actual catalog/media, including
all seven core languages. First media processing takes several minutes.
The new owner's one-use setup URL is saved to `.local/admin/owner-setup.txt`,
not printed by this generated setup. Initial local email is `owner@example.test`;
change `SEED_OWNER_EMAIL` in `.env` before the first seed if required. Use the
setup screen and an authenticator; there is no default password. For an expired,
unfinished development setup run `pnpm admin:setup-link`.

Open [website](http://localhost:3000), [dashboard](http://localhost:3001)
and [local mail](http://127.0.0.1:18025). API is on :4000. Bookings send only
to local Mailpit; no payment or WhatsApp message is sent automatically.
For this **existing** checkout, keep its configuration and database volume:
start the same explicit Compose project above, then `pnpm dev`. Do not rerun
setup or delete volumes. See [API details](apps/api/README.md).

## Add or change a trip

Sign in as owner/manager, open **Trips → Add**, choose the collection and slug,
and write the title in EN/IT/ES/FR/DE/RU/TR. Save the draft, then complete Basics,
Schedule, Prices, Day plan, Items, Media and SEO. Use the appropriate price unit;
leave an unknown amount as **On request**. Prices are stored once in the database.
Supply all seven versions of changed text and media alt text together.
Upload images/video through Media and verify the rights before publication.
Use **Preview as visitor**, then publish. Editors submit drafts for manager
review. Check the public result in the seven languages; Undo/history restore
content or price mistakes. New trips do not create homepage hero slides:
configure **Homepage → Hero videos** independently.

## Deploy and recover

Deployment targets the client's Ubuntu VPS. Follow [server preparation](infra/server-setup.md)
and [operations runbook](docs/RUNBOOK.md): configure separate staging/production
secrets, real DNS/TLS/SMTP and encrypted off-site storage; accept the same tested
immutable images in staging before production. The scripts perform migrations,
readiness checks and rollback. Remote access, CI and go-live have not been run.
The remaining acceptance checklist is in [file 06 verification](docs/build-order-verification.md).

Database dumps are under `$DATA_DIR/backups/` (default
`/srv/stella/production/backups/`), retained locally for seven days. Nightly Cairo
02:30 backups send the dump and media/originals to the owner's encrypted
`RESTIC_REPOSITORY` when configured; otherwise off-site protection is incomplete.
Credentials and recovery keys stay outside Git and screenshots. Restore and
verify staging first using the runbook; do not restore production with the
staging command. [Ownership and access](docs/OWNERS.md) lists who must be assigned.

## Original one-run workflow

File 07's [scaffold verification](docs/scaffold-verification.md) records the
frozen install/tooling/health checks. CI now enforces formatting and uses separate
`pnpm security:scan:source` / `pnpm security:scan:history` commands; the latter
requires full, committed Git history and fails on empty/shallow repositories.
`pnpm test:security:history` verifies that boundary with synthetic local histories.
Browser tests save screenshots in the ignored `test-results/screens/`; run them
with `UPDATE_SCREENS=1` only to refresh the reviewed copies in `docs/screens/`.
Generated Drizzle/OpenAPI snapshots remain owned by their generators.

The original workflow below is retained as reference. The active user instruction
overrides it: complete one numbered file, report its status, and wait before
starting the next file. Current handoff: full local website/API/dashboard
implementation; file 06 reconciles its verification and external launch gates.

1. Create an empty repo and copy this whole folder in as-is.
2. Paste the prompt from `CODEX_PROMPT.md` into Codex. It runs M0 → M7 from `docs/06-build-order.md`, checks a gate after each milestone and keeps going.
3. If the session stops midway: _"Continue docs/06-build-order.md from the first unticked box."_
4. At the end, read `QUESTIONS.md` and send the client's answers back to Codex (or change them in the admin).

# Local staff dashboard

The implemented dashboard runs at `http://localhost:3001` with the local API and
worker. See [admin usage](apps/admin/README.md) and
[verification / launch gates](docs/admin-verification.md). No default password
is created. `pnpm admin:setup-link` writes an unfinished development owner's
private one-use setup link/email to `.local/admin/owner-setup.txt`; it refuses
to overwrite an established password. Keep that file out of shared logs/chat.
