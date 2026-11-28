import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { passwordHash } from '../../apps/api/src/auth';
import { localDatabase } from '../real-api/setup';
import { locales } from '../../packages/shared/src/index';
import en from '../../apps/admin/messages/en.json' with { type: 'json' };
import it from '../../apps/admin/messages/it.json' with { type: 'json' };
import es from '../../apps/admin/messages/es.json' with { type: 'json' };
import fr from '../../apps/admin/messages/fr.json' with { type: 'json' };
import de from '../../apps/admin/messages/de.json' with { type: 'json' };
import ru from '../../apps/admin/messages/ru.json' with { type: 'json' };
import tr from '../../apps/admin/messages/tr.json' with { type: 'json' };
import { screenPath } from '../screens';
const messages = { en, it, es, fr, de, ru, tr };
test('seven-language login and authenticated navigation, accessibility and private offline shell', async ({
  page,
  context,
}, info) => {
  test.setTimeout(300000);
  const { pool } = await localDatabase(
    process.env.STELLA_INTEGRATION_VERIFY === '1'
      ? 'verification'
      : 'development',
  );
  const id = randomUUID(),
    email = id + '@example.test',
    password = 'QA-' + randomBytes(24).toString('base64url');
  const errors: string[] = [];
  let checkingOffline = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().includes('401') &&
      !(checkingOffline && message.text().includes('ERR_INTERNET_DISCONNECTED'))
    )
      errors.push(message.text());
  });
  try {
    await pool.query(
      'insert into admin_users(id,email,name,role,password_hash) values($1,$2,$3,$4,$5)',
      [id, email, 'Admin browser QA', 'owner', await passwordHash(password)],
    );
    await page.goto('/');
    const handoffDirectory = screenPath('current', 'admin', info.project.name);
    if (process.env.STELLA_INTEGRATION_VERIFY === '1')
      await mkdir(handoffDirectory, { recursive: true });
    for (const locale of locales) {
      await page
        .getByLabel(messages.en.language, { exact: true })
        .or(page.locator('.language-select select'))
        .first()
        .selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(
        page.getByRole('heading', {
          name: messages[locale].login,
          exact: true,
        }),
      ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (process.env.STELLA_INTEGRATION_VERIFY === '1')
        await page.screenshot({
          path: `${handoffDirectory}/login-${locale}.jpg`,
          type: 'jpeg',
          quality: 80,
          scale: 'css',
          animations: 'disabled',
        });
    }
    await page.locator('.language-select select').selectOption('en');
    await page.getByLabel(en.email, { exact: true }).fill(email);
    await page.getByLabel(en.password, { exact: true }).fill(password);
    await page.getByRole('button', { name: en.login, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(en.overview);
    const native = {
      en: 'English',
      it: 'Italiano',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
      ru: 'Русский',
      tr: 'Türkçe',
    } as const;
    const switchTo = async (locale: keyof typeof native) => {
      await page
        .locator('.avatar-btn:visible, .account-trigger:visible')
        .first()
        .click();
      await page
        .getByRole('menuitemradio', { name: native[locale], exact: true })
        .click();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    };
    for (const locale of locales) {
      await switchTo(locale);
      await page.goto('/more');
      await expect(page.locator('main h1')).toHaveText(messages[locale].more);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await switchTo('en');
    for (const [path, heading] of [
      ['', 'overview'],
      ['requests', 'requests'],
      ['trips', 'trips'],
      ['packages', 'packages'],
      ['collections', 'collections'],
      ['prices', 'prices'],
      ['homepage', 'homepage'],
      ['hero', 'hero'],
      ['media', 'media'],
      ['pages', 'pages'],
      ['pages/faq', 'faq'],
      ['translations', 'translations'],
      ['settings/languages', 'languageSettings'],
      ['settings', 'settings'],
      ['team', 'team'],
      ['activity', 'activity'],
      ['account', 'account'],
    ] as const) {
      await page.goto('/' + path);
      await expect(page.locator('main h1').first()).toHaveText(en[heading]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator('.skeleton')).toHaveCount(0, {
        timeout: 20000,
      });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (process.env.STELLA_INTEGRATION_VERIFY === '1')
        await page.screenshot({
          path: `${handoffDirectory}/${path.replace(/\//g, '-') || 'overview'}.jpg`,
          type: 'jpeg',
          quality: 80,
          scale: 'css',
          animations: 'disabled',
        });
    }
    await page.goto('/more');
    await page.screenshot({
      path: `.local/admin/screens/more-${info.project.name}.png`,
      fullPage: false,
    });
    if (process.env.STELLA_INTEGRATION_VERIFY === '1')
      await page.screenshot({
        path: `${handoffDirectory}/more.jpg`,
        type: 'jpeg',
        quality: 80,
        scale: 'css',
        animations: 'disabled',
      });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.active),
        ),
      )
      .toBe(true);
    checkingOffline = true;
    await context.setOffline(true);
    await page.goto('/requests');
    await expect(page.locator('#notice')).toHaveText(en.offline);
    if (process.env.STELLA_INTEGRATION_VERIFY === '1')
      await page.screenshot({
        path: `${handoffDirectory}/offline.jpg`,
        type: 'jpeg',
        quality: 80,
        scale: 'css',
        animations: 'disabled',
      });
    const cached = await page.evaluate(async () => {
      const cache = await caches.open('stella-admin-shell-v2');
      return (await cache.keys()).map(
        (request) => new URL(request.url).pathname,
      );
    });
    expect(
      cached.some((path) => path.includes('/v1/') || path === '/requests'),
    ).toBe(false);
    await context.setOffline(false);
    await page.goto('/more');
    await expect(page.locator('main h1')).toHaveText(en.more);
    checkingOffline = false;
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false).catch(() => {});
    await pool.query('delete from audit_log where user_id=$1', [id]);
    await pool.query('delete from revisions where created_by=$1', [id]);
    await pool.query("delete from outbox where data->>'userId'=$1", [id]);
    await pool.query('delete from admin_users where id=$1', [id]);
    await pool.end();
  }
});

test('production admin HTML uses fresh trusted nonces and closed private boundaries', async ({
  request,
}) => {
  const nonces = new Set<string>();
  for (const path of ['/', '/setup', '/unexpected.page']) {
    const response = await request.get(path, {
      headers: {
        'x-nonce': 'forged',
        'content-security-policy': "script-src 'unsafe-inline'",
      },
    });
    const csp = response.headers()['content-security-policy'] ?? '',
      nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(Buffer.from(nonce ?? '', 'base64')).toHaveLength(16);
    expect(csp).not.toContain('forged');
    expect(
      csp.split(';').find((rule) => rule.trim().startsWith('script-src')),
    ).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    for (const script of (await response.text()).matchAll(/<script\b([^>]*)>/g))
      expect(script[1]).toContain('nonce="' + nonce + '"');
    nonces.add(nonce!);
  }
  expect(nonces.size).toBe(3);
});
