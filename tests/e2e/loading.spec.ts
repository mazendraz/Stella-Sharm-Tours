import { test, expect } from '@playwright/test';
import en from '../../apps/web/messages/en.json' with { type: 'json' };
import type { Page } from '@playwright/test';

/**
 * Holds client-side navigation payloads (React Server Component requests)
 * until `release` is called, and refuses prefetches so the click really waits
 * on the network. Full document loads pass through.
 */
async function slowNavigation(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  await page.route('**/*', async (route) => {
    const headers = route.request().headers();
    if (headers['next-router-prefetch']) return route.abort();
    if (headers['rsc']) {
      await gate;
      return route.continue();
    }
    return route.continue();
  });
  return () => release();
}

// The loading layer must only appear for genuinely slow work, never cover
// server-rendered content, and never be needed to see a page.

test('first load shows content immediately with no overlay or progress bar', async ({
  page,
}) => {
  await page.goto('/en/c/sea');
  await expect(page.locator('h1')).toBeVisible();
  const bar = page.locator('.nav-progress');
  await expect(bar).toHaveClass(/idle/);
  await expect(bar).toHaveCSS('opacity', '0');
  // Nothing fixed and full-screen sits over the page.
  const overlays = await page.evaluate(
    () =>
      [...document.querySelectorAll('body *')].filter((el) => {
        const s = getComputedStyle(el),
          r = el.getBoundingClientRect();
        return (
          s.position === 'fixed' &&
          s.visibility !== 'hidden' &&
          Number(s.opacity) > 0 &&
          r.width >= innerWidth * 0.9 &&
          r.height >= innerHeight * 0.9
        );
      }).length,
  );
  expect(overlays).toBe(0);
  await expect(page.locator('.nav-slow')).toHaveCount(0);
});

test('slow navigation shows the bar, then the slow-connection notice, and clears', async ({
  page,
}) => {
  const release = await slowNavigation(page);
  await page.goto('/en');
  await page.clock.install();
  await page.locator('a[href^="/en/c/"]').first().click();
  await page.clock.runFor(300);
  await expect(page.locator('.nav-progress')).toHaveClass(/pending/);
  await expect(page.locator('.nav-slow')).toHaveCount(0);
  await page.clock.runFor(8000);
  const notice = page.locator('.nav-slow');
  await expect(notice).toContainText(en.navSlow);
  await expect(
    notice.getByRole('button', { name: en.retry, exact: true }),
  ).toBeVisible();
  release();
  await expect(page).toHaveURL(/\/en\/c\//);
  await expect(page.locator('.nav-progress')).toHaveClass(/idle/);
  await expect(notice).toHaveCount(0);
});

test('fast navigation never flashes the bar', async ({ page }) => {
  await page.goto('/en');
  const states: string[] = [];
  await page.exposeFunction('report', (s: string) => states.push(s));
  await page.evaluate(() => {
    const bar = document.querySelector('.nav-progress')!;
    new MutationObserver(() =>
      (window as unknown as { report: (s: string) => void }).report(
        bar.className,
      ),
    ).observe(bar, { attributes: true });
  });
  await page.locator('a[href^="/en/c/"]').first().click();
  await expect(page).toHaveURL(/\/en\/c\//);
  // Same-page links and in-page history (search panel) never start it.
  expect(states.filter((s) => s.includes('slow'))).toEqual([]);
});

test('reduced motion: a calm static bar, no animation', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await slowNavigation(page);
  await page.goto('/en');
  await page.clock.install();
  await page.locator('a[href^="/en/c/"]').first().click();
  await page.clock.runFor(300);
  const span = page.locator('.nav-progress span');
  await expect(span).toHaveCSS('animation-name', 'none');
  await expect(span).toHaveCSS('transform', 'none');
  await context.close();
});

test('without JavaScript every page is complete and no loading state shows', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const path of [
    '/en',
    '/en/c/sea',
    '/en/t/quad-bike-safari',
    '/it/faq',
  ]) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.nav-slow, .skeleton-group')).toHaveCount(0);
    expect(await page.locator('[hidden] h1').count()).toBe(0);
  }
  await context.close();
});

test('a broken image falls back to the brand placeholder with its alt text', async ({
  page,
}) => {
  await page.route(/\.(jpe?g|webp|avif)(\?|$)/, (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.goto('/en/c/sea');
  const fallback = page.locator('.media-placeholder[role="img"]').first();
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('aria-label', /.+/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
