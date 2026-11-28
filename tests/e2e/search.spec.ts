import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const open = async (page: Page, name = 'Search trips') => {
  await expect(page.locator('[data-enhanced=true]')).toBeVisible();
  await page.getByRole('button', { name, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
};

test('finds a trip with a typo and opens it from the keyboard', async ({
  page,
}) => {
  await page.goto('/en');
  const dialog = await open(page);
  // Before typing: collections and suggested trips.
  await expect(
    dialog.getByRole('heading', { name: 'Suggested' }),
  ).toBeVisible();
  await expect(dialog.getByRole('option').first()).toBeVisible();
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('tiren');
  const first = dialog.getByRole('option').first();
  await expect(first).toContainText('Tiran Island by Boat');
  await expect(first).toContainText(/from|On request/);
  await input.press('ArrowDown');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/en\/t\/tiran-island-boat$/);
  await expect(
    page.getByRole('heading', { name: 'Tiran Island by Boat' }),
  ).toBeVisible();
});

test('Escape and Back close the panel and return focus', async ({ page }) => {
  await page.goto('/en');
  let dialog = await open(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Search trips', exact: true }),
  ).toBeFocused();
  await expect(page).toHaveURL(/\/en$/);
  dialog = await open(page);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/en$/);
});

test('shows a no-result message without leaking the query', async ({
  page,
}) => {
  await page.goto('/en');
  const dialog = await open(page);
  await dialog.getByRole('combobox').fill('xqzt');
  await expect(dialog.getByText('No trip matches “xqzt”')).toBeVisible();
  const wa = dialog.getByRole('link', { name: /Ask us on WhatsApp/ });
  if (await wa.count())
    expect(await wa.getAttribute('href')).not.toContain('xqzt');
  // Suggestions stay available under the message.
  await expect(dialog.getByRole('option').first()).toBeVisible();
});

test('search panel passes axe with results open', async ({ page }) => {
  await page.goto('/en');
  const dialog = await open(page);
  await dialog.getByRole('combobox').fill('dolphin');
  await expect(dialog.getByRole('option').first()).toContainText('Dolphin');
  const { violations } = await new AxeBuilder({ page })
    .include('.search-panel')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
});

test('works in Russian and in right-to-left Arabic', async ({ page }) => {
  await page.goto('/ru');
  let dialog = await open(page, 'Поиск экскурсий');
  await dialog.getByRole('combobox').fill('дельфины');
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await expect(dialog.getByRole('option').first()).toHaveAttribute(
    'href',
    '/ru/t/dolphin-show',
  );
  await page.keyboard.press('Escape');
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  dialog = await open(
    page,
    (await page.locator('.nav-search').getAttribute('aria-label'))!,
  );
  await dialog.getByRole('combobox').fill('دلافين');
  await expect(dialog.getByRole('option').first()).toHaveAttribute(
    'href',
    '/ar/t/dolphin-show',
  );
});
