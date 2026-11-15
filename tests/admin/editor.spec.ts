import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { passwordHash, seal } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };
const otp = createRequire(resolve('apps/api/package.json'))(
  'otplib',
) as typeof import('../../apps/api/node_modules/otplib');

// Rebuilt admin (docs/stella-admin-rebuild-spec.md): full-page editor, one Save,
// one language bar, unsaved-changes guard, Undo in the toast, no no-op saves.
// Works on a throwaway duplicate of a real trip and deletes it afterwards.
test('trip editor: duplicate, guard, seven-language save, Undo and no-op save', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  const { pool, env } = await localDatabase(
    process.env.STELLA_INTEGRATION_VERIFY === '1'
      ? 'verification'
      : 'development',
  );
  const id = randomUUID(),
    email = id + '@example.test',
    password = 'QA-' + randomBytes(24).toString('base64url'),
    secret = otp.generateSecret();
  let copyId = '';
  try {
    await pool.query(
      'insert into admin_users(id,email,name,role,password_hash,totp_enabled,totp_secret_enc) values($1,$2,$3,$4,$5,true,$6)',
      [
        id,
        email,
        'Editor QA',
        'owner',
        await passwordHash(password),
        seal(secret, env.TOTP_ENC_KEY!, id),
      ],
    );
    const source = (
      await pool.query(
        "select id, slug from trips where kind='trip' and archived_at is null order by sort limit 1",
      )
    ).rows[0];
    await page.goto('/');
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByLabel(en.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.login, exact: true }).click();
    await page.getByLabel(en.code).fill(otp.generateSync({ secret }));
    await page.getByRole('button', { name: en.verify, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(en.overview);
    await page.goto('/trips/' + source.id);
    await page
      .locator('.editor-actions')
      .getByRole('button', { name: en.moreActions })
      .click();
    await page.getByRole('menuitem', { name: en.duplicate }).click();
    await page.waitForURL(
      (u) =>
        u.pathname.startsWith('/trips/') && !u.pathname.endsWith(source.id),
    );
    copyId = page.url().split('/trips/')[1]!.split(/[?#]/)[0]!;
    await expect(page.getByText(en.duplicatedEditing)).toBeVisible();
    const copy = (
      await pool.query('select slug, status from trips where id=$1', [copyId])
    ).rows[0];
    expect(copy).toEqual({ slug: source.slug + '-copy', status: 'draft' });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.getByLabel(en.summary, { exact: true }).fill('QA summary');
    await expect(page.locator('.save-bar')).toContainText(en.basics);
    await page
      .locator('.sidebar')
      .getByRole('link', { name: en.trips })
      .click();
    await expect(page.getByRole('alertdialog')).toContainText(en.discardTitle);
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: en.cancel })
      .click();
    await expect(page).toHaveURL(new RegExp(copyId));
    await page
      .locator('.save-bar')
      .getByRole('button', { name: en.save, exact: true })
      .click();
    await expect(page.locator('#section-basics .section-error')).toBeVisible();
    for (const lang of ['IT', 'ES', 'FR', 'DE', 'RU', 'TR']) {
      await page.locator('.language-bar .lang-chip', { hasText: lang }).click();
      await page.getByLabel(en.summary, { exact: true }).fill('QA ' + lang);
    }
    await page.keyboard.press('Control+s');
    await expect(page.getByText(en.tripSaved)).toBeVisible();
    await expect(page.locator('.save-bar')).toHaveCount(0);
    const saved = (
      await pool.query('select summary from trips where id=$1', [copyId])
    ).rows[0].summary;
    expect(saved.en).toBe('QA summary');
    expect(saved.ru).toBe('QA RU');
    await page.getByRole('button', { name: en.undo, exact: true }).click();
    await expect(page.getByText(en.undone)).toBeVisible();
    await expect
      .poll(
        async () =>
          (await pool.query('select summary from trips where id=$1', [copyId]))
            .rows[0].summary?.en,
      )
      .not.toBe('QA summary');
    const audit = async () =>
      (
        await pool.query(
          'select count(*)::int n from audit_log where entity_id=$1',
          [copyId],
        )
      ).rows[0].n;
    const before = await audit();
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(800);
    expect(await audit()).toBe(before);
  } finally {
    if (copyId) {
      for (const table of [
        'trip_prices',
        'trip_itinerary',
        'trip_items',
        'trip_media',
      ])
        await pool.query(`delete from ${table} where trip_id=$1`, [copyId]);
      await pool.query('delete from content_translations where entity_id=$1', [
        copyId,
      ]);
      await pool.query('delete from trips where id=$1', [copyId]);
    }
    await pool.query('delete from sessions where user_id=$1', [id]);
    await pool.query('delete from audit_log where user_id=$1', [id]);
    await pool.query('delete from revisions where created_by=$1', [id]);
    await pool.query('delete from admin_users where id=$1', [id]);
    await pool.end();
  }
});
