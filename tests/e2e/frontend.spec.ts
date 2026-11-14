import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('discovery, private request contract and real failure state', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/en');
  await expect(
    page
      .getByRole('heading', { name: 'Your trip, your way.', exact: true })
      .first(),
  ).toBeVisible();
  await page.goto('/en/c/sea');
  await page.getByRole('button', { name: 'Private', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Tiran Island by Boat', exact: true })
    .getByRole('link')
    .click();
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(
    sheet.getByRole('button', { name: 'Private', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await sheet.locator('.date-chip').first().click();
  await sheet.getByRole('button', { name: 'Nabq Bay', exact: true }).click();
  await sheet.getByLabel('Your name', { exact: true }).fill('Test visitor');
  await sheet.getByLabel('Country code').selectOption('+39');
  await sheet.getByLabel('WhatsApp number', { exact: true }).fill('1234567890');
  await sheet
    .getByRole('button', { name: 'Send request', exact: true })
    .click();
  await expect(sheet.getByRole('alert')).toContainText("couldn't send");
  await page.route('**/v1/requests', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.format).toBe('private');
    expect(body).not.toHaveProperty('estimate_eur');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ref: 'STL-E2E123',
        estimate_eur: null,
        whatsapp_url: 'https://wa.me/201069012881?text=Test',
        message: 'Test fixture confirmation',
      }),
    });
  });
  await sheet
    .getByRole('button', { name: 'Send request', exact: true })
    .click();
  await expect(sheet.locator('.confirmation h2')).toHaveText(
    'Your request is in.',
  );
  await expect(
    sheet.getByRole('link', { name: 'Continue on WhatsApp' }),
  ).toHaveAttribute('href', /wa\.me/);
  expect(errors).toEqual([]);
});
test('home/trip accessibility, no overflow, screenshots', async ({
  page,
}, testInfo) => {
  for (const path of ['/en', '/en/t/quad-bike-safari']) {
    await page.goto(path);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    const violations = (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations;
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path:
        'docs/screens/' +
        testInfo.project.name +
        (path === '/en' ? '-home' : '-trip') +
        '.png',
      fullPage: true,
      scale: 'css',
    });
  }
});
test('builder survives reload, mobile widths, core locales and RTL', async ({
  page,
}) => {
  await page.goto('/en/t/cairo-plane-1-day');
  await page.getByRole('button', { name: /Add to my trip/ }).click();
  await page.goto('/en/t/quad-bike-safari');
  await page.getByRole('button', { name: /Add to my trip/ }).click();
  await page.goto('/en/my-trip');
  await expect(
    page.getByRole('heading', { name: 'Quad Bike Safari' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /Cairo by Plane/ }),
  ).toBeVisible();
  for (const locale of ['it', 'es', 'fr', 'de', 'ru', 'tr', 'ar']) {
    await page.goto('/' + locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/en/c/sea');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('trip content and WhatsApp work without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/en/t/quad-bike-safari');
  await expect(
    page.getByRole('heading', { name: 'Quad Bike Safari', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'WhatsApp', exact: true }).first(),
  ).toHaveAttribute('href', /^https:\/\/wa.me\//);
  await context.close();
});
