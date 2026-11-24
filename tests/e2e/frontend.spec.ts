import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import {
  addCalendarDays,
  cairoDate,
  minBookingDate,
  type Quote,
} from '../../packages/shared/src/booking';

const itineraryStorage = 'stella.mytrip.v1';
const quad = 'quad-bike-safari';
const privateCar = 'ras-mohammed-private-car';
const withdrawn = 'withdrawn-fixture-trip';

test('opens saved tours from a collection and quotes their custom order', async ({
  page,
}, { project }) => {
  test.setTimeout(100_000);
  const speedBoat = 'private-speed-boat';
  const desktop = project.name === 'desktop';
  const touch = project.name === 'mobile';
  await page.goto('/en');
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  await page
    .getByRole('link', { name: 'See private trips', exact: true })
    .click();
  const collection = page.locator('.panel-collection');
  await collection
    .getByRole('button', {
      name: /Add to my trip · Ras Mohammed — Private Car/,
    })
    .click();
  await collection
    .getByRole('button', { name: /Add to my trip · Private Speed Boat/ })
    .click();
  await expect(collection.getByText('Added to your trip.')).toBeVisible();
  await expect(collection.getByText('Added to your trip.')).toHaveCount(0);
  const shortcut = desktop
    ? collection.getByRole('link', { name: 'Open my trip · 2 picked' })
    : collection.locator('.tabbar [data-mytrip]');
  await shortcut.click();
  await expect(page).toHaveURL(/\/en\/my-trip$/);
  const builder = page.locator('.panel-builder');
  const cards = builder.locator('[data-trip-slug]');
  await expect(cards).toHaveCount(2);
  const moveFrom = await cards.nth(1).getAttribute('data-trip-slug');
  const moveTo = await cards.nth(0).getAttribute('data-trip-slug');
  if (touch) {
    const grip = cards.nth(1).locator('.trip-grip');
    await grip.scrollIntoViewIfNeeded();
    const start = (await grip.boundingBox())!;
    const end = (await cards.first().boundingBox())!;
    const client = await page.context().newCDPSession(page);
    const x = start.x + start.width / 2;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: start.y + start.height / 2 }],
    });
    await expect(cards.nth(1)).toHaveAttribute('data-dragging', 'true');
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: end.y + end.height / 2 }],
    });
    await expect(cards.first()).toHaveAttribute('data-drop-target', 'true');
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await client.detach();
  } else {
    await cards
      .nth(1)
      .getByRole('button', { name: /^Move .* earlier$/ })
      .click();
  }
  await expect(cards.first()).toHaveAttribute('data-trip-slug', moveFrom!);
  await expect(cards.nth(1)).toHaveAttribute('data-trip-slug', moveTo!);
  await page.reload();
  await expect(page.locator('[data-trip-slug]').first()).toHaveAttribute(
    'data-trip-slug',
    moveFrom!,
  );
  await page
    .getByRole('button', { name: 'Request this trip', exact: true })
    .click();
  const sheet = page.locator('.panel-sheet');
  const nextDay = minBookingDate();
  const calendarLabel = (day: string) =>
    Intl.DateTimeFormat('en', { dateStyle: 'full', timeZone: 'UTC' }).format(
      new Date(day + 'T12:00:00Z'),
    );
  if (nextDay.slice(0, 7) === cairoDate().slice(0, 7)) {
    await expect(
      sheet.getByRole('button', { name: calendarLabel(cairoDate()) }),
    ).toBeDisabled();
  }
  const quoted = page.waitForResponse((response) =>
    response.url().endsWith('/v1/requests/quote'),
  );
  await sheet
    .getByRole('button', { name: calendarLabel(nextDay), exact: true })
    .click();
  const quoteResponse = await quoted;
  expect(quoteResponse.ok()).toBe(true);
  const quote = (await quoteResponse.json()) as Quote;
  expect(quote.items.map(({ trip_slug }) => trip_slug)).toEqual([
    moveFrom,
    moveTo,
  ]);
  expect(
    quote.items.find(({ trip_slug }) => trip_slug === privateCar)?.amount_eur,
  ).toBeNull();
  expect(quote.known_eur).toBe(
    quote.items.find(({ trip_slug }) => trip_slug === speedBoat)?.amount_eur,
  );
  await expect(sheet.locator('.estimate')).toContainText('On request');
  await expect(sheet.locator('.estimate-subtotal')).toContainText(
    'Subtotal for tours with prices',
  );
  await sheet.locator('#booking-country').click();
  const search = sheet.getByRole('searchbox', {
    name: 'Search name or calling code',
  });
  await expect(search).toBeFocused();
  await search.fill('+20');
  await sheet.getByRole('button', { name: 'Egypt +20', exact: true }).click();
  await expect(sheet.locator('#booking-country')).toHaveAttribute(
    'data-country',
    'EG',
  );
  await expect(sheet.locator('#booking-country')).toBeFocused();
});

test('warns when the stay misses the final day of a multi-day tour', async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    {
      key: itineraryStorage,
      ids: ['cairo-plane-1-day', 'cairo-plane-2-days-private'],
    },
  );
  for (const locale of ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr']) {
    const messages = JSON.parse(
      await readFile('apps/web/messages/' + locale + '.json', 'utf8'),
    );
    await page.goto('/' + locale + '/my-trip');
    await page
      .getByRole('button', { name: messages.requestTrip, exact: true })
      .click();
    const sheet = page.getByRole('dialog').last();
    const start = minBookingDate();
    const fullDate = new Intl.DateTimeFormat(locale, {
      dateStyle: 'full',
      timeZone: 'UTC',
    });
    let month = start.slice(0, 7);
    async function pick(date: string) {
      const targetMonth = date.slice(0, 7);
      if (month !== targetMonth) {
        await sheet
          .getByRole('button', {
            name: targetMonth < month ? messages.prevMonth : messages.nextMonth,
            exact: true,
          })
          .click();
        month = targetMonth;
      }
      await sheet
        .getByRole('button', {
          name: fullDate.format(new Date(date + 'T12:00:00Z')),
          exact: true,
        })
        .click();
    }
    await pick(start);
    await pick(addCalendarDays(start, 2));
    const warning = sheet.getByText(messages.planNeeds.replace('{days}', '4'), {
      exact: true,
    });
    await expect(warning).toBeVisible();
    await expect(sheet.locator('.quote-items li')).toHaveCount(2);
    await sheet
      .getByRole('button', { name: messages.clearDates, exact: true })
      .click();
    await pick(start);
    await pick(addCalendarDays(start, 3));
    await expect(warning).toHaveCount(0);
  }
});

test('shows the dated primary option and asks for review when the estimate changes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const cases = [
    ['en', 'GB', '020 7946 0958', '+442079460958'],
    ['it', 'IT', '02 1234 5678', '+390212345678'],
    ['es', 'ES', '+44 (0)20 7946 0958', '+442079460958'],
    ['fr', 'FR', '06 12 34 56 78', '+33612345678'],
    ['de', 'DE', '0044 20 7946 0958', '+442079460958'],
    ['ru', 'RU', '8 (912) 345-67-89', '+79123456789'],
    ['tr', 'TR', '0532 123 45 67', '+905321234567'],
  ] as const;
  for (const [locale, country, input, expectedNumber] of cases) {
    const messages = JSON.parse(
      await readFile('apps/web/messages/' + locale + '.json', 'utf8'),
    );
    const errors: string[] = [];
    const logError = (error: Error) => errors.push(error.message);
    page.on('pageerror', logError);
    const figure = (amount: number) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(amount);
    let original: Quote | undefined;
    let submissions = 0;
    let outdatedSubmission: string | undefined;
    let acceptedSubmission: string | undefined;
    const revisedId = 'b'.repeat(64);
    await page.route('**/v1/requests/quote', async (route) => {
      const payload = route.request().postDataJSON();
      expect(payload).not.toHaveProperty('phone');
      expect(payload).not.toHaveProperty('name');
      const response = await route.fetch();
      const quote = (await response.json()) as Quote;
      quote.items[0]!.price_options.reverse();
      original = quote;
      await route.fulfill({ response, json: quote });
    });
    await page.route('**/v1/requests', async (route) => {
      submissions++;
      const body = route.request().postDataJSON();
      expect(body.phone).toBe(expectedNumber);
      expect(body.submission_id).toMatch(/^[a-f0-9]{64}$/);
      if (submissions === 1) {
        outdatedSubmission = body.submission_id;
        expect(body.quote_id).toBe(original!.quote_id);
        await route.fulfill({
          status: 409,
          json: {
            error: { code: 'QUOTE_CHANGED' },
            quote: {
              ...original,
              quote_id: revisedId,
              estimate_eur: 17,
              known_eur: 17,
              items: original!.items.map((item) => ({
                ...item,
                amount_eur: 17,
                price_options: item.price_options.map((option) =>
                  option.id === item.selected_price_id
                    ? { ...option, amount_eur: 17 }
                    : option,
                ),
              })),
            },
          },
        });
      } else {
        expect(body.quote_id).toBe(revisedId);
        if (submissions === 2) {
          expect(body.submission_id).not.toBe(outdatedSubmission);
          acceptedSubmission = body.submission_id;
          await route.abort();
          return;
        }
        expect(body.submission_id).toBe(acceptedSubmission);
        await route.fulfill({
          status: 201,
          json: {
            ref: 'STL-E2EQUOTE',
            estimate_eur: 17,
            whatsapp_url: 'https://wa.me/201069012881?text=Test',
            message: figure(17),
          },
        });
      }
    });
    await page.goto('/' + locale + '/t/' + quad);
    await page
      .getByRole('button', { name: messages.request, exact: true })
      .click();
    const sheet = page.getByRole('dialog').last();
    await expect(
      sheet.getByText(messages.quoteChooseDate, { exact: true }),
    ).toBeVisible();
    await sheet.locator('.range-day:enabled').first().click();
    // Price options are toggle buttons in a labelled group: the dated primary
    // option is pre-selected even though it is not listed first.
    const options = sheet.getByRole('group', {
      name: messages.priceOption,
      exact: true,
    });
    await expect(options.locator('[aria-pressed="true"]')).toHaveAttribute(
      'data-price-id',
      quad + '-0',
    );
    expect(
      await options
        .locator('[data-price-id]')
        .first()
        .getAttribute('data-price-id'),
    ).not.toBe(quad + '-0');
    await expect(sheet.locator('.quote-items li')).toContainText(figure(15));
    await expect(sheet.locator('.estimate')).toContainText(figure(15));
    await sheet.getByRole('button', { name: 'Nabq Bay', exact: true }).click();
    const name = sheet.getByLabel(messages.name, { exact: true });
    await name.fill('Test visitor');
    await sheet.locator('#booking-country').click();
    await sheet.locator('[data-country-option=' + country + ']').click();
    const number = sheet.getByLabel(messages.phone, { exact: true });
    await expect(
      sheet.getByText(messages.phoneHint, { exact: true }),
    ).toBeVisible();
    const send = sheet.getByRole('button', {
      name: messages.sendRequest,
      exact: true,
    });
    await number.fill('0123');
    await send.click();
    await expect(number).toBeFocused();
    await expect(
      sheet.getByText(messages.phoneInvalid, { exact: true }),
    ).toBeVisible();
    expect(submissions).toBe(0);
    await number.fill(input);
    await expect(sheet.locator('#booking-phone-hint')).toHaveText(
      messages.phonePreview + ' ' + expectedNumber,
    );
    await expect(sheet.locator('#booking-phone-hint bdi')).toHaveText(
      expectedNumber,
    );
    await send.click();
    await expect(
      sheet.getByText(messages.quoteChanged, { exact: true }),
    ).toBeFocused();
    await expect(sheet.locator('.estimate')).toContainText(figure(17));
    await expect(name).toHaveValue('Test visitor');
    expect(submissions).toBe(1);
    await send.click();
    await expect(
      sheet.getByText(messages.requestError, { exact: true }),
    ).toBeVisible();
    expect(submissions).toBe(2);
    await send.click();
    await expect(sheet.locator('.confirmation h2')).toHaveText(messages.sent);
    expect(submissions).toBe(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    page.off('pageerror', logError);
    await page.unroute('**/v1/requests/quote');
    await page.unroute('**/v1/requests');
  }
});

test('removes a withdrawn saved tour and requests the remaining mixed itinerary as private', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ key, ids }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(ids));
    },
    { key: itineraryStorage, ids: [quad, withdrawn, privateCar] },
  );
  await page.goto('/en/my-trip');
  const warning = page.getByText('This saved tour is no longer available.', {
    exact: false,
  });
  await expect(warning).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include('.builder')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
  await expect(
    page.getByRole('heading', { name: 'Quad Bike Safari' }),
  ).toBeVisible();
  const request = page.getByRole('button', {
    name: 'Request this trip',
    exact: true,
  });
  await expect(request).toBeDisabled();
  const remove = page.getByRole('button', {
    name: /Remove from my trip · withdrawn fixture trip/,
  });
  await remove.focus();
  await remove.press('Enter');
  await expect(warning).toHaveCount(0);
  await expect(request).toBeEnabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '[]'),
      itineraryStorage,
    ),
  ).toEqual([quad, privateCar]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await request.click();
  const sheet = page.getByRole('dialog').last();
  const format = sheet.getByRole('group', {
    name: 'How you travel',
    exact: true,
  });
  await expect(format.getByText('Private', { exact: true })).toBeVisible();
  await expect(
    format.getByText('This itinerary includes a private-only tour.'),
  ).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Group trips', exact: true }),
  ).toHaveCount(0);
  await sheet.locator('.range-day:enabled').first().click();
  await sheet.getByRole('button', { name: 'Nabq Bay', exact: true }).click();
  await sheet.getByLabel('Your name', { exact: true }).fill('Test visitor');
  await sheet.locator('#booking-country').click();
  await sheet.locator('[data-country-option=IT]').click();
  await sheet
    .getByLabel('WhatsApp number', { exact: true })
    .fill('02 1234 5678');
  await page.route('**/v1/requests', async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ mode: 'multi', format: 'private' });
    expect(
      body.items.map((item: { trip_slug: string }) => item.trip_slug).sort(),
    ).toEqual([quad, privateCar].sort());
    await route.fulfill({
      status: 201,
      json: {
        ref: 'STL-E2EMIXED',
        estimate_eur: null,
        whatsapp_url: 'https://wa.me/201069012881?text=Test',
        message: 'Test fixture confirmation',
      },
    });
  });
  await sheet
    .getByRole('button', { name: 'Send request', exact: true })
    .click();
  await expect(sheet.locator('.confirmation h2')).toHaveText(
    'Your request is in.',
  );
  expect(errors).toEqual([]);
});

test('retries a temporary saved-tour failure without removing any selections', async ({
  page,
}) => {
  const second = 'cairo-plane-1-day';
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    { key: itineraryStorage, ids: [quad, second] },
  );
  await page.route(
    '**/api/trips?*',
    async (route) => {
      const response = await route.fetch();
      const results = await response.json();
      await route.fulfill({
        response,
        json: results.map((result: { slug: string }) =>
          result.slug === second
            ? { slug: second, status: 'unavailable' }
            : result,
        ),
      });
    },
    { times: 1 },
  );
  await page.goto('/en/my-trip');
  await expect(
    page.getByRole('heading', { name: 'Quad Bike Safari' }),
  ).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'temporarily unavailable',
  );
  await expect(
    page.getByText('This saved tour is no longer available.', { exact: false }),
  ).toHaveCount(0);
  const request = page.getByRole('button', {
    name: 'Request this trip',
    exact: true,
  });
  await expect(request).toBeDisabled();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /Cairo by Plane/ }),
  ).toBeVisible();
  await expect(request).toBeEnabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '[]'),
      itineraryStorage,
    ),
  ).toEqual([quad, second]);
  await request.click();
  const sheet = page.getByRole('dialog').last();
  const group = sheet.getByRole('button', { name: 'Group trips', exact: true });
  const privateMode = sheet.getByRole('button', {
    name: 'Private',
    exact: true,
  });
  await expect(group).toHaveAttribute('aria-pressed', 'true');
  await privateMode.click();
  await expect(privateMode).toHaveAttribute('aria-pressed', 'true');
  await expect(group).toHaveAttribute('aria-pressed', 'false');
});

test('localizes saved-tour recovery and required private format in all core languages', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)),
    { key: itineraryStorage, ids: [quad, privateCar, withdrawn] },
  );
  for (const locale of ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr']) {
    const messages = JSON.parse(
      await readFile('apps/web/messages/' + locale + '.json', 'utf8'),
    );
    await page.goto('/' + locale + '/my-trip');
    await expect(page).toHaveTitle(messages.myTrip + ' | Stella Sharm Tours');
    await expect(
      page.getByText(messages.savedTourWithdrawn, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: messages.remove + ' · withdrawn fixture trip',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: messages.requestTrip, exact: true })
      .click();
    const sheet = page.getByRole('dialog').last();
    await expect(
      sheet
        .getByRole('group', { name: messages.format, exact: true })
        .getByText(messages.private, { exact: true }),
    ).toBeVisible();
    await expect(
      sheet.getByText(messages.privateRequired, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

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
  await sheet.locator('.range-day:enabled').first().click();
  await sheet.getByRole('button', { name: 'Nabq Bay', exact: true }).click();
  await sheet.getByLabel('Your name', { exact: true }).fill('Test visitor');
  await sheet.locator('#booking-country').click();
  await sheet.locator('[data-country-option=IT]').click();
  await sheet
    .getByLabel('WhatsApp number', { exact: true })
    .fill('02 1234 5678');
  await sheet
    .getByRole('button', { name: 'Send request', exact: true })
    .click();
  await expect(sheet.getByRole('alert')).toContainText("couldn't confirm");
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
test('renders the trip inclusions card in all core languages', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  for (const locale of ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr']) {
    const messages = JSON.parse(
      await readFile('apps/web/messages/' + locale + '.json', 'utf8'),
    );
    await page.goto('/' + locale + '/t/super-safari-5in1');
    const included = page.locator('.inclusion-group[data-type=include]');
    await expect(
      included.getByRole('heading', { name: messages.include }),
    ).toBeVisible();
    await expect(included.getByRole('listitem')).toHaveCount(5);
    expect(
      await included.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    if (locale === 'en') {
      const results = await new AxeBuilder({ page })
        .include('.inclusion-group[data-type=include]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
      await included.screenshot({ path: info.outputPath('included.png') });
    }
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
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(new URL('/en/t/quad-bike-safari', baseURL).href);
  await expect(
    page.getByRole('heading', { name: 'Quad Bike Safari', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'WhatsApp', exact: true }).first(),
  ).toHaveAttribute('href', /^https:\/\/wa.me\//);
  await context.close();
});
