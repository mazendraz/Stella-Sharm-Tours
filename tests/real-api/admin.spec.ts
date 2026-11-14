import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { passwordHash, seal } from '../../apps/api/src/auth';
import { localDatabase } from './setup';
const otp = createRequire(resolve('apps/api/package.json'))(
  'otplib',
) as typeof import('../../apps/api/node_modules/otplib');
const verification = process.env.STELLA_INTEGRATION_VERIFY === '1';
const apiOrigin = verification
  ? 'http://localhost:4984'
  : 'http://localhost:4000';
const adminOrigin = verification
  ? 'http://localhost:4986'
  : 'http://localhost:3001';
test('authenticated API price and hero edits invalidate web caches, and Undo restores both', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'mobile',
    'Revalidation is shared by all viewport sizes.',
  );
  test.setTimeout(120000);
  const { pool, env } = await localDatabase(
      verification ? 'verification' : 'development',
    ),
    id = randomUUID(),
    password = randomBytes(24).toString('base64url'),
    secret = otp.generateSecret(),
    email = id + '@example.test',
    cookies = new Map<string, string>();
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(apiOrigin + '/v1/admin' + path, {
      method,
      headers: {
        Origin: adminOrigin,
        Cookie: [...cookies]
          .map(([key, value]) => key + '=' + value)
          .join('; '),
        'X-CSRF-Token': cookies.get('__Host-stella_csrf') ?? '',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'),
        [key, ...value] = pair!.split('=');
      cookies.set(key!, value.join('='));
    }
    return response;
  };
  const {
      rows: [trip],
    } = await pool.query("select id from trips where slug='tiran-island-boat'"),
    { rows: prices } = await pool.query(
      'select * from trip_prices where trip_id=$1 order by sort',
      [trip.id],
    );
  const { rows: slides } = await pool.query(
    'select id from hero_slides where archived_at is null order by sort',
  );
  const priceBody = (amount: number) => ({
    rows: prices.map((p) => ({
      id: p.id,
      label: p.label,
      amountEur: p.is_primary ? amount : Number(p.amount_eur),
      unit: p.unit,
      isPrimary: p.is_primary,
      minQty: p.min_qty,
      maxQty: p.max_qty,
      validFrom: null,
      validTo: null,
    })),
  });
  try {
    await pool.query(
      'insert into admin_users(id,email,name,role,password_hash,totp_enabled,totp_secret_enc) values($1,$2,$3,$4,$5,true,$6)',
      [
        id,
        email,
        'Local revalidation QA',
        'manager',
        await passwordHash(password),
        seal(secret, env.TOTP_ENC_KEY!, id),
      ],
    );
    expect(
      (await call('/auth/login', 'POST', { email, password })).status,
    ).toBe(200);
    expect(
      (
        await call('/auth/2fa/verify', 'POST', {
          code: otp.generateSync({ secret }),
        })
      ).status,
    ).toBe(200);
    await page.goto('/en/t/tiran-island-boat');
    await expect(page.locator('.price-row').first()).toContainText('35');
    expect(
      (await call('/trips/' + trip.id + '/prices', 'PUT', priceBody(40)))
        .status,
    ).toBe(200);
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.locator('.price-row').first().innerText();
        },
        { timeout: 60000 },
      )
      .toContain('40');
    const {
      rows: [priceRevision],
    } = await pool.query(
      "select id from revisions where entity='trip_prices' and entity_id=$1 order by id desc limit 1",
      [trip.id],
    );
    expect(
      (await call('/revisions/' + priceRevision.id + '/restore', 'POST', {}))
        .status,
    ).toBe(200);
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.locator('.price-row').first().innerText();
        },
        { timeout: 60000 },
      )
      .toContain('35');
    const ids = slides.map((s) => s.id),
      moved = [ids[2], ...ids.filter((v) => v !== ids[2])];
    expect(
      (await call('/hero-slides/reorder', 'POST', { ids: moved })).status,
    ).toBe(200);
    const site = await (await fetch(apiOrigin + '/v1/public/site')).json(),
      headline = site.hero_slides[0].title.text;
    await page.goto('/en');
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.locator('.hero-copy h1').innerText();
        },
        { timeout: 60000 },
      )
      .toBe(headline);
    const {
      rows: [heroRevision],
    } = await pool.query(
      "select id from revisions where entity='hero_order' order by id desc limit 1",
    );
    expect(
      (await call('/revisions/' + heroRevision.id + '/restore', 'POST', {}))
        .status,
    ).toBe(200);
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.locator('.hero-copy h1').innerText();
        },
        { timeout: 60000 },
      )
      .toBe('Your trip, your way.');
  } finally {
    for (const price of prices)
      await pool.query('update trip_prices set amount_eur=$1 where id=$2', [
        price.amount_eur,
        price.id,
      ]);
    for (const [sort, slide] of slides.entries())
      await pool.query('update hero_slides set sort=$1 where id=$2', [
        sort,
        slide.id,
      ]);
    // Only this temporary test account and its own sessions are removed.
    await pool.query('delete from admin_users where id=$1', [id]);
    await pool.end();
  }
});
