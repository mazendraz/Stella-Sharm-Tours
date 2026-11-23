import { test, expect } from '@playwright/test';
import en from '../../apps/web/messages/en.json' with { type: 'json' };
import it from '../../apps/web/messages/it.json' with { type: 'json' };
import es from '../../apps/web/messages/es.json' with { type: 'json' };
import fr from '../../apps/web/messages/fr.json' with { type: 'json' };
import de from '../../apps/web/messages/de.json' with { type: 'json' };
import ru from '../../apps/web/messages/ru.json' with { type: 'json' };
import tr from '../../apps/web/messages/tr.json' with { type: 'json' };

test('a missing trip offers recovery in each core language', async ({
  page,
}) => {
  for (const [locale, messages] of Object.entries({
    en,
    it,
    es,
    fr,
    de,
    ru,
    tr,
  })) {
    const response = await page.goto(
      '/' + locale + '/t/qa-trip-does-not-exist',
    );
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: messages.notFound }),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: messages.home }),
    ).toHaveAttribute('href', '/' + locale);
  }
});

test('trip return time renders in all seven core locales', async ({ page }) => {
  for (const [locale, messages] of Object.entries({
    en,
    it,
    es,
    fr,
    de,
    ru,
    tr,
  })) {
    await page.goto('/' + locale + '/t/mount-sinai-st-catherine');
    const fact = page
      .getByText(messages.returnTime, { exact: true })
      .locator('..');
    await expect(fact).toContainText('13:00–13:30');
  }
});
test('new core languages detect correctly and use local UI and phone defaults', async ({
  page,
  request,
}) => {
  // Test the site-language default when the browser has no preferred region.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'en' });
  });
  for (const [locale, label, code] of [
    ['fr', 'Demander', 'FR'],
    ['de', 'Anfragen', 'DE'],
    ['tr', 'Talep gönder', 'TR'],
  ] as const) {
    const redirect = await request.get('/', {
      headers: { 'Accept-Language': locale + '-' + locale.toUpperCase() },
      maxRedirects: 0,
    });
    expect(redirect.headers().location).toMatch(new RegExp('/' + locale + '$'));
    await page.goto('/' + locale + '/t/quad-bike-safari');
    await expect(page.locator('.auto-notice')).toHaveCount(0);
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#booking-country')).toHaveAttribute(
      'data-country',
      code,
    );
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
test('returning to a collection restores its scroll without replaying its entrance', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/en');
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  const open = page.getByRole('link', {
    name: 'See private trips',
    exact: true,
  });
  await open.click();
  const collection = page.locator('.panel-collection');
  await collection.evaluate((element) =>
    Promise.all(element.getAnimations().map(({ finished }) => finished)),
  );
  const scroller = collection.locator('.panel-scroll');
  await scroller.evaluate((element) => {
    element.scrollTop = 180;
  });
  const trip = collection
    .getByRole('heading', { name: 'Private Speed Boat (VIP)', exact: true })
    .getByRole('link');
  await trip.scrollIntoViewIfNeeded();
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const offset = await scroller.evaluate((element) => element.scrollTop);
  await trip.click();
  const detail = page.locator('.panel-trip');
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: en.close, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/c\/private$/);
  await expect(collection).toHaveClass(/\brestored\b/);
  await expect(collection).toHaveCSS('animation-name', 'none');
  await expect
    .poll(() =>
      scroller.evaluate(
        (element, savedOffset) => Math.abs(element.scrollTop - savedOffset),
        offset,
      ),
    )
    .toBeLessThan(3);

  await trip.click();
  await expect(detail).toBeVisible();
  await page.goBack();
  await expect(collection).toHaveClass(/\brestored\b/);
  await expect(collection).toHaveCSS('animation-name', 'none');
  await collection.getByRole('button', { name: en.close, exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(collection).toHaveCount(0);
  await open.click();
  await expect(collection).toBeVisible();
  await expect(collection).toHaveCSS('animation-name', 'collection-open');
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
  await expect(
    sheet.getByRole('button', { name: 'Send request' }),
  ).toBeEnabled();
  await sheet.getByRole('button', { name: 'Send request' }).press('Enter');
  await expect(sheet.locator('.range-field .field-error')).toBeVisible();
  const firstDay = sheet.locator('.range-day:enabled').first();
  await expect(firstDay).toBeFocused();
  await expect(firstDay).toHaveAccessibleDescription(en.invalid);
  const { width, height } = (await firstDay.boundingBox())!;
  expect(width).toBeGreaterThanOrEqual(44);
  expect(height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(firstDay).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.locator('.range-field .field-error')).toHaveCount(0);
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
