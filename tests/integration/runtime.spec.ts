import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { locales } from '../../packages/shared/src/index';

test('nonce CSP protects successful, redirect and dotted HTML responses', async ({
  request,
  page,
}) => {
  const nonces = new Set<string>();
  for (const path of ['/en', '/it', '/', '/untrusted.page']) {
    const response = await request.get(path, {
      maxRedirects: 0,
      headers: {
        'x-nonce': 'attacker-controlled',
        'content-security-policy': "script-src 'unsafe-inline'",
      },
    });
    const csp = response.headers()['content-security-policy'] ?? '';
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(Buffer.from(nonce!, 'base64')).toHaveLength(16);
    expect(csp).not.toContain('attacker-controlled');
    expect(
      csp.split(';').find((value) => value.trim().startsWith('script-src')),
    ).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(csp).toContain("frame-ancestors 'none'");
    nonces.add(nonce!);
    if (path === '/en' || path === '/it') {
      const html = await response.text();
      const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts)
        expect(script[1]).toContain(`nonce="${nonce}"`);
    }
  }
  expect(nonces.size).toBe(4);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/en');
  await expect(page.locator('h1')).toBeVisible();
  expect(errors).toEqual([]);
});
test('production-like proxy, runtime URLs, sitemap, media negotiation and private boundaries', async ({
  page,
  request,
}) => {
  for (const port of [4984, 4985, 4986])
    expect((await request.get(`http://localhost:${port}/readyz`)).ok()).toBe(
      true,
    );
  expect((await request.get('/api/revalidate')).status()).toBe(404);
  expect((await request.get('/readyz')).status()).toBe(404);
  expect((await request.get('/media/quarantine/private.jpg')).status()).toBe(
    404,
  );
  expect(
    (
      await request.post('/api/client-error', {
        headers: { Origin: 'https://untrusted.example.test' },
        data: { code: 'web_client_error' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/client-error', {
        headers: {
          Origin: 'http://localhost:4983',
          'Content-Type': 'application/json',
        },
        data: '{"code":"web_client_error"}',
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await request.post('/api/client-error', {
        headers: { Origin: 'http://localhost:4983' },
        data: { code: 'web_client_error', phone: 'never forwarded' },
      })
    ).status(),
  ).toBe(400);
  await page.goto('/fr');
  const html = await page.content();
  expect(html).not.toContain('example.invalid');
  expect(html).toContain('http://localhost:4984');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).not.toContain('example.invalid');
  for (const locale of locales)
    expect(sitemap).toContain(`http://localhost:4983/${locale}`);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('http://localhost:4983/sitemap.xml');
  const site = await (
    await request.get('http://localhost:4984/v1/public/site?locale=en')
  ).json();
  const image = site.hero_slides.find(
    (slide: { cover?: { url?: string } }) => slide.cover?.url,
  )?.cover.url;
  expect(image).toBeTruthy();
  const avif = await request.get(image, {
    headers: { Accept: 'image/avif,image/webp' },
  });
  expect(avif.ok()).toBe(true);
  expect(avif.headers()['content-type']).toContain('image/avif');
  expect(avif.headers()['vary']).toContain('Accept');
  const jpeg = await request.get(image, {
    headers: { Accept: 'image/avif;q=0,image/webp;q=0,image/jpeg' },
  });
  expect(jpeg.headers()['content-type']).toContain('image/jpeg');
  expect(avif.headers()['cache-control']).toContain('immutable');
});
test('the same built image serves the runtime canonical, API and sitemap URLs in a second environment', async ({
  request,
}) => {
  const origin = 'http://localhost:4990';
  const response = await request.get(origin + '/de');
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('href="' + origin + '/de"');
  expect(html).toContain('http://localhost:4984');
  expect(html).not.toContain('example.invalid');
  const sitemap = await (await request.get(origin + '/sitemap.xml')).text();
  expect(sitemap).toContain(origin + '/de');
  expect(sitemap).not.toContain('localhost:4983');
});
test('signed previews work in all seven locales without enabling draft bookings or leaking the token in referrers', async ({
  page,
}) => {
  const config = await readFile(
    '.local/integration-runtime/production/env/api.env',
    'utf8',
  );
  const secret = config
    .split('\n')
    .find((line) => line.startsWith('SESSION_SECRET='))!
    .slice('SESSION_SECRET='.length);
  for (const locale of locales) {
    const payload = Buffer.from(
      JSON.stringify({
        path: `/${locale}/t/quad-bike-safari`,
        expires: Date.now() + 300000,
      }),
    ).toString('base64url');
    const token =
      payload +
      '.' +
      createHmac('sha256', secret).update(payload).digest('base64url');
    const response = await page.goto(
      `/${locale}/preview?token=${encodeURIComponent(token)}`,
    );
    expect(response!.headers()['x-robots-tag']).toContain('noindex');
    expect(response!.headers()['cache-control']).toContain('no-store');
    expect(response!.headers()['referrer-policy']).toBe('no-referrer');
    await expect(page.locator('main [role=status]')).toBeVisible();
    await expect(page.locator('.trip-sticky button')).toBeDisabled();
    expect(await page.locator('.trip-sticky .add-button').count()).toBe(0);
  }
  await page.goto('/en/preview?token=invalid.invalid');
  await expect(page.locator('.trip-sticky')).toHaveCount(0);
});
test('real booking uses the runtime API address and delivers only to isolated Mailpit', async ({
  page,
  request,
}, info) => {
  await page.goto('/en/t/quad-bike-safari');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.locator('.date-chip').first().click();
  await sheet.getByRole('button', { name: 'Nabq Bay', exact: true }).click();
  await sheet
    .getByLabel('Your name', { exact: true })
    .fill('Synthetic integration QA ' + info.project.name);
  await sheet.getByLabel('Country code').selectOption('+20');
  await sheet
    .getByLabel('WhatsApp number', { exact: true })
    .fill(
      '105559990' +
        ({ mobile: '1', tablet: '2', desktop: '3' }[info.project.name] ?? '4'),
    );
  const sent = page.waitForResponse(
    (response) =>
      response.url() === 'http://localhost:4984/v1/requests' &&
      response.request().method() === 'POST',
  );
  await sheet
    .getByRole('button', { name: 'Send request', exact: true })
    .click();
  const response = await sent;
  expect(response.status()).toBe(201);
  const value = await response.json();
  await expect(sheet.locator('.confirmation h2')).toHaveText(
    'Your request is in.',
  );
  await expect
    .poll(
      async () => {
        const mail = await (
          await request.get('http://127.0.0.1:4987/api/v1/messages')
        ).json();
        return mail.messages.some((message: { Subject: string }) =>
          message.Subject.includes(value.ref),
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
});
