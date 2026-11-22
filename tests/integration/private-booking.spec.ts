import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { locales } from '../../packages/shared/src/index';
import { bundledCoreText } from '../../packages/shared/src/i18n/core-content';
import { localDatabase } from '../real-api/setup';

test('seven-language Private discovery persists an on-request quote and local staff email', async ({
  page,
  request,
}, info) => {
  test.setTimeout(180000);
  const { pool } = await localDatabase('verification');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const directory = `docs/screens/current/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  try {
    for (const [index, locale] of locales.entries()) {
      const messages: Record<string, string> = JSON.parse(
        await readFile(`apps/web/messages/${locale}.json`, 'utf8'),
      );
      // Separate synthetic cases share one QA gateway IP. Restore only that
      // namespace in the explicitly guarded disposable DB; quotas stay enabled.
      await pool.query(
        "delete from rate_buckets where key like 'request-ip:%'",
      );
      await page.goto('/' + locale);
      await expect(page.locator('[data-enhanced=true]')).toBeVisible();
      await page
        .locator(`[data-collection-link][href="/${locale}/c/sea"]`)
        .first()
        .click();
      await expect(page.locator('[data-collection-ready=true]')).toBeVisible();
      await page
        .getByRole('button', { name: messages.private, exact: true })
        .click();
      await page
        .getByRole('heading', {
          name: bundledCoreText('Tiran Island by Boat', locale)!,
          exact: true,
        })
        .getByRole('link')
        .click();
      await page
        .getByRole('button', { name: messages.request, exact: true })
        .click();
      const sheet = page.getByRole('dialog').last();
      await expect(
        sheet.getByRole('button', { name: messages.private, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await sheet.locator('.range-day:enabled').first().click();
      await sheet
        .getByRole('button', { name: 'Nabq Bay', exact: true })
        .click();
      await sheet
        .getByLabel(messages.name!, { exact: true })
        .fill(
          `Synthetic integration QA Private ${info.project.name} ${locale}`,
        );
      await sheet
        .getByLabel(messages.country!, { exact: true })
        .selectOption('EG');
      const project =
        ['mobile', 'tablet', 'desktop'].indexOf(info.project.name) + 1;
      await sheet
        .getByLabel(messages.phone!, { exact: true })
        .fill('105558' + String(project * 10 + index).padStart(4, '0'));
      const sent = page.waitForResponse(
        (response) =>
          response.url() === 'http://localhost:4984/v1/requests' &&
          response.request().method() === 'POST',
      );
      await sheet
        .getByRole('button', { name: messages.sendRequest, exact: true })
        .click();
      const response = await sent;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toMatchObject({
        locale,
        format: 'private',
        mode: 'single',
      });
      const value = await response.json();
      expect(value.estimate_eur).toBeNull();
      await expect(sheet.locator('.confirmation h2')).toHaveText(
        messages.sent!,
      );
      await expect(sheet.locator('a[href^="https://wa.me/"]')).toBeVisible();
      const { rows } = await pool.query(
        'select locale,format,estimate_eur from booking_requests where ref=$1',
        [value.ref],
      );
      expect(rows).toEqual([{ locale, format: 'private', estimate_eur: null }]);
      await expect
        .poll(
          async () => {
            const mail = await (
              await request.get('http://localhost:4987/api/v1/messages')
            ).json();
            return mail.messages.some((message: { Subject: string }) =>
              message.Subject.includes(value.ref),
            );
          },
          { timeout: 20000 },
        )
        .toBe(true);
      // Public confirmation only, with synthetic data; never capture a real inbox.
      await page.screenshot({
        path: `${directory}/private-confirmation-${locale}.jpg`,
        type: 'jpeg',
        quality: 80,
        scale: 'css',
        animations: 'disabled',
      });
      await sheet
        .locator('.confirmation')
        .getByRole('button', { name: messages.close, exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/request/done/${value.ref}$`),
      );
      await expect(page.locator('main h1')).toBeVisible();
      await page.screenshot({
        path: `${directory}/confirmation-page-${locale}.jpg`,
        type: 'jpeg',
        quality: 80,
        scale: 'css',
        animations: 'disabled',
      });
    }
  } finally {
    await pool.end();
  }
});
