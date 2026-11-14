import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { passwordHash, seal } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import { locales } from '../../packages/shared/src/index';
import { bundledCoreText } from '../../packages/shared/src/i18n/core-content';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };
const otp = createRequire(resolve('apps/api/package.json'))(
  'otplib',
) as typeof import('../../apps/api/node_modules/otplib');

test('real price, request and hero edits save and Undo through accessible sheets', async ({
  page,
}, info) => {
  const { pool, env } = await localDatabase(
    process.env.STELLA_INTEGRATION_VERIFY === '1'
      ? 'verification'
      : 'development',
  );
  const id = randomUUID(),
    tripId = randomUUID(),
    requestId = randomUUID(),
    email = id + '@example.test',
    password = 'QA-' + randomBytes(24).toString('base64url'),
    secret = otp.generateSecret();
  const {
    rows: [source],
  } = await pool.query(
    "select t.*, p.amount_eur,p.unit,p.label from trips t join trip_prices p on p.trip_id=t.id and p.is_primary where t.slug='tiran-island-boat'",
  );
  const title = Object.fromEntries(
    locales.map((locale) => [
      locale,
      'QA ' +
        tripId.slice(0, 8) +
        ' ' +
        (source.title[locale] ?? bundledCoreText(source.title.en, locale)),
    ]),
  );
  const { rows: originalSlides } = await pool.query(
    "select h.id,h.sort,coalesce(h.headline->>'en',c.name->>'en') as title from hero_slides h left join collections c on c.id=h.collection_id where h.archived_at is null order by h.sort",
  );
  try {
    await pool.query(
      'insert into admin_users(id,email,name,role,password_hash,totp_enabled,totp_secret_enc) values($1,$2,$3,$4,$5,true,$6)',
      [
        id,
        email,
        'Admin write QA',
        'owner',
        await passwordHash(password),
        seal(secret, env.TOTP_ENC_KEY!, id),
      ],
    );
    await pool.query(
      'insert into trips(id,slug,collection_id,title,format) values($1,$2,$3,$4,$5)',
      [
        tripId,
        'qa-' + tripId,
        source.collection_id,
        JSON.stringify(title),
        'group',
      ],
    );
    await pool.query(
      'insert into trip_prices(trip_id,amount_eur,unit,label,is_primary) values($1,$2,$3,$4,true)',
      [tripId, source.amount_eur, source.unit, JSON.stringify(source.label)],
    );
    await pool.query(
      "insert into booking_requests(id,ref,mode,locale,start_date,adults,name,phone,pickup_area,estimate_eur) values($1,$2,'single','fr','2026-12-01',2,'Synthetic dashboard visitor','+201000000000','Nabq Bay',$3)",
      [requestId, 'QA-' + requestId, Number(source.amount_eur) * 2],
    );
    await pool.query(
      'insert into booking_request_items(request_id,trip_id,day_index,price_snapshot) values($1,$2,1,$3)',
      [
        requestId,
        tripId,
        JSON.stringify({
          prices: [
            {
              label: { text: 'Tarif QA', lang: 'fr', origin: 'human' },
              amount_eur: Number(source.amount_eur),
              unit: source.unit,
            },
          ],
        }),
      ],
    );
    await page.goto('/');
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByLabel(en.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.login, exact: true }).click();
    await page.getByLabel(en.code).fill(otp.generateSync({ secret }));
    await page.getByRole('button', { name: en.verify, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(en.requests);
    await page.goto('/prices');
    await page.getByRole('searchbox').fill(String(title.en));
    await page
      .getByRole('button')
      .filter({ has: page.getByText(String(title.en), { exact: true }) })
      .click();
    const dialog = page.getByRole('dialog'),
      amount = dialog.locator('[name="rows.0.amountEur"]');
    await expect
      .poll(async () => Number(await amount.inputValue()))
      .toBe(Number(source.amount_eur));
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await amount.fill(String(Number(source.amount_eur) + 1));
    await dialog.getByRole('button', { name: en.save, exact: true }).click();
    await expect
      .poll(async () =>
        Number(
          (
            await pool.query(
              'select amount_eur from trip_prices where trip_id=$1',
              [tripId],
            )
          ).rows[0].amount_eur,
        ),
      )
      .toBe(Number(source.amount_eur) + 1);
    await dialog.getByRole('button', { name: en.undo, exact: true }).click();
    await expect
      .poll(async () => Number(await amount.inputValue()))
      .toBe(Number(source.amount_eur));
    await dialog.getByRole('button', { name: en.close, exact: true }).click();
    await page.goto('/requests/' + requestId);
    await expect(
      dialog.getByText('Synthetic dashboard visitor', { exact: false }),
    ).toBeVisible();
    await expect(
      dialog.getByText(String(title.fr), { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText('Tarif QA', { exact: true })).toHaveAttribute(
      'lang',
      'fr',
    );
    expect(
      await dialog
        .getByRole('link', { name: en.reply, exact: true })
        .getAttribute('href'),
    ).toContain(encodeURIComponent('Bonjour'));
    await dialog
      .getByRole('button', { name: en.contacted, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              'select status from booking_requests where id=$1',
              [requestId],
            )
          ).rows[0].status,
      )
      .toBe('contacted');
    await dialog.getByRole('button', { name: en.undo, exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              'select status from booking_requests where id=$1',
              [requestId],
            )
          ).rows[0].status,
      )
      .toBe('new');
    await dialog.getByRole('button', { name: en.close, exact: true }).click();
    if (originalSlides.length >= 3) {
      await page.goto('/hero');
      await expect(page.locator('article.card')).toHaveCount(
        originalSlides.length,
      );
      await page
        .locator('article.card')
        .nth(2)
        .getByRole('button', { name: en.first, exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                'select id from hero_slides where archived_at is null order by sort limit 1',
              )
            ).rows[0].id,
        )
        .toBe(originalSlides[2].id);
      await page.getByRole('button', { name: en.undo, exact: true }).click();
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                'select id from hero_slides where archived_at is null order by sort limit 1',
              )
            ).rows[0].id,
        )
        .toBe(originalSlides[0].id);
      await expect(
        page.locator('article.card').nth(2).locator('.link-button'),
      ).toContainText(originalSlides[2].title);
      const handle = page.locator('.drag-handle').nth(2);
      await handle.focus();
      const originalTop = await handle.evaluate(
        (element) =>
          element.closest('article')!.getBoundingClientRect().top + scrollY,
      );
      await page.keyboard.press('Space');
      await expect(handle).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('ArrowUp');
      await expect
        .poll(() =>
          handle.evaluate(
            (element) =>
              element.closest('article')!.getBoundingClientRect().top + scrollY,
          ),
        )
        .toBeLessThan(originalTop - 20);
      await page.keyboard.press('Space');
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                'select id from hero_slides where archived_at is null order by sort offset 1 limit 1',
              )
            ).rows[0].id,
        )
        .toBe(originalSlides[2].id);
      await page.getByRole('button', { name: en.undo, exact: true }).click();
      await expect(
        page.locator('article.card').nth(2).locator('.link-button'),
      ).toContainText(originalSlides[2].title);
      await page.locator('.drag-handle').nth(2).focus();
      await page.keyboard.press('Space');
      await expect(page.locator('.drag-handle').nth(2)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Space');
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                'select id from hero_slides where archived_at is null order by sort limit 1',
              )
            ).rows[0].id,
        )
        .toBe(originalSlides[2].id);
      await page.getByRole('button', { name: en.undo, exact: true }).click();
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                'select id from hero_slides where archived_at is null order by sort limit 1',
              )
            ).rows[0].id,
        )
        .toBe(originalSlides[0].id);
    }
    await page.goto('/trips/' + tripId);
    await expect(
      dialog.getByRole('textbox', { name: en.title + ' · EN', exact: false }),
    ).toHaveValue(String(title.en));
    await dialog.locator('[name="title.en"]').fill(String(title.en) + ' QA');
    for (const locale of ['it', 'es', 'fr', 'de', 'ru', 'tr']) {
      const form = dialog
        .locator('form')
        .filter({ has: page.locator('[name="title.' + locale + '"]') });
      // Only the active content language is mounted; choose from the basics form.
      await dialog
        .locator('form')
        .filter({ has: page.locator('[name^="title."]') })
        .getByRole('button', { name: locale.toUpperCase(), exact: true })
        .click();
      await expect(form.locator('[name="title.' + locale + '"]')).toHaveValue(
        String(title[locale]),
      );
      await form
        .locator('[name="title.' + locale + '"]')
        .fill(String(title[locale]) + ' QA');
    }
    const basics = dialog
      .locator('form')
      .filter({ has: page.locator('[name^="title."]') });
    await basics.locator('.review-check input').check();
    await basics.getByRole('button', { name: en.save, exact: true }).click();
    await expect
      .poll(
        async () =>
          (await pool.query('select title from trips where id=$1', [tripId]))
            .rows[0].title,
      )
      .toEqual(
        Object.fromEntries(
          locales.map((locale) => [locale, String(title[locale]) + ' QA']),
        ),
      );
    await dialog.evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({
      path: '.local/admin/screens/editor-' + info.project.name + '.png',
      fullPage: false,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await pool.query('delete from booking_requests where id=$1', [requestId]);
    await pool.query('delete from trips where id=$1', [tripId]);
    for (const slide of originalSlides)
      await pool.query('update hero_slides set sort=$1 where id=$2', [
        slide.sort,
        slide.id,
      ]);
    await pool.query('delete from audit_log where user_id=$1', [id]);
    await pool.query('delete from revisions where created_by=$1', [id]);
    await pool.query("delete from outbox where data->>'userId'=$1", [id]);
    await pool.query('delete from admin_users where id=$1', [id]);
    await pool.end();
  }
});
