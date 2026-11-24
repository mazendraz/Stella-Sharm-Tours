import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { locales } from '../../packages/shared/src/index';
import { bundledCoreText } from '../../packages/shared/src/i18n/core-content';
import { screenPath } from '../screens';

test('real trip content and WhatsApp remain usable without JavaScript', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.use.viewport,
  });
  try {
    const page = await context.newPage();
    for (const locale of locales) {
      const response = await page.goto(
        `http://localhost:4983/${locale}/t/quad-bike-safari`,
      );
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole('heading', {
          name: bundledCoreText('Quad Bike Safari', locale)!,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('.price-row')).toHaveCount(2);
      await expect(
        page.locator('.trip-body a[href^="https://wa.me/"]'),
      ).toBeVisible();
      await expect(page.locator('.trip-sticky .button.ink')).toBeDisabled();
      await page.goto(
        `http://localhost:4983/${locale}/t/quad-bike-safari?format=private`,
      );
      const messages = JSON.parse(
        await readFile(`apps/web/messages/${locale}.json`, 'utf8'),
      );
      await expect(page.locator('.trip-sticky strong bdi')).toHaveText(
        messages.onRequest,
      );
    }
  } finally {
    await context.close();
  }
});

test('public handoff inventory uses real API content and matching image candidates', async ({
  page,
  request,
}, info) => {
  test.setTimeout(240000);
  const screenshots = screenPath('current', info.project.name);
  await mkdir(screenshots, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const response = await request.get(
    'http://localhost:4984/v1/public/collections?locale=en',
  );
  expect(response.ok()).toBe(true);
  const collections: { slug: string }[] = await response.json();
  expect(collections).toHaveLength(7);
  const trips = new Set<string>();
  for (const collection of collections) {
    const detail = await request.get(
      `http://localhost:4984/v1/public/collections/${collection.slug}?locale=en`,
    );
    expect(detail.ok()).toBe(true);
    const value = await detail.json();
    for (const trip of value.trips) trips.add(trip.slug);
  }
  expect(trips.size).toBe(38);
  const routes = [
    '/en',
    ...collections.map((collection) => '/en/c/' + collection.slug),
    ...[...trips].sort().map((slug) => '/en/t/' + slug),
    '/en/my-trip',
    '/en/contact',
    '/en/faq',
    '/en/legal/terms',
    '/en/legal/privacy',
    '/en/legal/cancellation',
    ...locales
      .filter((locale) => locale !== 'en')
      .map((locale) => '/' + locale),
  ];
  const representative = new Set([
    '/en',
    '/en/c/sea',
    '/en/c/private',
    '/en/c/all',
    '/en/t/quad-bike-safari',
    '/en/my-trip',
    '/en/contact',
    '/en/faq',
    '/en/legal/terms',
    '/en/legal/privacy',
    '/en/legal/cancellation',
    ...locales.map((locale) => '/' + locale),
  ]);
  const inventory: { path: string; image: string; fullPage: boolean }[] = [];
  async function capture(path: string, name: string, fullPage = false) {
    await page.evaluate(() => document.fonts.ready);
    if (fullPage) {
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((done) => requestAnimationFrame(done));
        }
        window.scrollTo(0, 0);
      });
    }
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images]
          .filter(
            (image) =>
              image.getClientRects().length &&
              (image.loading !== 'lazy' ||
                image.getBoundingClientRect().top < innerHeight),
          )
          .map((image) =>
            Promise.race([
              image.decode().catch(() => {}),
              new Promise((done) => setTimeout(done, 3000)),
            ]),
          ),
      );
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const image = `${name}.jpg`;
    await page.screenshot({
      path: `${screenshots}/${image}`,
      type: 'jpeg',
      quality: 80,
      fullPage,
      scale: 'css',
      animations: 'disabled',
    });
    inventory.push({ path, image, fullPage });
  }
  for (const path of routes) {
    if (info.project.name === 'tablet' && !representative.has(path)) continue;
    const result = await page.goto(path);
    expect(result?.status(), path).toBe(200);
    await expect(page.locator('main h1').first()).toBeVisible();
    if (path === '/en') {
      const source = await page
        .locator('.hero-background img')
        .first()
        .getAttribute('srcset');
      expect(source).toBeTruthy();
      for (const candidate of source!.split(',')) {
        const match = candidate.trim().match(/^(\S+)\s+(\d+)w$/);
        expect(match, candidate).not.toBeNull();
        const actual = await page.evaluate(async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image.naturalWidth;
        }, match![1]!);
        expect(actual, candidate).toBe(Number(match![2]));
      }
    }
    await capture(
      path,
      path.slice(1).replaceAll('/', '-'),
      representative.has(path),
    );
  }
  await page.goto('/en/t/quad-bike-safari');
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByRole('dialog').last()).toBeVisible();
  await capture('/en/t/quad-bike-safari#request', 'request');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Add to my trip/ }).click();
  await page.goto('/en/my-trip');
  await expect(
    page.getByRole('heading', { name: 'Quad Bike Safari', exact: true }),
  ).toBeVisible();
  await capture('/en/my-trip#selection', 'builder-selection');
  await page.goto('/en');
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  await page
    .getByRole('link', { name: 'See private trips', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture('/en/c/private#overlay', 'collection-overlay');
  await page.keyboard.press('Escape');
  await page.goto('/en/c/sea');
  await expect(page.locator('[data-collection-ready=true]')).toBeVisible();
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  await page
    .getByRole('heading', { name: 'Tiran Island by Boat', exact: true })
    .getByRole('link')
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture('/en/t/tiran-island-boat#overlay', 'trip-overlay');
  expect(errors).toEqual([]);
  await writeFile(
    `${screenshots}/index.json`,
    JSON.stringify(
      {
        captured: new Date().toISOString(),
        origin: 'http://localhost:4983',
        source:
          'isolated PostgreSQL/API; no booking submission or external contact',
        viewport: page.viewportSize(),
        trips: trips.size,
        collections: collections.length,
        inventory,
      },
      null,
      2,
    ) + '\n',
  );
});
