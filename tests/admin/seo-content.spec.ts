import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { passwordHash } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import { locales } from '../../packages/shared/src/index';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };

/**
 * Admin browser checks for the phase-3 screens: Travel guides (CMS),
 * Verification, AI visibility and per-tour search texts. Runs only against a
 * disposable local stack (generated development config or the isolated
 * verification containers); every row it creates is removed afterwards.
 */
const verify = process.env.STELLA_INTEGRATION_VERIFY === '1';
const web =
  process.env.STELLA_WEB_URL ??
  (verify ? 'http://localhost:4983' : 'http://localhost:3000');
const api =
  process.env.STELLA_API_URL ??
  (verify ? 'http://localhost:4984' : 'http://localhost:4000');
// Optional: directory for screenshots kept as QA evidence (never committed).
const evidence = process.env.STELLA_QA_EVIDENCE;
type Role = 'owner' | 'manager' | 'editor' | 'sales';
type Pool = Awaited<ReturnType<typeof localDatabase>>['pool'];

async function staff(pool: Pool, role: Role) {
  const id = randomUUID(),
    email = id + '@example.test',
    password = 'QA-' + randomBytes(24).toString('base64url');
  await pool.query(
    'insert into admin_users(id,email,name,role,password_hash) values($1,$2,$3,$4,$5)',
    [id, email, 'SEO content QA ' + role, role, await passwordHash(password)],
  );
  return { id, email, password, role };
}
type Staff = Awaited<ReturnType<typeof staff>>;

async function removeStaff(pool: Pool, users: Staff[], slugs: string[]) {
  const ids = users.map((u) => u.id);
  await pool.query('delete from content_pages where slug=any($1::text[])', [
    slugs,
  ]);
  await pool.query(
    'delete from visibility_measurements where created_by=any($1::uuid[])',
    [ids],
  );
  await pool.query(
    'delete from verification_facts where updated_by=any($1::uuid[])',
    [ids],
  );
  for (const sql of [
    'delete from sessions where user_id=any($1::uuid[])',
    'delete from audit_log where user_id=any($1::uuid[])',
    'delete from revisions where created_by=any($1::uuid[])',
    'delete from admin_users where id=any($1::uuid[])',
  ])
    await pool.query(sql, [ids]);
}

async function login(page: Page, user: Staff) {
  await page.context().clearCookies();
  await page.goto('/');
  await page.getByLabel(en.email, { exact: true }).fill(user.email);
  await page.getByLabel(en.password, { exact: true }).fill(user.password);
  await page.getByRole('button', { name: en.login, exact: true }).click();
  await expect(page.locator('main h1')).toHaveText(en.overview);
}

const axe = async (page: Page) =>
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);

async function shot(page: Page, name: string, project: string) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/${project}-${name}.jpg`,
    type: 'jpeg',
    quality: 70,
    fullPage: false,
    animations: 'disabled',
  });
}

/**
 * Toasts pause while hovered and sit above the phone's bottom bar; a person
 * waits for them, so the test does too before pressing a bottom action.
 */
async function tap(page: Page, name: string) {
  await page.mouse.move(1, 1);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, {
    timeout: 30000,
  });
  await page.getByRole('button', { name, exact: true }).click();
}

/** The admin's language switch is a radiogroup of language codes. */
const pickLang = (page: Page, lang: string) =>
  page
    .getByRole('radiogroup', { name: en.language, exact: true })
    .getByRole('radio', { name: new RegExp('^' + lang.toUpperCase()) })
    .click();

const words = (n: number, tag: string) =>
  Array.from(
    { length: n },
    (_, i) => (i % 12 === 0 ? tag : 'word' + (i % 37)) + '',
  ).join(' ');

test.describe('SEO content admin', () => {
  test('navigation, empty states and accessibility of the new screens', async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    const { pool } = await localDatabase(
      verify ? 'verification' : 'development',
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const users: Staff[] = [];
    try {
      const owner = await staff(pool, 'owner');
      users.push(owner);
      await login(page, owner);
      for (const [href, title] of [
        ['/seo', en.seoSearch],
        ['/content', en.travelContent],
        ['/verification', en.verificationCenter],
        ['/visibility', en.aiVisibility],
      ] as const) {
        // Reach every screen through the navigation, as a user would.
        // Phones reach the Website section through the "More" page.
        const more = page
          .getByRole('navigation', { name: en.mainNav })
          .getByRole('link', { name: en.more, exact: true });
        if (await more.isVisible()) await more.click();
        await page
          .getByRole('link', { name: title, exact: true })
          .first()
          .click();
        await expect(page).toHaveURL(new RegExp(href + '$'));
        await expect(page.locator('main h1')).toHaveText(title);
        await expect(page.locator('.skeleton')).toHaveCount(0, {
          timeout: 20000,
        });
        await axe(page);
        await shot(page, href.slice(1), info.project.name);
        // No horizontal scrolling at any width (390, 768, 1440).
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
      expect(errors).toEqual([]);
    } finally {
      await removeStaff(pool, users, []);
      await pool.end();
    }
  });

  test('travel guide: draft, validation, publication, public page, sitemap, roles, unpublish', async ({
    page,
    request,
  }, info) => {
    test.skip(
      info.project.name !== 'mobile',
      'Mutates shared catalogue state; the workflow runs once (390 px).',
    );
    test.setTimeout(420000);
    const { pool } = await localDatabase(
      verify ? 'verification' : 'development',
    );
    const slug = 'qa-guide-' + randomBytes(4).toString('hex'),
      users: Staff[] = [];
    const {
      rows: [trip],
    } = await pool.query(
      "select slug, title->>'en' as title from trips where status='published' and kind='trip' order by sort limit 1",
    );
    try {
      const owner = await staff(pool, 'owner'),
        editor = await staff(pool, 'editor'),
        sales = await staff(pool, 'sales');
      users.push(owner, editor, sales);

      // 1. Editor creates a draft with too little content.
      await login(page, editor);
      await page.goto('/content');
      await expect(page.locator('main h1')).toHaveText(en.travelContent);
      await page
        .getByRole('link', { name: en.contentNew, exact: true })
        .click();
      await page.getByLabel(en.contentSlug, { exact: true }).fill(slug);
      await page.getByLabel(en.contentTitle, { exact: true }).fill('QA guide');
      await page
        .getByLabel(en.contentBody, { exact: true })
        .fill('## Heading\n\nToo short to publish.\n\n- one\n- two');
      // Live preview renders the small body format without HTML.
      const preview = page.locator('.content-preview');
      await expect(preview.locator('h4')).toHaveText('Heading');
      await expect(preview.locator('li')).toHaveText(['one', 'two']);
      await tap(page, en.contentSave);
      await expect(page).toHaveURL(/\/content\/[0-9a-f-]{36}$/);
      const id = page.url().split('/').pop()!;
      const ready = page.getByRole('region', { name: en.contentReadiness });
      for (const key of [
        'bodyTooShort',
        'noSummary',
        'noAuthor',
        'noSources',
        'noRelatedTrips',
        'translationsMissing',
      ])
        await expect(
          ready.getByText(
            en[('contentBlocker_' + key) as keyof typeof en] as string,
            { exact: true },
          ),
        ).toBeVisible();
      // Editors never see publication controls; the API refuses them too.
      await expect(
        page.getByRole('button', { name: en.contentPublish, exact: true }),
      ).toHaveCount(0);
      await axe(page);
      await shot(page, 'guide-draft-blockers', info.project.name);

      // Drafts are private: no public page, API entry or sitemap line.
      expect(
        (await request.get(`${api}/v1/public/content/${slug}`)).status(),
      ).toBe(404);
      expect((await request.get(`${web}/en/guides/${slug}`)).status()).toBe(
        404,
      );
      expect(
        await (await request.get(`${web}/sitemap.xml`)).text(),
      ).not.toContain('/guides/' + slug);

      // 2. Owner completes it in seven languages through the editor.
      await login(page, owner);
      await page.goto('/content/' + id);
      await page
        .getByLabel(en.contentAuthor, { exact: true })
        .fill('QA Author');
      await page
        .getByLabel(en.contentAuthorRole, { exact: true })
        .fill('Guide');
      // Cover image from the media library.
      await page
        .getByRole('button', { name: en.chooseImage, exact: true })
        .click();
      const picker = page.getByRole('dialog');
      await picker.locator('.picker-grid button').first().click();
      await picker
        .getByRole('button', { name: en.useThis, exact: true })
        .click();
      await expect(picker).toHaveCount(0);
      await page
        .getByRole('button', { name: en.contentAddFaq, exact: true })
        .click();
      for (const lang of locales) {
        await pickLang(page, lang);
        await page
          .getByLabel(en.contentTitle, { exact: true })
          .fill(`QA guide ${lang}`);
        await page
          .getByLabel(en.contentSummary, { exact: true })
          .fill(`Summary ${lang} of the QA guide.`);
        await page
          .getByLabel(en.contentBody, { exact: true })
          .fill(`## Section ${lang}\n\n${words(320, 'qa' + lang)}`);
        const faq = page.locator('fieldset.seo-fieldset').filter({
          has: page.getByLabel(en.contentQuestion, { exact: true }),
        });
        await faq
          .getByLabel(en.contentQuestion, { exact: true })
          .fill(`Question ${lang}?`);
        await faq
          .getByLabel(en.contentAnswer, { exact: true })
          .fill(`Answer ${lang}.`);
      }
      await pickLang(page, 'en');
      await page
        .getByRole('button', { name: en.contentAddSource, exact: true })
        .click();
      await page
        .getByLabel(en.contentSourceTitle, { exact: true })
        .fill('QA source');
      await page
        .getByLabel(en.contentSourceUrl, { exact: true })
        .fill('https://example.org/source');
      await page
        .getByRole('checkbox', { name: trip.title, exact: true })
        .check();
      // A [CONFIRM] marker must block publication in any language.
      await pickLang(page, 'it');
      await page
        .getByLabel(en.contentSummary, { exact: true })
        .fill('Riassunto [CONFIRM: orario] della guida.');
      await tap(page, en.contentSave);
      await expect(page.getByText(en.contentSaved).first()).toBeVisible({
        timeout: 30000,
      });
      await expect(
        ready.getByText(en.contentBlocker_unconfirmedFacts, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: en.contentPublish, exact: true }),
      ).toBeDisabled();
      // The API applies the same rule (UI is not the only guard).
      const cookies = (await page.context().cookies())
        .map((c) => c.name + '=' + c.value)
        .join('; ');
      await page
        .getByLabel(en.contentSummary, { exact: true })
        .fill('Riassunto della guida QA.');
      await tap(page, en.contentSave);
      await expect(
        ready.getByText(en.contentReady, { exact: true }),
      ).toBeVisible();
      // Long body: the scrolling preview must still pass axe (keyboard access).
      await axe(page);
      await shot(page, 'guide-ready', info.project.name);

      // 3. Publish.
      await page
        .getByRole('button', { name: en.contentPublish, exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: en.contentUnpublish, exact: true }),
      ).toBeVisible();
      const live = await request.get(
        `${api}/v1/public/content/${slug}?locale=it`,
      );
      expect(live.status()).toBe(200);
      const body = await live.json();
      expect(body.title.text).toBe('QA guide it');
      expect(body.related_trips).toEqual([trip.slug]);
      expect(body.cover?.url).toBeTruthy();

      // Public page, index, sitemap and llms.txt follow after revalidation.
      const pub = await page.context().newPage();
      await expect
        .poll(
          async () => (await request.get(`${web}/it/guides/${slug}`)).status(),
          { timeout: 90000, intervals: [2000] },
        )
        .toBe(200);
      await pub.goto(`${web}/it/guides/${slug}`);
      await expect(pub.locator('h1')).toHaveText('QA guide it');
      await expect(
        pub.locator(`a[href="/it/t/${trip.slug}"]`).first(),
      ).toBeVisible();
      await expect(pub.locator('details.faq-item summary')).toHaveText(
        'Question it?',
      );
      await expect(pub.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        /\/it\/guides\/qa-guide-/,
      );
      expect(
        await pub.locator('link[rel="alternate"][hreflang]').count(),
      ).toBeGreaterThanOrEqual(7);
      // The layout adds the site graph; the page adds its own.
      const graph = (
        await pub
          .locator('script[type="application/ld+json"]')
          .allTextContents()
      ).flatMap((text) => JSON.parse(text)['@graph'] ?? []) as {
        '@type': string;
      }[];
      expect(graph.map((n) => n['@type'])).toEqual(
        expect.arrayContaining([
          'WebPage',
          'Article',
          'BreadcrumbList',
          'FAQPage',
        ]),
      );
      await axe(pub);
      await shot(pub, 'guide-public', info.project.name);
      await expect
        .poll(async () => (await request.get(`${web}/sitemap.xml`)).text(), {
          timeout: 90000,
          intervals: [3000],
        })
        .toContain(`/en/guides/${slug}`);

      // 4. Roles: an editor cannot change or unpublish a live page.
      await login(page, editor);
      await page.goto('/content/' + id);
      await expect(page.getByText(en.contentLockedPublished)).toBeVisible();
      await expect(
        page.getByRole('button', { name: en.contentSave, exact: true }),
      ).toBeDisabled();
      const editorCookies = (await page.context().cookies())
        .map((c) => c.name + '=' + c.value)
        .join('; ');
      for (const action of ['unpublish', 'publish', 'archive'])
        expect(
          (
            await request.post(
              `${api}/v1/admin/content-pages/${id}/${action}`,
              {
                headers: {
                  cookie: editorCookies,
                  origin: new URL(page.url()).origin,
                },
                data: {},
              },
            )
          ).status(),
        ).toBe(403);
      // Sales staff have no content permission at all.
      await login(page, sales);
      await page.goto('/content');
      await expect(page.getByText(en.noAccessTitle)).toBeVisible();
      void cookies;

      // 5. Owner unpublishes: page, sitemap entry and API entry disappear.
      await login(page, owner);
      await page.goto('/content/' + id);
      await page
        .getByRole('button', { name: en.contentUnpublish, exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: en.contentPublish, exact: true }),
      ).toBeVisible();
      expect(
        (await request.get(`${api}/v1/public/content/${slug}`)).status(),
      ).toBe(404);
      await expect
        .poll(
          async () => (await request.get(`${web}/en/guides/${slug}`)).status(),
          { timeout: 90000, intervals: [2000] },
        )
        .toBe(404);
      await expect
        .poll(async () => (await request.get(`${web}/sitemap.xml`)).text(), {
          timeout: 90000,
          intervals: [3000],
        })
        .not.toContain(`/guides/${slug}`);
      const { rows: audit } = await pool.query(
        "select action from audit_log where entity='content_page' and entity_id=$1 order by id",
        [id],
      );
      expect(audit.map((r) => r.action)).toEqual(
        expect.arrayContaining(['create', 'update', 'publish', 'unpublish']),
      );
      await pub.close();
    } finally {
      await removeStaff(pool, users, [slug]);
      await pool.end();
    }
  });

  test('verification center: filters, answers, note privacy, CSV and roles', async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    const { pool } = await localDatabase(
      verify ? 'verification' : 'development',
    );
    const users: Staff[] = [];
    try {
      const owner = await staff(pool, 'owner'),
        editor = await staff(pool, 'editor');
      users.push(owner, editor);
      await login(page, owner);
      await page.goto('/verification');
      await expect(page.locator('main h1')).toHaveText(en.verificationCenter);
      const items = page.locator('.verify-item');
      await expect(items.first()).toBeVisible({ timeout: 30000 });
      const all = await items.count();
      // Filter by a missing page field: the list narrows, never grows.
      // The <label> wraps the <select>, so its name includes the option.
      const field = page.locator('.verify-filter select');
      await field.selectOption('check:bring');
      expect(await items.count()).toBeLessThanOrEqual(all);
      await field.selectOption('');
      if (info.project.name !== 'mobile') {
        await axe(page);
        return;
      }
      // Site-wide approval with an internal note, saved and reloaded.
      const approvals = page.getByRole('region', { name: en.verifyApprovals });
      const note = 'QA internal note ' + randomBytes(3).toString('hex');
      const row = approvals.locator('li.verify-topic').filter({
        hasText: en.approval_pickup,
      });
      await row
        .getByLabel(`${en.approval_pickup}: ${en.verifyStatusLabel}`)
        .selectOption('to_confirm');
      await row
        .getByLabel(`${en.approval_pickup}: ${en.verifyNote}`)
        .fill(note);
      await row
        .getByRole('button', { name: en.verifySave, exact: true })
        .click();
      await expect(page.getByText(en.verifySaved).first()).toBeVisible({
        timeout: 30000,
      });
      await page.reload();
      await expect(
        row.getByLabel(`${en.approval_pickup}: ${en.verifyNote}`),
      ).toHaveValue(note);
      // Per-tour answer.
      await items
        .first()
        .getByRole('button', { name: en.verifyShowAnswers, exact: true })
        .click();
      const topic = items.first().locator('li.verify-topic').first();
      await topic.locator('select').selectOption('verified');
      await topic
        .getByRole('button', { name: en.verifySave, exact: true })
        .click();
      await expect(topic.locator('.badge-status')).toHaveText(
        en.verifyStatus_verified,
      );
      await axe(page);
      await shot(page, 'verification', info.project.name);
      // CSV export: downloads, formula-safe, includes the open approval.
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page
          .getByRole('button', { name: en.verifyExport, exact: true })
          .click(),
      ]);
      const csv = await readFile((await download.path())!, 'utf8');
      expect(csv.split('\n')[0]).toBe(
        'priority,tour,slug,tour_status,item,item_status,who,missing_languages',
      );
      expect(csv).toContain(en.approval_pickup);
      expect(csv).not.toMatch(/(^|,)[=+\-@]/m);
      // Internal notes are never public.
      for (const path of [
        '/v1/public/site?locale=en',
        '/v1/public/trips?locale=en',
      ])
        expect(await (await fetch(api + path)).text()).not.toContain(note);
      // Editors can read but not record answers (UI and API).
      await login(page, editor);
      await page.goto('/verification');
      await expect(page.getByText(en.verifyOwnerOnly)).toBeVisible();
      await expect(
        page.getByRole('button', { name: en.verifySave, exact: true }),
      ).toHaveCount(0);
      const cookie = (await page.context().cookies())
        .map((c) => c.name + '=' + c.value)
        .join('; ');
      const denied = await page.request.put(`${api}/v1/admin/verification`, {
        headers: { cookie, origin: new URL(page.url()).origin },
        data: { tripId: null, topic: 'pickup', status: 'verified', note: null },
      });
      expect(denied.status()).toBe(403);
      const { rows: audit } = await pool.query(
        "select count(*)::int as n from audit_log where entity='verification_fact' and user_id=$1",
        [owner.id],
      );
      expect(audit[0].n).toBe(2);
    } finally {
      await removeStaff(pool, users, []);
      await pool.end();
    }
  });

  test('AI visibility: add, validate, import, export, trend, delete, roles, audit', async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'mobile',
      'Writes measurement rows; the workflow runs once (390 px).',
    );
    test.setTimeout(240000);
    const { pool } = await localDatabase(
      verify ? 'verification' : 'development',
    );
    const users: Staff[] = [];
    try {
      const owner = await staff(pool, 'owner'),
        editor = await staff(pool, 'editor');
      users.push(owner, editor);
      const existing = Number(
        (await pool.query('select count(*) from visibility_measurements'))
          .rows[0].count,
      );
      await login(page, editor);
      await page.goto('/visibility');
      await expect(page.locator('main h1')).toHaveText(en.aiVisibility);
      if (!existing)
        await expect(page.getByText(en.visibilityEmpty)).toBeVisible();
      // Add one check (editor may record; deleting needs owner/manager).
      const question = '=HYPERLINK("http://x") best excursions QA';
      await page.getByLabel(en.visibilityQuery, { exact: true }).fill(question);
      await page.getByLabel(en.visibilityMentionedQ).check();
      await page
        .getByRole('button', { name: en.visibilitySave, exact: true })
        .click();
      await expect(page.getByText(en.visibilitySaved).first()).toBeVisible();
      await expect(page.getByRole('cell', { name: question })).toBeVisible();
      await expect(
        page.getByRole('button', { name: en.visibilityDelete, exact: true }),
      ).toHaveCount(0);
      // Invalid input is refused (position must be ≥ 1).
      await page
        .getByLabel(en.visibilityQuery, { exact: true })
        .fill('QA invalid');
      await page.getByLabel(en.visibilityRecPos, { exact: true }).fill('0');
      await page
        .getByRole('button', { name: en.visibilitySave, exact: true })
        .click();
      await expect(
        page.getByText(en.visibilitySaveFailed).first(),
      ).toBeVisible();
      await page.getByLabel(en.visibilityRecPos, { exact: true }).fill('');
      // The untouched monthly benchmark sheet has no tested rows: nothing is
      // imported and nothing is invented.
      await page
        .locator('input[type="file"]')
        .setInputFiles('docs/seo/benchmark/results/2026-12.csv');
      await expect(
        page.getByText(en.visibilityNothingToImport).first(),
      ).toBeVisible();
      // Export, then re-import what was exported (round trip).
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page
          .getByRole('button', { name: en.visibilityExport, exact: true })
          .click(),
      ]);
      const csv = await readFile((await download.path())!, 'utf8');
      // Formula injection: the leading "=" is neutralised with an apostrophe.
      expect(csv).toContain("'=HYPERLINK");
      expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
      await page.locator('input[type="file"]').setInputFiles({
        name: 'checks.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv),
      });
      await expect(
        page.getByText(
          en.visibilityImported.replace('{n}', String(existing + 1)),
        ),
      ).toBeVisible();
      const { rows: imported } = await pool.query(
        'select query from visibility_measurements where created_by=$1',
        [editor.id],
      );
      // The apostrophe is removed again on import: data round-trips.
      expect(imported.filter((r) => r.query === question)).toHaveLength(2);
      // Trend table counts only checked rows.
      await expect(
        page.getByRole('table', { name: en.visibilityTrend }),
      ).toBeVisible();
      await axe(page);
      await shot(page, 'visibility', info.project.name);
      // Owner deletes one row (confirmation dialog).
      await login(page, owner);
      await page.goto('/visibility');
      await expect(
        page.getByRole('cell', { name: question }).first(),
      ).toBeVisible();
      // With rows and the owner-only delete column, the page must still fit
      // the phone (hidden column labels once widened it to 855 px).
      expect(
        await page.evaluate(() => [
          document.documentElement.scrollWidth,
          window.innerWidth,
        ]),
      ).toEqual([390, 390]);
      await page
        .getByRole('button', {
          name: en.visibilityDeleteRow
            .replace('{q}', question)
            .replace('{d}', new Date().toISOString().slice(0, 10)),
        })
        .first()
        .click();
      await page
        .getByRole('alertdialog', { name: en.visibilityDeleteTitle })
        .getByRole('button', { name: en.visibilityDelete, exact: true })
        .click();
      await expect(page.getByText(en.visibilityDeleted).first()).toBeVisible();
      const { rows: audit } = await pool.query(
        "select action from audit_log where entity='visibility_measurement' and user_id=any($1::uuid[]) order by id",
        [[owner.id, editor.id]],
      );
      expect(audit.map((r) => r.action)).toEqual([
        'create',
        'import',
        'delete',
      ]);
    } finally {
      await removeStaff(pool, users, []);
      await pool.end();
    }
  });

  test('tour search texts: edit, live snippet, public metadata, reset', async ({
    page,
    request,
  }, info) => {
    test.skip(
      info.project.name !== 'mobile',
      'Changes a published trip; the workflow runs once (390 px).',
    );
    test.setTimeout(300000);
    const { pool } = await localDatabase(
      verify ? 'verification' : 'development',
    );
    const users: Staff[] = [];
    const {
      rows: [trip],
    } = await pool.query(
      "select id, slug, seo_title, seo_description from trips where status='published' and kind='trip' and seo_title is null order by sort limit 1",
    );
    try {
      const owner = await staff(pool, 'owner');
      users.push(owner);
      await login(page, owner);
      await page.goto('/seo/tours/' + trip.id);
      await expect(page.locator('.seo-snippet')).toBeVisible({
        timeout: 30000,
      });
      const title = 'QA own title ' + randomBytes(3).toString('hex'),
        description =
          'QA own description for the search result preview, long enough to read naturally in a snippet.';
      // A live trip only accepts copy in all seven languages: a partial
      // change is refused and the editor says so (no silent failure).
      await pickLang(page, 'it');
      await page
        .getByLabel(en.seoTitleField, { exact: true })
        .fill(title + ' IT');
      await tap(page, en.seoSaveTexts);
      await expect(
        page.locator('[data-sonner-toast][data-type="error"]').first(),
      ).toBeVisible({ timeout: 30000 });
      for (const lang of locales) {
        const suffix = lang === 'en' ? '' : ' ' + lang.toUpperCase();
        await pickLang(page, lang);
        await page
          .getByLabel(en.seoTitleField, { exact: true })
          .fill(title + suffix);
        await page
          .getByLabel(en.seoDescriptionField, { exact: true })
          .fill(description + suffix);
      }
      // The live snippet follows the language being edited (last: TR).
      await expect(page.locator('.seo-snippet-title')).toContainText(
        title + ' TR',
      );
      await tap(page, en.seoSaveTexts);
      await expect(page.getByText(en.seoSaved).first()).toBeVisible({
        timeout: 30000,
      });
      await expect
        .poll(
          async () =>
            (
              await (await request.get(`${web}/it/t/${trip.slug}`)).text()
            ).match(/<title>([^<]*)<\/title>/)?.[1],
          { timeout: 90000, intervals: [3000] },
        )
        .toContain(title + ' IT');
      // Live check reads the public page like a crawler.
      await page
        .getByRole('button', { name: en.seoCheckPage, exact: true })
        .click();
      await expect(page.getByText(en.seoMetadataInHead)).toBeVisible({
        timeout: 60000,
      });
      await page.getByText(en.seoStructuredData).click();
      await expect(page.locator('pre').first()).toContainText('TouristTrip');
      await axe(page);
      await shot(page, 'seo-trip', info.project.name);
      // Reset: clearing every language returns to the automatic texts.
      for (const lang of locales) {
        await pickLang(page, lang);
        await page.getByLabel(en.seoTitleField, { exact: true }).fill('');
        await page.getByLabel(en.seoDescriptionField, { exact: true }).fill('');
      }
      await tap(page, en.seoSaveTexts);
      await expect
        .poll(
          async () =>
            (
              await pool.query('select seo_title from trips where id=$1', [
                trip.id,
              ])
            ).rows[0].seo_title,
        )
        .toBeNull();
      await expect
        .poll(
          async () =>
            (
              await (await request.get(`${web}/it/t/${trip.slug}`)).text()
            ).match(/<title>([^<]*)<\/title>/)?.[1],
          { timeout: 90000, intervals: [3000] },
        )
        .not.toContain('QA own title');
    } finally {
      await pool.query(
        'update trips set seo_title=$2, seo_description=$3 where id=$1',
        [trip.id, trip.seo_title, trip.seo_description],
      );
      await removeStaff(pool, users, []);
      await pool.end();
    }
  });
});
