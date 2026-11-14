import { test, expect } from '@playwright/test';
test('new core languages detect correctly and use local UI and phone defaults', async ({
  page,
  request,
}) => {
  for (const [locale, label, code] of [
    ['fr', 'Demander', '+33'],
    ['de', 'Anfragen', '+49'],
    ['tr', 'Talep gönder', '+90'],
  ] as const) {
    const redirect = await request.get('/', {
      headers: { 'Accept-Language': locale + '-' + locale.toUpperCase() },
      maxRedirects: 0,
    });
    expect(redirect.headers().location).toMatch(new RegExp('/' + locale + '$'));
    await page.goto('/' + locale + '/t/quad-bike-safari');
    await expect(page.locator('.auto-notice')).toHaveCount(0);
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#booking-country')).toHaveValue(code);
    await page.keyboard.press('Escape');
  }
});
test('intercepted routes close by keyboard and restore navigation', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en');
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  const trigger = page.getByRole('link', {
    name: 'See private trips',
    exact: true,
  });
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/c\/private$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/en$/);
  await page.goto('/en/c/sea');
  await expect(page.locator('[data-collection-ready=true]')).toBeVisible();
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();

  await page
    .getByRole('heading', { name: 'Tiran Island by Boat', exact: true })
    .getByRole('link')
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/c\/sea$/);
  await page.goto('/en/t/tiran-island-boat');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Tiran Island by Boat', exact: true }),
  ).toBeVisible();
  const requestButton = page.getByRole('button', {
    name: 'Request',
    exact: true,
  });
  await requestButton.click();
  const sheet = page.getByRole('dialog');
  await page.keyboard.press('Tab');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(requestButton).toBeFocused();
  await page.goto('/en');
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  await page
    .getByRole('link', { name: 'My trip', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/my-trip$/);
  await expect(page.locator('.panel-builder')).toBeVisible();
  await page.screenshot({
    path: 'docs/screens/' + info.project.name + '-builder-drawer.png',
    scale: 'css',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('request validation, public boundaries and localized 404', async ({
  page,
  request,
}) => {
  const unknown = await request.get('/zz');
  expect(unknown.status()).toBe(404);
  const webhook = await request.post('/api/revalidate', {
    data: { tags: ['site'] },
  });
  expect(webhook.status()).toBe(401);
  const invalid = await request.get('/api/trips?slugs=../secret&locale=en');
  expect(invalid.status()).toBe(400);
  await page.goto('/en/t/quad-bike-safari');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Send request' }).click();
  await expect(sheet.locator('[name=start_date]')).toBeFocused();
});
test('responsive screen inventory', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const width =
    info.project.name === 'mobile'
      ? 390
      : info.project.name === 'tablet'
        ? 768
        : 1440;
  await page.setViewportSize({
    width,
    height:
      info.project.name === 'mobile'
        ? 844
        : info.project.name === 'tablet'
          ? 1024
          : 900,
  });
  for (const [name, path] of [
    ['collection', '/en/c/sea'],
    ['private', '/en/c/private'],
    ['packages', '/en/c/all'],
    ['builder', '/en/my-trip'],
    ['contact', '/en/contact'],
    ['faq', '/en/faq'],
    ['legal', '/en/legal/terms'],
    ['russian', '/ru'],
    ['italian', '/it'],
    ['spanish', '/es'],
    ['german', '/de'],
    ['french', '/fr'],
    ['turkish', '/tr'],
    ['rtl', '/ar'],
  ]) {
    await page.goto(path!);
    await page.locator('.loading-state').waitFor({ state: 'detached' });
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 35));
      }
      await Promise.all(
        [...document.images]
          .filter((img) => img.getClientRects().length > 0)
          .map((img) =>
            Promise.race([
              img.decode().catch(() => {}),
              new Promise((resolve) => setTimeout(resolve, 2000)),
            ]),
          ),
      );
      window.scrollTo(0, 0);
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'docs/screens/' + info.project.name + '-' + name + '.png',
      fullPage: true,
      scale: 'css',
    });
  }
  await page.goto('/en/t/quad-bike-safari');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({
    path: 'docs/screens/' + info.project.name + '-request.png',
    scale: 'css',
  });
});
