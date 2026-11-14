import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { localDatabase } from './setup';
test('real catalog, request persistence contract, local SMTP and accessible confirmation', async ({
  page,
  request,
}, info) => {
  expect((await request.get('http://localhost:4000/readyz')).ok()).toBe(true);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/en');
  await expect(
    page
      .getByRole('heading', { name: 'Your trip, your way.', exact: true })
      .first(),
  ).toBeVisible();
  await page.goto('/en/t/quad-bike-safari');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.locator('.date-chip').first().click();
  await sheet.getByRole('button', { name: 'Nabq Bay', exact: true }).click();
  const name = 'Synthetic browser QA ' + info.project.name;
  await sheet.getByLabel('Your name', { exact: true }).fill(name);
  await sheet.getByLabel('Country code').selectOption('+20');
  await sheet
    .getByLabel('WhatsApp number', { exact: true })
    .fill(
      '105550000' +
        ({ mobile: '1', tablet: '2', desktop: '3' }[info.project.name] ?? '4'),
    );
  await expect(
    sheet.getByRole('button', { name: 'Send request', exact: true }),
  ).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === 'http://localhost:4000/v1/requests' &&
      response.request().method() === 'POST',
  );
  await sheet
    .getByRole('button', { name: 'Send request', exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const result = await response.json();
  expect(result.ref).toMatch(/^STL-[0-9A-HJKMNP-TV-Z]{10}$/);
  expect(result.estimate_eur).toBe(15);
  await expect(sheet.locator('.confirmation h2')).toHaveText(
    'Your request is in.',
  );
  await expect(
    sheet.getByRole('link', { name: 'Continue on WhatsApp' }),
  ).toHaveAttribute('href', /^https:\/\/wa.me\//);
  await expect
    .poll(
      async () => {
        const messages = await (
          await request.get('http://127.0.0.1:18025/api/v1/messages')
        ).json();
        return messages.messages.some((message: { Subject: string }) =>
          message.Subject.includes(result.ref),
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const { pool } = await localDatabase();
  try {
    const stored = await pool.query(
      'select r.estimate_eur,i.price_snapshot from booking_requests r join booking_request_items i on i.request_id=r.id where r.ref=$1',
      [result.ref],
    );
    expect(stored.rowCount).toBe(1);
    expect(Number(stored.rows[0].estimate_eur)).toBe(result.estimate_eur);
    expect(stored.rows[0].price_snapshot.prices.length).toBeGreaterThan(0);
  } finally {
    await pool.end();
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `.local/backend-qa/${info.project.name}-confirmation.png`,
    fullPage: true,
  });
});
