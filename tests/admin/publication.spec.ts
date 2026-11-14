import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { passwordHash, seal } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };
const otp = createRequire(resolve('apps/api/package.json'))(
  'otplib',
) as typeof import('../../apps/api/node_modules/otplib');
test('owner UI price and third hero changes reach the real public site within 60 seconds and Undo restores them', async ({
  page,
  context,
}, info) => {
  test.skip(
    process.env.STELLA_INTEGRATION_VERIFY !== '1' ||
      info.project.name !== 'mobile',
    'Mutates only the isolated verification catalog; revalidation is shared across widths.',
  );
  test.setTimeout(180000);
  const { pool, env } = await localDatabase('verification');
  const id = randomUUID(),
    email = id + '@example.test',
    password = 'QA-' + randomBytes(24).toString('base64url'),
    secret = otp.generateSecret();
  const {
      rows: [trip],
    } = await pool.query(
      "select id,title from trips where slug='tiran-island-boat'",
    ),
    { rows: prices } = await pool.query(
      'select * from trip_prices where trip_id=$1 order by sort',
      [trip.id],
    ),
    { rows: slides } = await pool.query(
      'select id,sort from hero_slides where archived_at is null order by sort',
    );
  const primary = prices.findIndex((row) => row.is_primary),
    old = Number(prices[primary].amount_eur),
    next = old + 5;
  const web = await context.newPage();
  try {
    await pool.query(
      'insert into admin_users(id,email,name,role,password_hash,totp_enabled,totp_secret_enc) values($1,$2,$3,$4,$5,true,$6)',
      [
        id,
        email,
        'Publication UI QA',
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
    await web.goto('http://localhost:4983/en/t/tiran-island-boat');
    await expect(web.locator('.price-row').first()).toContainText(String(old));
    await page.goto('/prices');
    await page.getByRole('searchbox').fill(trip.title.en);
    await page
      .getByRole('button')
      .filter({ has: page.getByText(trip.title.en, { exact: true }) })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog
      .locator('[name="rows.' + primary + '.amountEur"]')
      .fill(String(next));
    await dialog.getByRole('button', { name: en.save, exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: en.undo, exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        Number(
          (
            await pool.query(
              'select amount_eur from trip_prices where trip_id=$1 and is_primary',
              [trip.id],
            )
          ).rows[0].amount_eur,
        ),
      )
      .toBe(next);
    const publicTrip = await (
      await fetch(
        'http://localhost:4984/v1/public/trips/tiran-island-boat?locale=en',
      )
    ).json();
    expect(
      publicTrip.prices.find(
        (price: { is_primary: boolean }) => price.is_primary,
      ).amount_eur,
    ).toBe(next);
    await expect
      .poll(
        async () => {
          await web.reload();
          return web.locator('.price-row').first().innerText();
        },
        { timeout: 60000 },
      )
      .toContain(String(next));
    await dialog.getByRole('button', { name: en.undo, exact: true }).click();
    await expect
      .poll(
        async () => {
          await web.reload();
          return web.locator('.price-row').first().innerText();
        },
        { timeout: 60000 },
      )
      .toContain(String(old));
    await dialog.getByRole('button', { name: en.close, exact: true }).click();
    await web.goto('http://localhost:4983/en');
    const oldHeadline = await web.locator('.hero-copy h1').innerText();
    await page.goto('/hero');
    await expect(page.locator('article.card')).toHaveCount(slides.length);
    await page
      .locator('article.card')
      .nth(2)
      .getByRole('button', { name: en.first, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: en.undo, exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          await web.reload();
          return web.locator('.hero-copy h1').innerText();
        },
        { timeout: 60000 },
      )
      .not.toBe(oldHeadline);
    const site = await (
      await fetch('http://localhost:4984/v1/public/site')
    ).json();
    await expect(web.locator('.hero-copy h1')).toHaveText(
      site.hero_slides[0].title.text,
    );
    await page.getByRole('button', { name: en.undo, exact: true }).click();
    await expect
      .poll(
        async () => {
          await web.reload();
          return web.locator('.hero-copy h1').innerText();
        },
        { timeout: 60000 },
      )
      .toBe(oldHeadline);
  } finally {
    for (const price of prices)
      await pool.query('update trip_prices set amount_eur=$1 where id=$2', [
        price.amount_eur,
        price.id,
      ]);
    for (const slide of slides)
      await pool.query('update hero_slides set sort=$1 where id=$2', [
        slide.sort,
        slide.id,
      ]);
    await pool.query('delete from audit_log where user_id=$1', [id]);
    await pool.query('delete from revisions where created_by=$1', [id]);
    await pool.query("delete from outbox where data->>'userId'=$1", [id]);
    await pool.query('delete from admin_users where id=$1', [id]);
    await web.close();
    await pool.end();
  }
});
