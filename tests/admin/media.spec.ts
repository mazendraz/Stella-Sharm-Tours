import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { passwordHash, seal } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import { locales } from '../../packages/shared/src/index';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };
const require = createRequire(resolve('apps/api/package.json')),
  otp =
    require('otplib') as typeof import('../../apps/api/node_modules/otplib'),
  sharp =
    require('sharp') as typeof import('../../apps/api/node_modules/sharp');
test('phone upload resizes a real image, processes privately, saves seven alt texts and restores rights', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'mobile',
    'Actual pipeline is shared across widths.',
  );
  test.setTimeout(180000);
  const { pool, env } = await localDatabase(
    process.env.STELLA_INTEGRATION_VERIFY === '1'
      ? 'verification'
      : 'development',
  );
  const id = randomUUID(),
    email = id + '@example.test',
    password = 'QA-' + randomBytes(24).toString('base64url'),
    secret = otp.generateSecret();
  let mediaId = '';
  try {
    await pool.query(
      'insert into admin_users(id,email,name,role,password_hash,totp_enabled,totp_secret_enc) values($1,$2,$3,$4,$5,true,$6)',
      [
        id,
        email,
        'Media UI QA',
        'owner',
        await passwordHash(password),
        seal(secret, env.TOTP_ENC_KEY!, id),
      ],
    );
    await page.goto('/');
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByLabel(en.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.login, exact: true }).click();
    await page.getByLabel(en.code).fill(otp.generateSync({ secret }));
    await page.getByRole('button', { name: en.verify, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(en.requests);
    await page.goto('/media');
    const buffer = await sharp({
      create: {
        width: 2400,
        height: 3600,
        channels: 3,
        background: {
          r: parseInt(id.slice(0, 2), 16),
          g: parseInt(id.slice(2, 4), 16),
          b: parseInt(id.slice(4, 6), 16),
        },
      },
    })
      .jpeg()
      .toBuffer();
    const pending = page.waitForResponse(
      (response) =>
        response.url().endsWith('/v1/admin/media') &&
        response.request().method() === 'POST',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'qa-' + id + '.jpg',
      mimeType: 'image/jpeg',
      buffer,
    });
    const response = await pending;
    mediaId = (await response.json()).id;
    expect(response.status()).toBe(202);
    await expect
      .poll(
        async () =>
          (await pool.query('select status from media where id=$1', [mediaId]))
            .rows[0]?.status,
        { timeout: 120000 },
      )
      .toBe('ready');
    const {
      rows: [row],
    } = await pool.query(
      'select width,height,rights_status from media where id=$1',
      [mediaId],
    );
    expect(Math.max(row.width, row.height)).toBeLessThanOrEqual(2560);
    expect(row.rights_status).toBe('unknown');
    await page
      .locator('button.card')
      .filter({ has: page.locator('img[src*="' + mediaId + '"]') })
      .click();
    const dialog = page.getByRole('dialog');
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    const image = dialog.locator('.focal-image img');
    await image.scrollIntoViewIfNeeded();
    const imageBox = await image.boundingBox();
    await page.mouse.click(
      imageBox!.x + imageBox!.width * 0.25,
      imageBox!.y + imageBox!.height * 0.75,
    );
    await expect
      .poll(async () =>
        Number(
          (await pool.query('select focal_x from media where id=$1', [mediaId]))
            .rows[0].focal_x,
        ),
      )
      .toBeCloseTo(0.25, 1);
    const dot = await dialog.locator('.focal-dot').boundingBox();
    expect(
      Math.abs(
        dot!.x + dot!.width / 2 - (imageBox!.x + imageBox!.width * 0.25),
      ),
    ).toBeLessThan(3);
    await dialog.getByRole('button', { name: en.undo, exact: true }).click();
    await expect
      .poll(async () =>
        Number(
          (await pool.query('select focal_x from media where id=$1', [mediaId]))
            .rows[0].focal_x,
        ),
      )
      .toBe(0.5);
    const form = dialog
      .locator('form')
      .filter({ has: page.locator('[name^="alt."]') });
    for (const locale of locales) {
      await form
        .getByRole('button', { name: locale.toUpperCase(), exact: true })
        .click();
      await form
        .locator('[name="alt.' + locale + '"]')
        .fill('QA ' + locale + ' ' + id);
    }
    await form.locator('[name="rightsStatus"]').selectOption('owned');
    await form.locator('.review-check input').check();
    await form.getByRole('button', { name: en.save, exact: true }).click();
    await expect
      .poll(
        async () =>
          (await pool.query('select alt from media where id=$1', [mediaId]))
            .rows[0].alt,
      )
      .toEqual(
        Object.fromEntries(
          locales.map((locale) => [locale, 'QA ' + locale + ' ' + id]),
        ),
      );
    await dialog.getByRole('button', { name: en.undo, exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await pool.query('select rights_status from media where id=$1', [
              mediaId,
            ])
          ).rows[0].rights_status,
      )
      .toBe('unknown');
  } finally {
    await pool.query(
      "update media set archived_at=now(),rights_status='unknown',uploaded_by=null where uploaded_by=$1",
      [id],
    );
    await pool.query('delete from audit_log where user_id=$1', [id]);
    await pool.query('delete from revisions where created_by=$1', [id]);
    await pool.query("delete from outbox where data->>'userId'=$1", [id]);
    await pool.query('delete from admin_users where id=$1', [id]);
    await pool.end();
  }
});
