import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import en from '../../apps/web/messages/en.json' with { type: 'json' };
import it from '../../apps/web/messages/it.json' with { type: 'json' };

// Floating WhatsApp button: numbers come from the site settings (fixture:
// primary +201069012881, secondary +201008605904), the line depends on the
// language, the message depends on the page, and it must never cover the tab
// bar, the booking bar or content.

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

async function waHref(page: Page) {
  const link = page.locator('a.wa-float');
  await expect(link).toBeVisible();
  return new URL((await link.getAttribute('href'))!);
}

test('main line and general message in English, second line in Italian', async ({
  page,
}) => {
  await page.goto('/en');
  const enUrl = await waHref(page);
  expect(enUrl.origin + enUrl.pathname).toBe('https://wa.me/201069012881');
  expect(enUrl.searchParams.get('text')).toBe(en.waMsgGeneral);
  await expect(page.locator('a.wa-float')).toHaveAccessibleName(en.waFloat);
  await page.goto('/it');
  const itUrl = await waHref(page);
  expect(itUrl.pathname).toBe('/201008605904');
  expect(itUrl.searchParams.get('text')).toBe(it.waMsgGeneral);
});

test('trip pages prefill the trip and its link; FAQ has its own message', async ({
  page,
}) => {
  await page.goto('/en/t/quad-bike-safari');
  await expect
    .poll(async () => (await waHref(page)).searchParams.get('text'))
    .toContain('/en/t/quad-bike-safari');
  await page.goto('/en/faq');
  expect((await waHref(page)).searchParams.get('text')).toBe(en.waMsgFaq);
});

test('never covers the tab bar, the booking bar or causes a layout shift', async ({
  page,
}, info) => {
  await page.goto('/en/t/quad-bike-safari');
  const wa = await page.locator('a.wa-float').boundingBox();
  expect(wa).not.toBeNull();
  // 44 px minimum touch target.
  expect(wa!.width).toBeGreaterThanOrEqual(44);
  expect(wa!.height).toBeGreaterThanOrEqual(44);
  for (const selector of ['.tabbar', '.trip-sticky button.button.ink']) {
    const other = page.locator(selector).first();
    if (await other.isVisible()) {
      const box = await other.boundingBox();
      expect(overlaps(wa!, box!), selector + ' on ' + info.project.name).toBe(
        false,
      );
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const shift = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          })[])
            if (!entry.hadRecentInput) total += entry.value;
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => done(total), 1500);
      }),
  );
  expect(shift).toBeLessThan(0.1);
  // Keyboard users reach it; it has a visible label and passes axe.
  await page.locator('a.wa-float').focus();
  await expect(page.locator('a.wa-float')).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .include('a.wa-float')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
