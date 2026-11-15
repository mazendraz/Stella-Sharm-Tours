import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { sha } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };
const otp = createRequire(resolve('apps/api/package.json'))(
  'otplib',
) as typeof import('../../apps/api/node_modules/otplib');
test('one-use setup link, mandatory MFA enrollment, recovery sign-in and reset form', async ({
  page,
}) => {
  const { pool } = await localDatabase(
    process.env.STELLA_INTEGRATION_VERIFY === '1'
      ? 'verification'
      : 'development',
  );
  const id = randomUUID(),
    email = id + '@example.test',
    token = randomBytes(32).toString('base64url'),
    password = 'QA-' + randomBytes(24).toString('base64url');
  try {
    await pool.query(
      "insert into admin_users(id,email,name,role,password_hash) values($1,$2,'Setup QA','owner','!setup-required')",
      [id, email],
    );
    await pool.query(
      "insert into auth_tokens(id,user_id,purpose,expires_at) values($1,$2,'setup',now()+interval '30 minutes')",
      [sha(token), id],
    );
    await page.goto('/setup?token=' + encodeURIComponent(token));
    await expect(page).not.toHaveURL(/token=/);
    await page.getByLabel(en.newPassword, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.save, exact: true }).click();
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByLabel(en.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.login, exact: true }).click();
    const secret = await page.locator('.qr code').innerText();
    await page.getByLabel(en.code).fill(otp.generateSync({ secret }));
    await page.getByRole('button', { name: en.verify, exact: true }).click();
    const recovery = await page
      .locator('.recovery-codes code')
      .first()
      .innerText();
    await page
      .getByRole('button', { name: en.savedCodes, exact: true })
      .click();
    await expect(page.locator('main h1')).toHaveText(en.overview);
    await page
      .locator('.avatar-btn:visible, .account-trigger:visible')
      .first()
      .click();
    await page.getByRole('menuitem', { name: en.logout, exact: true }).click();
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByLabel(en.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.login, exact: true }).click();
    await page.getByLabel(en.code).fill(recovery);
    await page.getByRole('button', { name: en.verify, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(en.overview);
    await page
      .locator('.avatar-btn:visible, .account-trigger:visible')
      .first()
      .click();
    await page.getByRole('menuitem', { name: en.logout, exact: true }).click();
    await page.getByRole('button', { name: en.forgot, exact: true }).click();
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByRole('button', { name: en.reset, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(en.resetSent);
  } finally {
    await pool.query('delete from audit_log where user_id=$1', [id]);
    await pool.query("delete from outbox where data->>'userId'=$1", [id]);
    await pool.query('delete from admin_users where id=$1', [id]);
    await pool.end();
  }
});
