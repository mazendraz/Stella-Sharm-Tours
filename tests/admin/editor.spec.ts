import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID, randomBytes } from 'node:crypto';
import { passwordHash } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };
import it from '../../apps/admin/messages/it.json' with { type: 'json' };
import es from '../../apps/admin/messages/es.json' with { type: 'json' };
import fr from '../../apps/admin/messages/fr.json' with { type: 'json' };
import de from '../../apps/admin/messages/de.json' with { type: 'json' };
import ru from '../../apps/admin/messages/ru.json' with { type: 'json' };
import tr from '../../apps/admin/messages/tr.json' with { type: 'json' };
import { coreLocaleOptions } from '../../packages/shared/src/index';

// Rebuilt admin (docs/stella-admin-rebuild-spec.md): full-page editor, one Save,
// one language bar, unsaved-changes guard, Undo in the toast, no no-op saves.
// Works on a throwaway duplicate of a real trip and deletes it afterwards.
test('trip editor: duplicate, guard, seven-language save, Undo and no-op save', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  test.setTimeout(60_000);
  const { pool } = await localDatabase(
    process.env.STELLA_INTEGRATION_VERIFY === '1'
      ? 'verification'
      : 'development',
  );
  const id = randomUUID(),
    email = id + '@example.test',
    password = 'QA-' + randomBytes(24).toString('base64url');
  let copyId = '';
  try {
    await pool.query(
      'insert into admin_users(id,email,name,role,password_hash) values($1,$2,$3,$4,$5)',
      [id, email, 'Editor QA', 'owner', await passwordHash(password)],
    );
    const source = (
      await pool.query(
        "select id, slug from trips where slug='quad-bike-safari' and archived_at is null",
      )
    ).rows[0];
    await page.goto('/');
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByLabel(en.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.login, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(en.overview);
    await page.goto('/trips/' + source.id);
    await page
      .locator('.editor-actions')
      .getByRole('button', { name: en.moreActions })
      .click();
    const duplication = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/' + source.id + '/duplicate'),
    );
    await page.getByRole('menuitem', { name: en.duplicate }).click();
    const duplicateResponse = await duplication;
    expect(duplicateResponse.ok(), await duplicateResponse.text()).toBe(true);
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
    await page.setViewportSize({ width: 390, height: 844 });
    const path = '**/v1/admin/trips/' + copyId + '/basics';
    const sent = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route(
      path,
      async (route) => {
        sent.resolve();
        await release.promise;
        await route.continue();
      },
      { times: 1 },
    );
    const saveBar = page.locator('.save-bar');
    const save = saveBar.getByRole('button', { name: en.save, exact: true });
    const summary = page.getByLabel(en.summary, { exact: true });
    await save.click();
    await sent.promise;
    try {
      await summary.fill('QA TR after the first save');
    } finally {
      release.resolve();
    }
    await expect(summary).toHaveValue('QA TR after the first save');
    await expect(save).toBeEnabled();
    const saved = (
      await pool.query('select summary from trips where id=$1', [copyId])
    ).rows[0].summary;
    expect(saved.en).toBe('QA summary');
    expect(saved.ru).toBe('QA RU');
    expect(saved.tr).toBe('QA TR');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.route(
      path,
      (route) =>
        route.fulfill({
          status: 503,
          json: {
            error: {
              code: 'CATALOG_UNAVAILABLE',
              message: 'Synthetic QA failure',
            },
          },
        }),
      { times: 1 },
    );
    await save.click();
    await expect(page.locator('#section-basics .section-error')).toBeVisible();
    await expect(summary).toHaveValue('QA TR after the first save');
    await expect(save).toBeEnabled();
    await page.setViewportSize({ width: 1440, height: 900 });
    await save.click();
    await expect(saveBar).toHaveCount(0);
    const final = (
      await pool.query('select summary from trips where id=$1', [copyId])
    ).rows[0].summary;
    expect(final.tr).toBe('QA TR after the first save');
    await page
      .getByRole('button', { name: en.undo, exact: true })
      .last()
      .click();
    await expect(page.getByText(en.undone)).toBeVisible();
    await expect
      .poll(
        async () =>
          (await pool.query('select summary from trips where id=$1', [copyId]))
            .rows[0].summary?.tr,
      )
      .toBe('QA TR');
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

    const price = async () =>
      Number(
        (
          await pool.query(
            'select amount_eur from trip_prices where trip_id=$1 and is_primary',
            [copyId],
          )
        ).rows[0].amount_eur,
      );
    const original = await price();
    await page.goto('/prices');
    const row = page
      .locator('.data-table tr')
      .filter({ hasText: 'Quad Bike Safari (copy)' });
    const editPrice = row.getByRole('button', { name: /Edit price/ });
    await editPrice.click();
    const amount = row.getByRole('spinbutton');
    await amount.fill(String(original + 1));
    await amount.press('Tab');
    await expect(amount).toHaveValue(String(original + 1));
    expect(await price()).toBe(original);
    await row.getByRole('button', { name: en.cancel, exact: true }).click();
    await expect(amount).toHaveCount(0);
    expect(await price()).toBe(original);
    await editPrice.click();
    await amount.fill(String(original + 1));
    await row.getByRole('button', { name: en.save, exact: true }).click();
    await expect(amount).toHaveCount(0);
    expect(await price()).toBe(original + 1);
    await page.goto('/trips/' + copyId);
    const dictionaries = { en, it, es, fr, de, ru, tr };
    let current = en;
    for (const { code, name } of coreLocaleOptions) {
      await page
        .locator('.sidebar')
        .getByRole('button', { name: current.accountMenu })
        .click();
      await page.getByRole('menuitemradio', { name, exact: true }).click();
      current = dictionaries[code];
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(
        page.getByRole('textbox', { name: current.summary, exact: true }),
      ).toBeVisible();
    }
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
