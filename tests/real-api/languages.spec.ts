import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { locales, coreLocaleOptions } from '../../packages/shared/src/index';
import { bundledCoreText } from '../../packages/shared/src/i18n/core-content';
import en from '../../apps/web/messages/en.json' with { type: 'json' };
import it from '../../apps/web/messages/it.json' with { type: 'json' };
import es from '../../apps/web/messages/es.json' with { type: 'json' };
import fr from '../../apps/web/messages/fr.json' with { type: 'json' };
import de from '../../apps/web/messages/de.json' with { type: 'json' };
import ru from '../../apps/web/messages/ru.json' with { type: 'json' };
import tr from '../../apps/web/messages/tr.json' with { type: 'json' };
import { minTarget } from '../targets';
const messages = { en, it, es, fr, de, ru, tr };
for (const locale of locales)
  test(
    locale + ' actual translated content and language switch',
    async ({ page, request }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('/en');
      await page.locator('.languages summary').click();
      const language = coreLocaleOptions.find(
        (option) => option.code === locale,
      )!;
      await page
        .locator('.language-list')
        .getByRole('link', { name: language.name, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp('/' + locale + '$'));
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('.hero-copy h1')).toContainText(
        bundledCoreText('Your trip, your way.', locale)!,
      );
      await expect(page.locator('.auto-notice')).toHaveCount(0);
      await page.goto('/' + locale + '/c/sea');
      await expect(page.locator('h1').first()).toContainText(
        bundledCoreText('The Red Sea', locale)!,
      );
      await page.goto('/' + locale + '/t/quad-bike-safari');
      await expect(
        page.getByRole('heading', {
          name: bundledCoreText('Quad Bike Safari', locale)!,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page).toHaveTitle(
        new RegExp(bundledCoreText('Quad Bike Safari', locale)!),
      );
      const api =
        process.env.STELLA_INTEGRATION_VERIFY === '1'
          ? 'http://localhost:4984'
          : 'http://localhost:4000';
      const { cover } = await (
        await request.get(
          api + '/v1/public/trips/quad-bike-safari?locale=' + locale,
        )
      ).json();
      expect(cover.alt.lang).toBe(locale);
      await expect(
        page
          .locator('.gallery')
          .getByRole('img', { name: cover.alt.text })
          .first(),
      ).toBeVisible();
      await expect(
        page
          .getByText(bundledCoreText('Every day', locale)!, { exact: true })
          .first(),
      ).toBeVisible();
      await page
        .getByRole('button', { name: messages[locale].request, exact: true })
        .click();
      const sheet = page.getByRole('dialog').last();
      await expect(
        sheet.getByLabel(messages[locale].name, { exact: true }),
      ).toBeVisible();
      await expect(
        sheet.getByRole('button', {
          name: messages[locale].sendRequest,
          exact: true,
        }),
      ).toBeVisible();
      // Measure the finished surface, rather than text composited through
      // the finite opening fade against the darker gallery/backdrop.
      await expect(sheet).toHaveCSS('opacity', '1');
      const day = sheet.locator('.range-day:enabled').first();
      const target = await day.boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(minTarget);
      expect(target?.height).toBeGreaterThanOrEqual(minTarget);
      const send = sheet.getByRole('button', {
        name: messages[locale].sendRequest,
        exact: true,
      });
      await expect(send).toBeEnabled();
      await send.press('Enter');
      await expect(day).toBeFocused();
      await expect(day).toHaveAccessibleDescription(messages[locale].invalid);
      await page.keyboard.press('Enter');
      await expect(day).toHaveAttribute('aria-pressed', 'true');
      await expect(sheet.locator('.range-field .field-error')).toHaveCount(0);
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
      // axe restores animation styles; allow the finite opening fade to finish.
      await expect(sheet).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: '.local/languages/' + info.project.name + '-' + locale + '.png',
        fullPage: true,
        animations: 'disabled',
      });
      if (info.project.name === 'desktop' && locale === 'tr')
        await sheet.screenshot({
          path: '.local/languages/desktop-tr-dialog.png',
          animations: 'disabled',
        });
      await page.goto('/' + locale + '/t/qa-trip-does-not-exist');
      await expect(
        page.getByRole('heading', { name: messages[locale].notFound }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('main')
          .getByRole('link', { name: messages[locale].home }),
      ).toHaveAttribute('href', '/' + locale);
    },
  );
