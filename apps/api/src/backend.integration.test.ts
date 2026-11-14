import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql, desc } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectDatabase } from '../../../packages/db/src/index';
import { seedCatalog } from '../../../packages/db/src/seed-data';
import { preparePrivacyDraft } from '../../../packages/db/src/privacy-draft';
import * as s from '../../../packages/db/src/schema';
import { roles, can, permissions } from '@stella/shared/admin';
import { bundledCoreText } from '@stella/shared/i18n/core-content';
import { bookingArea } from '@stella/shared/i18n/guests';
import { locales } from '@stella/shared';
import { loadCatalog } from './catalog';
import { siteSchema, tripSchema } from '@stella/shared/public-contract';
import { cairoDate } from '@stella/shared/booking';
import { configSchema, type Config } from './config';
import { createApp } from './app';
import { createMediaImporter, processMedia, runTool } from './media';
import { passwordHash, sha, seal, unseal, sessionHash } from './auth';
import { generateSecret, generateSync } from 'otplib';
import {
  fakeProvider,
  publicTranslationFields,
  translatePublic,
  reserveCharacters,
} from './translate';
import {
  notifyRequest,
  revalidateWeb,
  purgeRequests,
  dispatchOutbox,
  bootstrapQueues,
  notifyWeeklyPrices,
  notifyWeeklyOperations,
  notifyNewDevice,
} from './jobs';
import { PgBoss } from 'pg-boss';
import sharp from 'sharp';
import { serveProcessed } from './serve-media';
import { notifyPush } from './push';
import webpush from 'web-push';
import { createECDH } from 'node:crypto';
let container: StartedPostgreSqlContainer | undefined,
  connection: ReturnType<typeof connectDatabase>,
  cfg: Config,
  app: ReturnType<typeof createApp>,
  seed: Awaited<ReturnType<typeof seedCatalog>>;
let owner: Client, ownerRecovery: string[];
const clients = new Map<string, Client>(),
  password = 'QA-' + randomBytes(24).toString('base64url'),
  nonce = randomUUID(),
  root = resolve('.local/integration');
class Client {
  cookies = new Map<string, string>();
  ip = 'qa-' + randomUUID();
  async call(
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const all: Record<string, string> = {
      Origin: cfg.ADMIN_ORIGIN,
      ...headers,
    };
    if (this.cookies.size)
      all.Cookie = [...this.cookies].map(([k, v]) => k + '=' + v).join('; ');
    if (this.cookies.has('__Host-stella_csrf'))
      all['X-CSRF-Token'] = this.cookies.get('__Host-stella_csrf')!;
    if (body !== undefined && !(body instanceof FormData))
      all['Content-Type'] = 'application/json';
    const response = await app.request(
      'http://localhost' + path,
      {
        method,
        headers: all,
        ...(body === undefined
          ? {}
          : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      },
      { remoteAddress: this.ip },
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'),
        [key, ...value] = pair!.split('=');
      if (value.join('=')) this.cookies.set(key!, value.join('='));
      else this.cookies.delete(key!);
    }
    return response;
  }
}
async function login(role: (typeof roles)[number]) {
  if (clients.has(role)) return clients.get(role)!;
  const email = role + '-' + nonce + '@example.test';
  const secret = generateSecret(),
    [user] = await connection.db
      .insert(s.adminUsers)
      .values({
        email,
        name: 'QA ' + role,
        role,
        passwordHash: await passwordHash(password),
        totpEnabled: role === 'owner' || role === 'manager',
      })
      .returning();
  if (user!.totpEnabled)
    await connection.db
      .update(s.adminUsers)
      .set({ totpSecretEnc: seal(secret, cfg.TOTP_ENC_KEY, user!.id) })
      .where(eq(s.adminUsers.id, user!.id));
  const client = new Client();
  expect(
    (await client.call('/v1/admin/auth/login', 'POST', { email, password }))
      .status,
  ).toBe(200);
  if (user!.totpEnabled)
    expect(
      (
        await client.call('/v1/admin/auth/2fa/verify', 'POST', {
          code: generateSync({ secret }),
        })
      ).status,
    ).toBe(200);
  clients.set(role, client);
  return client;
}
function booking(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'single',
    items: [{ trip_slug: 'quad-bike-safari', day_index: 100 }],
    start_date: cairoDate(),
    adults: 2,
    children: 0,
    format: 'group',
    pickup_area: 'Nabq Bay',
    name: 'Synthetic QA visitor',
    phone: '+201012345678',
    locale: 'en',
    hp: '',
    t: Date.now() - 5000,
    ...overrides,
  };
}
async function submit(
  body: unknown,
  ip = 'booking-' + randomUUID(),
  headers: Record<string, string> = {},
) {
  return app.request(
    'http://localhost/v1/requests',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: cfg.WEB_ORIGIN,
        ...headers,
      },
      body: JSON.stringify(body),
    },
    { remoteAddress: ip },
  );
}
beforeAll(async () => {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('stella_test')
      .withUsername('stella_test')
      .withPassword(randomBytes(24).toString('hex'))
      .start();
    url = container.getConnectionUri();
  }
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error('Integration tests require a disposable *_test database');
  connection = connectDatabase(url);
  await migrate(connection.db, {
    migrationsFolder: resolve('packages/db/drizzle'),
  });
  await mkdir(root, { recursive: true });
  cfg = configSchema.parse({
    NODE_ENV: 'test',
    DATABASE_URL: url,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    TOTP_ENC_KEY: randomBytes(32).toString('base64'),
    IP_HASH_SALT: randomBytes(32).toString('hex'),
    MEDIA_ROOT: root + '/media',
    ORIGINALS_ROOT: root + '/private',
    MEDIA_PUBLIC_URL: 'http://127.0.0.1:4000/media',
    WEB_REVALIDATE_URL: 'http://127.0.0.1:3000/api/revalidate',
    WEB_REVALIDATE_SECRET: randomBytes(32).toString('hex'),
    WEB_ORIGIN: 'http://127.0.0.1:3000',
    ADMIN_ORIGIN: 'http://localhost:3001',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: 1025,
    SMTP_FROM: 'qa@example.test',
    STAFF_NOTIFY_EMAIL: 'qa-staff@example.test',
    SEED_OWNER_EMAIL: 'seed-' + nonce + '@example.test',
    BREACHED_PASSWORDS_FILE: resolve(
      '.local/security/common-passwords-100k.txt',
    ),
    FFMPEG_PATH: process.env.FFMPEG_PATH ?? resolve('.tools/ffmpeg/ffmpeg.exe'),
    FFPROBE_PATH:
      process.env.FFPROBE_PATH ?? resolve('.tools/ffmpeg/ffprobe.exe'),
  });
  // Actual supplied stock files run through the production importer/pipeline.
  seed = await seedCatalog(connection.db, {
    catalogPath: new URL('../../../data/catalog.json', import.meta.url),
    ownerEmail: cfg.SEED_OWNER_EMAIL,
    importMedia: createMediaImporter(connection.db, cfg, resolve('.')),
  });
  app = createApp(connection.db, cfg);
  owner = new Client();
  expect(seed.setupToken).toBeTruthy();
  const setup = await owner.call('/v1/admin/auth/password/setup', 'POST', {
    token: seed.setupToken,
    password,
  });
  expect(setup.status).toBe(200);
  const logged = await owner.call('/v1/admin/auth/login', 'POST', {
    email: cfg.SEED_OWNER_EMAIL,
    password,
  });
  expect(logged.status).toBe(200);
  expect((await logged.json()).mfa_required).toBe(true);
  expect((await owner.call('/v1/admin/requests')).status).toBe(403);
  const twofa = await owner.call('/v1/admin/auth/2fa/setup', 'POST', {}),
    uri = (await twofa.json()).uri as string,
    secret = new URL(uri).searchParams.get('secret')!;
  const enabled = await owner.call('/v1/admin/auth/2fa/enable', 'POST', {
    code: generateSync({ secret }),
  });
  expect(enabled.status).toBe(200);
  ownerRecovery = (await enabled.json()).recovery_codes;
  expect(ownerRecovery).toHaveLength(10);
});
afterAll(async () => {
  await connection?.pool.end();
  await container?.stop();
});
describe('real PostgreSQL catalog and requests', () => {
  it('seeds all 38 trips and site/collection content in all seven core languages without English fallback', async () => {
    for (const locale of locales) {
      const catalog = await loadCatalog(
        connection.db,
        locale,
        cfg.MEDIA_PUBLIC_URL,
      );
      expect(catalog.trips).toHaveLength(38);
      const visit = (value: unknown, path: string) => {
        if (Array.isArray(value))
          value.forEach((v, i) => visit(v, path + '[' + i + ']'));
        else if (value && typeof value === 'object') {
          const item = value as Record<string, unknown>;
          if (typeof item.text === 'string' && typeof item.lang === 'string')
            expect(item.lang, path + ': ' + item.text).toBe(locale);
          else
            Object.entries(item).forEach(([key, v]) =>
              visit(v, path + '.' + key),
            );
        }
      };
      visit(
        {
          site: catalog.site,
          collections: catalog.collections,
          trips: catalog.trips,
        },
        locale,
      );
    }
  });
  it('bounds public reads independently of booking limits and returns Retry-After', async () => {
    const limited = createApp(connection.db, {
      ...cfg,
      PUBLIC_READS_PER_MINUTE: 2,
    });
    for (let i = 0; i < 2; i++)
      expect(
        (await limited.request('/v1/public/preview?token=invalid')).status,
      ).toBe(401);
    const blocked = await limited.request('/v1/public/preview?token=invalid');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });
  it('enforces the per-phone daily cap across different IP addresses', async () => {
    for (let i = 0; i < 20; i++)
      expect((await submit(booking({ phone: '+201055599999' }))).status).toBe(
        201,
      );
    expect((await submit(booking({ phone: '+201055599999' }))).status).toBe(
      429,
    );
  });
  it('seeds 7/38/4 idempotently and keeps staff price edits', async () => {
    expect([seed.collections, seed.trips, seed.packages]).toEqual([7, 38, 4]);
    const seededSlides = await connection.db.select().from(s.heroSlides);
    expect(seededSlides).toHaveLength(7);
    expect(
      seededSlides.filter((slide) => slide.status === 'published'),
    ).toHaveLength(6);
    const [trip] = await connection.db
      .select()
      .from(s.trips)
      .where(eq(s.trips.slug, 'quad-bike-safari'));
    const rows = await connection.db
      .select()
      .from(s.tripPrices)
      .where(eq(s.tripPrices.tripId, trip!.id));
    expect(rows.map((p) => Number(p.amountEur))).toEqual([15, 20]);
    await connection.db
      .update(s.tripPrices)
      .set({ amountEur: '16' })
      .where(eq(s.tripPrices.id, rows[0]!.id));
    const second = await seedCatalog(connection.db, {
      catalogPath: new URL('../../../data/catalog.json', import.meta.url),
      ownerEmail: cfg.SEED_OWNER_EMAIL,
    });
    expect(second.setupToken).toBeNull();
    expect(
      (
        await connection.db
          .select()
          .from(s.tripPrices)
          .where(eq(s.tripPrices.id, rows[0]!.id))
      )[0]!.amountEur,
    ).toBe('16.00');
    await connection.db
      .update(s.tripPrices)
      .set({ amountEur: '15' })
      .where(eq(s.tripPrices.id, rows[0]!.id));
  });
  it('returns validated public DTOs, Private-first slides, 7 core locales, ETag and no editorial/private fields', async () => {
    const response = await app.request('/v1/public/site?locale=ru'),
      site = siteSchema.parse(await response.json());
    expect(site.hero_slides[0]?.href).toBe('/c/private');
    expect(site.locales.map((l) => l.code)).toEqual([
      'en',
      'it',
      'es',
      'fr',
      'de',
      'ru',
      'tr',
    ]);
    expect(site.locales.every((l) => !l.auto)).toBe(true);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    const etag = response.headers.get('etag')!;
    expect(
      (
        await app.request('/v1/public/site?locale=ru', {
          headers: { 'If-None-Match': etag },
        })
      ).status,
    ).toBe(304);
    const trip = tripSchema.parse(
      await (
        await app.request('/v1/public/trips/cairo-plane-1-day?locale=ru')
      ).json(),
    );
    expect(trip.title.lang).toBe('ru');
    expect(JSON.stringify(trip)).not.toMatch(
      /Resolved:|editorial|original_path|password|sourceAlready/,
    );
    expect((await app.request('/v1/public/trips/egypt-in-4-days')).status).toBe(
      404,
    );
    expect((await app.request('/v1/public/site?locale=zz')).status).toBe(404);
    expect(
      (await app.request('/v1/public/site?locale=en&unexpected=1')).status,
    ).toBe(422);
  });
  it('recomputes prices, ignores day hints, persists snapshots and queues an ID-only notification atomically', async () => {
    const response = await submit(booking());
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.estimate_eur).toBe(30);
    expect(result.whatsapp_url).toMatch(
      /^https:\/\/wa.me\/201069012881\?text=/,
    );
    const [stored] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.ref, result.ref));
    expect(stored!.estimateEur).toBe('30.00');
    expect(stored!.ipHash).toMatch(/^[a-f0-9]{64}$/);
    const [item] = await connection.db
      .select()
      .from(s.bookingRequestItems)
      .where(eq(s.bookingRequestItems.requestId, stored!.id));
    expect(item!.dayIndex).toBe(1);
    expect((item!.priceSnapshot as { amount: number }).amount).toBe(30);
    const tasks = await connection.db
      .select()
      .from(s.outbox)
      .where(eq(s.outbox.name, 'notify.request.created'));
    expect(
      tasks.some(
        (t) =>
          JSON.stringify(t.data) === JSON.stringify({ requestId: stored!.id }),
      ),
    ).toBe(true);
    expect(JSON.stringify(tasks)).not.toContain('Synthetic QA visitor');
  });
  it('confirms real requests with translated trip names and pickup labels in every core language', async () => {
    for (const [index, locale] of locales.entries()) {
      const response = await submit(
        booking({
          locale,
          pickup_area: 'Other',
          phone: '+20103330000' + index,
        }),
      );
      expect(response.status).toBe(201);
      const confirmation = await response.json();
      expect(confirmation.message).toContain(
        bundledCoreText('Quad Bike Safari', locale),
      );
      expect(confirmation.message).toContain(bookingArea('Other', locale));
      expect(confirmation.estimate_eur).toBe(30);
    }
  });
  it('handles a selected vehicle row and unknown private prices', async () => {
    const trip = tripSchema.parse(
      await (await app.request('/v1/public/trips/quad-bike-safari')).json(),
    );
    const vehicle = trip.prices.find((p) => p.unit === 'quad')!;
    expect(
      (
        await (
          await submit(
            booking({
              items: [{ trip_slug: trip.slug, price_id: vehicle.id }],
              adults: 4,
            }),
          )
        ).json()
      ).estimate_eur,
    ).toBe(20);
    expect(
      (await (await submit(booking({ format: 'private' }))).json())
        .estimate_eur,
    ).toBeNull();
  });
  it('rejects tampering/spam/invalid dates before inserting requests', async () => {
    const before = Number(
      (
        await connection.db.execute<{ count: string }>(
          sql`select count(*) from booking_requests`,
        )
      ).rows[0]!.count,
    );
    for (const body of [
      booking({ estimate_eur: 1 }),
      booking({ hp: 'bot' }),
      booking({ t: Date.now() }),
      booking({ start_date: '2000-01-01' }),
      booking({
        items: [{ trip_slug: 'quad-bike-safari', price_id: randomUUID() }],
      }),
      booking({ items: [{ trip_slug: 'egypt-in-4-days' }] }),
    ])
      expect((await submit(body)).status).toBe(422);
    expect(
      (
        await submit(booking(), undefined, {
          Origin: 'https://attacker.example',
        })
      ).status,
    ).toBe(403);
    expect(
      Number(
        (
          await connection.db.execute<{ count: string }>(
            sql`select count(*) from booking_requests`,
          )
        ).rows[0]!.count,
      ),
    ).toBe(before);
  });
  it('enforces IP limits even when forwarded headers are spoofed', async () => {
    const ip = 'rate-' + randomUUID();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await submit(booking({ phone: '+20102000000' + i }), ip, {
            'X-Forwarded-For': '198.51.100.' + i,
          })
        ).status,
      ).toBe(201);
    expect(
      (await submit(booking(), ip, { 'X-Forwarded-For': '203.0.113.1' }))
        .status,
    ).toBe(429);
  });
});
describe('admin security and real mutations', () => {
  it('prevents TOTP replay and consumes a recovery code once under concurrent requests', async () => {
    const id = randomUUID(),
      secret = generateSecret(),
      email = 'mfa-' + nonce + '@example.test',
      recovery = 'QA-' + randomBytes(16).toString('hex');
    await connection.db.insert(s.adminUsers).values({
      id,
      email,
      name: 'MFA QA',
      role: 'editor',
      passwordHash: await passwordHash(password),
      totpEnabled: true,
      totpSecretEnc: seal(secret, cfg.TOTP_ENC_KEY, id),
      recoveryCodesHash: [sha(recovery)],
    });
    const first = new Client(),
      second = new Client();
    for (const client of [first, second])
      expect(
        (await client.call('/v1/admin/auth/login', 'POST', { email, password }))
          .status,
      ).toBe(200);
    const code = generateSync({ secret });
    expect(
      (await first.call('/v1/admin/auth/2fa/verify', 'POST', { code })).status,
    ).toBe(200);
    expect(
      (await second.call('/v1/admin/auth/2fa/verify', 'POST', { code })).status,
    ).toBe(401);
    const third = new Client();
    expect(
      (await third.call('/v1/admin/auth/login', 'POST', { email, password }))
        .status,
    ).toBe(200);
    const results = await Promise.all(
      [second, third].map((client) =>
        client.call('/v1/admin/auth/2fa/verify', 'POST', { code: recovery }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });
  it('uses secure host-only cookies and stores only session hashes', async () => {
    const client = await login('sales');
    expect(client.cookies.get('__Host-stella_admin')).toHaveLength(43);
    const raw = client.cookies.get('__Host-stella_admin')!;
    expect(
      (
        await connection.db
          .select()
          .from(s.sessions)
          .where(eq(s.sessions.id, sessionHash(raw, cfg.SESSION_SECRET)))
      ).length,
    ).toBe(1);
    expect(
      (
        await connection.db
          .select()
          .from(s.sessions)
          .where(eq(s.sessions.id, raw))
      ).length,
    ).toBe(0);
    const fresh = new Client(),
      r = await fresh.call('/v1/admin/auth/login', 'POST', {
        email: 'sales-' + nonce + '@example.test',
        password,
      });
    const header = r.headers
      .getSetCookie()
      .find((s) => s.startsWith('__Host-stella_admin='))!;
    expect(header).toContain('Secure');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).not.toContain('Domain=');
  });
  it('returns generic login errors and account/IP limits', async () => {
    const client = new Client(),
      a = await client.call('/v1/admin/auth/login', 'POST', {
        email: 'missing-' + nonce + '@example.test',
        password: 'incorrect',
      }),
      b = await client.call('/v1/admin/auth/login', 'POST', {
        email: 'sales-' + nonce + '@example.test',
        password: 'incorrect',
      });
    expect(a.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
    for (let i = 0; i < 4; i++)
      await client.call('/v1/admin/auth/login', 'POST', {
        email: 'missing-' + nonce + '@example.test',
        password: 'incorrect',
      });
    expect(
      (
        await client.call('/v1/admin/auth/login', 'POST', {
          email: 'missing-' + nonce + '@example.test',
          password: 'incorrect',
        })
      ).status,
    ).toBe(429);
  });
  it('checks the full role matrix on protected endpoint families', async () => {
    const routes: Record<keyof typeof permissions, [string, string]> = {
      requests: ['/v1/admin/requests', 'GET'],
      export: ['/v1/admin/requests/export.csv', 'GET'],
      content: ['/v1/admin/trips', 'GET'],
      prices: ['/v1/admin/trips/' + randomUUID() + '/prices', 'PUT'],
      publish: ['/v1/admin/trips/' + randomUUID() + '/publish', 'POST'],
      heroDraft: ['/v1/admin/hero-slides', 'GET'],
      heroLive: ['/v1/admin/hero-slides/reorder', 'POST'],
      translations: ['/v1/admin/i18n/glossary', 'GET'],
      languages: ['/v1/admin/i18n/settings', 'GET'],
      settings: ['/v1/admin/settings', 'GET'],
      users: ['/v1/admin/users', 'GET'],
      audit: ['/v1/admin/audit', 'GET'],
    };
    for (const role of roles) {
      const client = role === 'owner' ? owner : await login(role);
      for (const action of Object.keys(routes) as (keyof typeof routes)[]) {
        const [path, method] = routes[action],
          response = await client.call(
            path,
            method,
            method === 'GET' ? undefined : {},
          );
        const result = await response.json().catch(() => ({}));
        if (!can(role, action)) {
          expect(response.status, role + ':' + action).toBe(403);
          expect(result.error.code).toBe('FORBIDDEN');
        } else
          expect(result.error?.code, role + ':' + action).not.toBe('FORBIDDEN');
      }
    }
  });
  it('requires CSRF and exact Origin and rejects editor price/publication escalation', async () => {
    const editor = await login('editor'),
      [trip] = await connection.db
        .select()
        .from(s.trips)
        .where(eq(s.trips.slug, 'quad-bike-safari'));
    expect(
      (
        await editor.call(
          '/v1/admin/trips/' + trip!.id + '/basics',
          'PATCH',
          { title: { en: 'Draft test' } },
          { Origin: 'https://attacker.example' },
        )
      ).status,
    ).toBe(403);
    const token = editor.cookies.get('__Host-stella_csrf')!;
    editor.cookies.delete('__Host-stella_csrf');
    expect(
      (
        await editor.call('/v1/admin/trips/' + trip!.id + '/basics', 'PATCH', {
          title: { en: 'Draft test' },
        })
      ).status,
    ).toBe(403);
    editor.cookies.set('__Host-stella_csrf', token);
    expect(
      (
        await editor.call('/v1/admin/trips/' + trip!.id + '/basics', 'PATCH', {
          status: 'published',
          privateSurchargePct: 100,
        })
      ).status,
    ).toBe(422);
    const draft = await editor.call(
      '/v1/admin/trips/' + trip!.id + '/basics',
      'PATCH',
      { title: { en: 'Draft title for staff review' } },
    );
    expect((await draft.json()).draft).toBe(true);
    expect(
      (
        await connection.db
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, trip!.id))
      )[0]!.title.en,
    ).toBe('Quad Bike Safari');
  });
  it('changes a real price, records a revision and restores it', async () => {
    const [trip] = await connection.db
        .select()
        .from(s.trips)
        .where(eq(s.trips.slug, 'tiran-island-boat')),
      prices = await connection.db
        .select()
        .from(s.tripPrices)
        .where(eq(s.tripPrices.tripId, trip!.id)),
      row = prices[0]!;
    const body = {
      rows: prices.map((p) => ({
        id: p.id,
        label: p.label,
        amountEur: p.id === row.id ? 40 : Number(p.amountEur),
        unit: p.unit,
        isPrimary: p.isPrimary,
        minQty: p.minQty,
        maxQty: p.maxQty,
      })),
    };
    expect(
      (await owner.call('/v1/admin/trips/' + trip!.id + '/prices', 'PUT', body))
        .status,
    ).toBe(200);
    expect(
      (await (await app.request('/v1/public/trips/tiran-island-boat')).json())
        .prices[0].amount_eur,
    ).toBe(40);
    const [revision] = await connection.db
      .select()
      .from(s.revisions)
      .where(
        and(
          eq(s.revisions.entity, 'trip_prices'),
          eq(s.revisions.entityId, trip!.id),
        ),
      )
      .orderBy(desc(s.revisions.id));
    expect(
      (
        await owner.call(
          '/v1/admin/revisions/' + revision!.id + '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await app.request('/v1/public/trips/tiran-island-boat')).json())
        .prices[0].amount_eur,
    ).toBe(Number(row.amountEur));
  });
  it('uses a single-use reset token and invalidates all sessions', async () => {
    const client = await login('sales'),
      email = 'sales-' + nonce + '@example.test';
    expect(
      (
        await client.call('/v1/admin/auth/password/reset-request', 'POST', {
          email,
        })
      ).status,
    ).toBe(202);
    const [user] = await connection.db
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.email, email)),
      rows = await connection.db
        .select()
        .from(s.outbox)
        .where(eq(s.outbox.name, 'auth.reset'));
    const task = rows.find(
      (r) => (r.data as { userId: string }).userId === user!.id,
    )!.data as { token: string };
    const token = unseal(
        Buffer.from(task.token, 'base64'),
        cfg.TOTP_ENC_KEY,
        user!.id,
      ),
      password = 'new-' + randomBytes(24).toString('hex');
    expect(
      (
        await client.call('/v1/admin/auth/password/reset', 'POST', {
          token,
          password,
        })
      ).status,
    ).toBe(200);
    expect((await client.call('/v1/admin/me')).status).toBe(401);
    expect(
      (
        await client.call('/v1/admin/auth/password/reset', 'POST', {
          token,
          password,
        })
      ).status,
    ).toBe(401);
  });
  it('requires bulk price confirmation, rejects stale previews and protects surcharge revision restore', async () => {
    const [trip] = await connection.db
      .select()
      .from(s.trips)
      .where(eq(s.trips.slug, 'tiran-island-boat'));
    const preview = await (
      await owner.call('/v1/admin/prices/bulk/preview', 'POST', {
        tripIds: [trip!.id],
        mode: 'percent',
        value: 50,
      })
    ).json();
    expect(preview.requires_confirmation).toBe(true);
    expect(
      (
        await owner.call('/v1/admin/prices/bulk/apply', 'POST', {
          token: preview.token,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await owner.call('/v1/admin/prices/bulk/apply', 'POST', {
          token: preview.token,
          confirmLargeChange: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await owner.call('/v1/admin/prices/bulk/apply', 'POST', {
          token: preview.token,
          confirmLargeChange: true,
        })
      ).status,
    ).toBe(409);
    const [revision] = await connection.db
      .select()
      .from(s.revisions)
      .where(
        and(
          eq(s.revisions.entity, 'trip_prices'),
          eq(s.revisions.entityId, trip!.id),
        ),
      )
      .orderBy(desc(s.revisions.id));
    expect(
      (
        await owner.call(
          '/v1/admin/revisions/' + revision!.id + '/restore',
          'POST',
          { confirmLargeChange: true },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await owner.call('/v1/admin/trips/' + trip!.id + '/basics', 'PATCH', {
          privateSurchargePct: 50,
        })
      ).status,
    ).toBe(200);
    const [surcharge] = await connection.db
      .select()
      .from(s.revisions)
      .where(
        and(eq(s.revisions.entity, 'trip'), eq(s.revisions.entityId, trip!.id)),
      )
      .orderBy(desc(s.revisions.id));
    expect(
      (
        await (
          await login('editor')
        ).call('/v1/admin/revisions/' + surcharge!.id + '/restore', 'POST', {})
      ).status,
    ).toBe(403);
    expect(
      (
        await owner.call(
          '/v1/admin/revisions/' + surcharge!.id + '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
  });
  it('rejects hidden price escalation, unknown query/body keys, and duplicate query values', async () => {
    const editor = await login('editor'),
      [trip] = await connection.db
        .select()
        .from(s.trips)
        .where(eq(s.trips.slug, 'quad-bike-safari'));
    expect(
      (
        await editor.call(`/v1/admin/trips/${trip!.id}/basics`, 'PATCH', {
          privateSurchargePct: 50,
        })
      ).status,
    ).toBe(403);
    expect((await editor.call('/v1/admin/trips?unexpected=1')).status).toBe(
      422,
    );
    expect((await editor.call('/v1/admin/trips?page=1&page=2')).status).toBe(
      422,
    );
    expect(
      (
        await owner.call(`/v1/admin/trips/${trip!.id}/publish`, 'POST', {
          status: 'hidden',
        })
      ).status,
    ).toBe(422);
  });
  it('keeps editor changes private, scopes signed preview, publishes and restores the complete publication', async () => {
    const editor = await login('editor'),
      [trip] = await connection.db
        .select()
        .from(s.trips)
        .where(eq(s.trips.slug, 'quad-bike-safari'));
    await connection.db
      .delete(s.tripMedia)
      .where(
        and(eq(s.tripMedia.tripId, trip!.id), eq(s.tripMedia.role, 'video')),
      );
    const before = await (
      await app.request('/v1/public/trips/' + trip!.slug)
    ).json();
    expect(
      (
        await editor.call(`/v1/admin/trips/${trip!.id}/itinerary`, 'PUT', {
          rows: [{ timeLabel: null, text: { en: 'QA staged itinerary' } }],
        })
      ).status,
    ).toBe(200);
    const link = await (
      await editor.call('/v1/admin/preview-link', 'POST', {
        path: '/en/t/' + trip!.slug,
      })
    ).json();
    const token = link.token;
    expect(token).toBeTruthy();
    const previewResponse = await app.request(
      '/v1/public/preview?token=' + encodeURIComponent(token!),
    );
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get('cache-control')).toContain('no-store');
    const preview = await previewResponse.json();
    expect(JSON.stringify(preview)).toContain('QA staged itinerary');
    expect(
      (
        await app.request(
          '/v1/public/preview?token=' + encodeURIComponent(token! + 'x'),
        )
      ).status,
    ).toBe(401);
    expect(
      JSON.stringify(
        await (await app.request('/v1/public/trips/' + trip!.slug)).json(),
      ),
    ).not.toContain('QA staged itinerary');
    expect(
      (await owner.call(`/v1/admin/trips/${trip!.id}/publish`, 'POST', {}))
        .status,
    ).toBe(200);
    expect(
      JSON.stringify(
        await (await app.request('/v1/public/trips/' + trip!.slug)).json(),
      ),
    ).toContain('QA staged itinerary');
    const [revision] = await connection.db
      .select()
      .from(s.revisions)
      .where(
        and(eq(s.revisions.entity, 'trip'), eq(s.revisions.entityId, trip!.id)),
      )
      .orderBy(desc(s.revisions.id));
    const restored = await owner.call(
      `/v1/admin/revisions/${revision!.id}/restore`,
      'POST',
      {},
    );
    expect(await restored.json()).toEqual({ ok: true });
    const after = await (
      await app.request('/v1/public/trips/' + trip!.slug)
    ).json();
    expect(after.title).toEqual(before.title);
    expect(after.itinerary).toEqual(before.itinerary);
    expect(after.cover).toEqual(before.cover);
  });
  it('separates homepage drafts from published selections and keeps human translation freshness', async () => {
    const editor = await login('editor'),
      current = await (await editor.call('/v1/admin/homepage')).json();
    const body = {
      home: {
        ...current.home,
        build_heading: { en: 'QA homepage heading', it: 'Titolo umano' },
        featured_trip_slugs: ['quad-bike-safari'],
        private_trip_slugs: ['private-boat'],
      },
      how_steps: current.how_steps,
      private_perks: current.private_perks,
      publish: false,
    };
    // Select an actual private trip rather than inventing a catalog slug.
    const [privateTrip] = await connection.db
      .select()
      .from(s.trips)
      .where(
        and(eq(s.trips.format, 'private'), eq(s.trips.status, 'published')),
      );
    body.home.private_trip_slugs = [privateTrip!.slug];
    expect((await editor.call('/v1/admin/homepage', 'PUT', body)).status).toBe(
      200,
    );
    expect(
      (await (await app.request('/v1/public/site')).json()).home.build_heading
        .text,
    ).not.toBe('QA homepage heading');
    expect(
      (
        await editor.call('/v1/admin/homepage', 'PUT', {
          ...body,
          publish: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await owner.call('/v1/admin/homepage', 'PUT', {
          ...body,
          publish: true,
        })
      ).status,
    ).toBe(200);
    const site = await (await app.request('/v1/public/site')).json();
    expect(site.home.build_heading.text).toBe('QA homepage heading');
    expect(site.featured_trips.map((t: { slug: string }) => t.slug)).toEqual([
      'quad-bike-safari',
    ]);
    expect(site.private_trips.map((t: { slug: string }) => t.slug)).toEqual([
      privateTrip!.slug,
    ]);
    const [human] = await connection.db
      .select()
      .from(s.contentTranslations)
      .where(
        and(
          eq(s.contentTranslations.entity, 'settings'),
          eq(s.contentTranslations.entityId, 'home'),
          eq(s.contentTranslations.field, 'build_heading'),
          eq(s.contentTranslations.locale, 'it'),
        ),
      );
    expect(human!.origin).toBe('human');
    expect(
      (
        await owner.call('/v1/admin/homepage', 'PUT', {
          ...body,
          home: {
            ...body.home,
            build_heading: { en: 'QA changed English', it: 'Titolo umano' },
          },
          publish: true,
        })
      ).status,
    ).toBe(200);
    const [stale] = await connection.db
      .select()
      .from(s.contentTranslations)
      .where(eq(s.contentTranslations.id, human!.id));
    expect(stale!.sourceHash).toBe(human!.sourceHash);
  });
  it('requires recent reauthentication for CSV and escapes spreadsheet formulas', async () => {
    expect((await owner.call('/v1/admin/requests/export.csv')).status).toBe(
      403,
    );
    expect(
      (
        await owner.call('/v1/admin/auth/reauth', 'POST', {
          password,
          code: ownerRecovery[0],
        })
      ).status,
    ).toBe(200);
    const request = await submit(
      booking({ phone: '+201055500111', name: '=SUM(1,2)' }),
    );
    expect(request.status).toBe(201);
    const csv = await owner.call('/v1/admin/requests/export.csv');
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("'=SUM(1,2)");
  });
});
describe('security-session regression cases', () => {
  it('allows the simple admin login switch only in development', () => {
    for (const NODE_ENV of ['test', 'production'] as const)
      expect(
        configSchema.safeParse({
          ...cfg,
          NODE_ENV,
          DEV_SIMPLE_ADMIN_LOGIN: 'true',
        }).success,
      ).toBe(false);
    expect(
      configSchema.safeParse({
        ...cfg,
        NODE_ENV: 'development',
        DEV_SIMPLE_ADMIN_LOGIN: 'true',
      }).success,
    ).toBe(true);
  });
  it('rejects malformed origins and proxy entries while permitting isolated localhost production QA', () => {
    expect(
      configSchema.safeParse({
        ...cfg,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://www.example.test',
        ADMIN_ORIGIN: 'https://admin.example.test',
      }).success,
    ).toBe(true);
    expect(
      configSchema.safeParse({
        ...cfg,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'http://localhost:4983',
      }).success,
    ).toBe(true);
    for (const WEB_ORIGIN of [
      'http://www.example.test',
      'https://www.example.test/path',
      'https://private:secret@www.example.test',
      'not a URL',
    ])
      expect(
        configSchema.safeParse({ ...cfg, NODE_ENV: 'production', WEB_ORIGIN })
          .success,
      ).toBe(false);
    for (const TRUSTED_PROXY_IPS of [
      '*',
      'proxy.example.test',
      '10.0.0.0/8',
      '1.2.3.4,spoof',
    ])
      expect(
        configSchema.safeParse({ ...cfg, TRUSTED_PROXY_IPS }).success,
      ).toBe(false);
    expect(
      configSchema.safeParse({ ...cfg, TRUSTED_PROXY_IPS: '127.0.0.1,::1' })
        .success,
    ).toBe(true);
  });
  it('prepares seven-locale legal drafts without publication or overwriting staff content', async () => {
    expect((await preparePrivacyDraft(connection.db)).created).toBe(5);
    const rows = await connection.db
      .select()
      .from(s.pageBlocks)
      .where(eq(s.pageBlocks.pageKey, 'privacy'));
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.status === 'draft')).toBe(true);
    expect(rows.every((row) => row.type === 'rich_text')).toBe(true);
    expect(Object.keys(rows[0]!.data as object).sort()).toEqual([
      'heading',
      'text',
      'title',
    ]);
    for (const row of rows) {
      const translations = await connection.db
        .select()
        .from(s.contentTranslations)
        .where(
          and(
            eq(s.contentTranslations.entity, 'page_block'),
            eq(s.contentTranslations.entityId, row.id),
          ),
        );
      expect(translations).toHaveLength(18);
      for (const locale of locales.filter((l) => l !== 'en'))
        expect(
          translations
            .filter((t) => t.locale === locale)
            .every(
              (t) =>
                t.text.length > 0 &&
                t.provider === 'codex-authored' &&
                t.origin === 'machine',
            ),
        ).toBe(true);
    }
    for (const locale of locales)
      expect(
        (await app.request(`/v1/public/pages/privacy?locale=${locale}`)).status,
      ).toBe(404);
    await connection.db
      .update(s.pageBlocks)
      .set({
        data: {
          title: { en: 'Staff draft' },
          text: { en: 'Preserve this edit' },
        },
      })
      .where(eq(s.pageBlocks.id, rows[0]!.id));
    expect((await preparePrivacyDraft(connection.db)).created).toBe(0);
    expect(
      (
        await connection.db
          .select()
          .from(s.pageBlocks)
          .where(eq(s.pageBlocks.id, rows[0]!.id))
      )[0]!.data,
    ).toEqual({
      title: { en: 'Staff draft' },
      text: { en: 'Preserve this edit' },
    });
    await connection.db
      .delete(s.contentTranslations)
      .where(
        and(
          eq(s.contentTranslations.entity, 'page_block'),
          sql`${s.contentTranslations.entityId} in (select id::text from page_blocks where page_key='privacy')`,
        ),
      );
    await connection.db
      .delete(s.pageBlocks)
      .where(eq(s.pageBlocks.pageKey, 'privacy'));
  });
  async function account(role: (typeof roles)[number] = 'editor', mfa = false) {
    const secret = generateSecret();
    const [user] = await connection.db
      .insert(s.adminUsers)
      .values({
        email: randomUUID() + '@example.test',
        name: 'Security QA',
        role,
        passwordHash: await passwordHash(password),
        totpEnabled: mfa,
      })
      .returning();
    if (mfa)
      await connection.db
        .update(s.adminUsers)
        .set({ totpSecretEnc: seal(secret, cfg.TOTP_ENC_KEY, user!.id) })
        .where(eq(s.adminUsers.id, user!.id));
    const client = new Client();
    expect(
      (
        await client.call('/v1/admin/auth/login', 'POST', {
          email: user!.email,
          password,
        })
      ).status,
    ).toBe(200);
    return { user: user!, secret, client };
  }
  async function dashboardAccount(role: (typeof roles)[number] = 'owner') {
    const result = await account(role, role === 'owner' || role === 'manager');
    if (result.user.totpEnabled)
      expect(
        (
          await result.client.call('/v1/admin/auth/2fa/verify', 'POST', {
            code: generateSync({ secret: result.secret }),
          })
        ).status,
      ).toBe(200);
    return result;
  }
  it('undoes new and duplicated trips by archiving and preserves seven-language translation provenance', async () => {
    const manager = await dashboardAccount('manager'),
      [collection] = await connection.db.select().from(s.collections).limit(1);
    const created = await manager.client.call('/v1/admin/trips', 'POST', {
      slug: 'qa-create-' + randomUUID(),
      collectionId: collection!.id,
      title: Object.fromEntries(
        locales.map((locale) => [locale, 'QA ' + locale]),
      ),
      format: 'group',
    });
    expect(created.status).toBe(201);
    const trip = await created.json(),
      revision = created.headers.get('X-Stella-Revisions')!;
    expect(revision).toMatch(/^\d+$/);
    expect(
      (
        await manager.client.call(
          '/v1/admin/revisions/' + revision + '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await connection.db
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, trip.id))
      )[0]!.archivedAt,
    ).not.toBeNull();
    const [source] = await connection.db
      .select()
      .from(s.trips)
      .where(eq(s.trips.slug, 'quad-bike-safari'));
    const response = await manager.client.call(
      '/v1/admin/trips/' + source!.id + '/duplicate',
      'POST',
      { slug: 'qa-copy-' + randomUUID() },
    );
    expect(response.status).toBe(201);
    const copy = await response.json(),
      originals = await connection.db
        .select()
        .from(s.contentTranslations)
        .where(
          and(
            eq(s.contentTranslations.entity, 'trip'),
            eq(s.contentTranslations.entityId, source!.id),
          ),
        ),
      copies = await connection.db
        .select()
        .from(s.contentTranslations)
        .where(
          and(
            eq(s.contentTranslations.entity, 'trip'),
            eq(s.contentTranslations.entityId, copy.id),
          ),
        );
    expect(
      copies
        .map((row) => [
          row.field,
          row.locale,
          row.text,
          row.origin,
          row.sourceHash,
        ])
        .sort(),
    ).toEqual(
      originals
        .map((row) => [
          row.field,
          row.locale,
          row.text,
          row.origin,
          row.sourceHash,
        ])
        .sort(),
    );
    const undo = response.headers.get('X-Stella-Revisions')!;
    expect(
      (
        await manager.client.call(
          '/v1/admin/revisions/' + undo + '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await connection.db
          .select()
          .from(s.trips)
          .where(eq(s.trips.id, copy.id))
      )[0]!.archivedAt,
    ).not.toBeNull();
  });
  it('archives new collections and permits editor Undo only for draft hero slides', async () => {
    const editor = await dashboardAccount('editor');
    const created = await editor.client.call('/v1/admin/collections', 'POST', {
      slug: 'qa-collection-' + randomUUID(),
      name: Object.fromEntries(
        locales.map((locale) => [locale, 'QA ' + locale]),
      ),
    });
    expect(created.status).toBe(201);
    const collection = await created.json();
    expect(
      (
        await editor.client.call(
          '/v1/admin/revisions/' +
            created.headers.get('X-Stella-Revisions') +
            '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await connection.db
          .select()
          .from(s.collections)
          .where(eq(s.collections.id, collection.id))
      )[0]!.archivedAt,
    ).not.toBeNull();
    const [media] = await connection.db
      .select()
      .from(s.media)
      .where(eq(s.media.kind, 'image'))
      .limit(1);
    const slideResponse = await editor.client.call(
      '/v1/admin/hero-slides',
      'POST',
      { imageMediaId: media!.id, ctaType: 'my_trip' },
    );
    expect(slideResponse.status).toBe(201);
    const slide = await slideResponse.json();
    const undo = await editor.client.call(
      '/v1/admin/revisions/' +
        slideResponse.headers.get('X-Stella-Revisions') +
        '/restore',
      'POST',
      {},
    );
    expect(undo.status).toBe(200);
    expect(
      (
        await connection.db
          .select()
          .from(s.heroSlides)
          .where(eq(s.heroSlides.id, slide.id))
      )[0]!.archivedAt,
    ).not.toBeNull();
    await connection.db
      .update(s.heroSlides)
      .set({ archivedAt: null, status: 'published' })
      .where(eq(s.heroSlides.id, slide.id));
    expect(
      (
        await editor.client.call(
          '/v1/admin/revisions/' +
            undo.headers.get('X-Stella-Revisions') +
            '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(403);
    await connection.db
      .update(s.heroSlides)
      .set({ archivedAt: new Date(), status: 'draft' })
      .where(eq(s.heroSlides.id, slide.id));
  });
  it('restores an initially empty media alt value together with unknown rights', async () => {
    const owner = await dashboardAccount(),
      [media] = await connection.db
        .insert(s.media)
        .values({
          kind: 'image',
          originalPath: 'qa/unused-regression.jpg',
          status: 'ready',
          rightsStatus: 'unknown',
          alt: null,
        })
        .returning();
    const response = await owner.client.call(
      '/v1/admin/media/' + media!.id,
      'PATCH',
      {
        rightsStatus: 'owned',
        alt: Object.fromEntries(
          locales.map((locale) => [locale, 'QA ' + locale]),
        ),
      },
    );
    expect(response.status).toBe(200);
    expect(
      (
        await owner.client.call(
          '/v1/admin/revisions/' +
            response.headers.get('X-Stella-Revisions') +
            '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    const [restored] = await connection.db
      .select()
      .from(s.media)
      .where(eq(s.media.id, media!.id));
    expect(restored!.rightsStatus).toBe('unknown');
    expect(restored!.alt).toBeNull();
  });
  it('requires recent identity confirmation for password changes and revokes every old session', async () => {
    const { user, client } = await dashboardAccount('editor'),
      next = 'QA-' + randomBytes(24).toString('base64url');
    expect(
      (
        await client.call('/v1/admin/auth/password/change', 'POST', {
          password: next,
        })
      ).status,
    ).toBe(403);
    expect(
      (await client.call('/v1/admin/auth/reauth', 'POST', { password })).status,
    ).toBe(200);
    expect(
      (
        await client.call('/v1/admin/auth/password/change', 'POST', {
          password: next,
        })
      ).status,
    ).toBe(200);
    expect((await client.call('/v1/admin/me')).status).toBe(401);
    expect(
      (
        await client.call('/v1/admin/auth/login', 'POST', {
          email: user.email,
          password,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await client.call('/v1/admin/auth/login', 'POST', {
          email: user.email,
          password: next,
        })
      ).status,
    ).toBe(200);
  });
  it('lets the owner require MFA for optional roles and immediately revokes their existing sessions', async () => {
    const owner = await dashboardAccount(),
      editor = await dashboardAccount('editor');
    expect(
      (
        await owner.client.call('/v1/admin/users/' + editor.user.id, 'PATCH', {
          mfaRequired: true,
        })
      ).status,
    ).toBe(403);
    await connection.db
      .update(s.sessions)
      .set({ reauthAt: new Date() })
      .where(eq(s.sessions.userId, owner.user.id));
    expect(
      (
        await owner.client.call('/v1/admin/users/' + editor.user.id, 'PATCH', {
          mfaRequired: true,
        })
      ).status,
    ).toBe(200);
    expect((await editor.client.call('/v1/admin/me')).status).toBe(401);
    const response = await editor.client.call('/v1/admin/auth/login', 'POST', {
      email: editor.user.email,
      password,
    });
    expect((await response.json()).enrollment_required).toBe(true);
    expect((await editor.client.call('/v1/admin/trips')).status).toBe(403);
  });
  it('stages editor translation reviews, publishes only with manager authority and undoes the exact field', async () => {
    const manager = await dashboardAccount('manager'),
      editor = await dashboardAccount('editor');
    const original = {
      en: 'Original question',
      it: 'Domanda originale',
      es: 'Pregunta original',
      fr: 'Question originale',
      de: 'Ursprüngliche Frage',
      ru: 'Исходный вопрос',
      tr: 'Özgün soru',
    };
    const [faq] = await connection.db
      .insert(s.faqs)
      .values({ q: original, a: original, status: 'published' })
      .returning();
    const input = {
      entity: 'faq',
      id: faq!.id,
      field: 'q',
      locale: 'fr',
      source: original.en,
      text: 'Question française relue',
    };
    const draft = await editor.client.call(
      '/v1/admin/i18n/review',
      'POST',
      input,
    );
    expect(draft.status).toBe(200);
    expect((await draft.json()).draft).toBe(true);
    expect(
      (
        await connection.db.select().from(s.faqs).where(eq(s.faqs.id, faq!.id))
      )[0]!.q.fr,
    ).toBe(original.fr);
    const queue = await (
      await manager.client.call('/v1/admin/i18n/queue?locale=fr')
    ).json();
    expect(queue.find((row: { id: string }) => row.id === faq!.id).state).toBe(
      'draft',
    );
    const published = await manager.client.call(
      '/v1/admin/i18n/review',
      'POST',
      input,
    );
    expect(published.status).toBe(200);
    const revision = published.headers.get('X-Stella-Revisions');
    expect(revision).toMatch(/^\d+$/);
    const current = (
      await connection.db.select().from(s.faqs).where(eq(s.faqs.id, faq!.id))
    )[0]!;
    expect(current.q.fr).toBe(input.text);
    expect(current.q.it).toBe(original.it);
    expect(
      (
        await editor.client.call(
          '/v1/admin/revisions/' + revision + '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(403);
    const undone = await manager.client.call(
      '/v1/admin/revisions/' + revision + '/restore',
      'POST',
      {},
    );
    expect(undone.status).toBe(200);
    expect(
      (
        await connection.db.select().from(s.faqs).where(eq(s.faqs.id, faq!.id))
      )[0]!.q.fr,
    ).toBe(original.fr);
    const redo = undone.headers.get('X-Stella-Revisions');
    expect(
      (
        await manager.client.call(
          '/v1/admin/revisions/' + redo + '/restore',
          'POST',
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await connection.db.select().from(s.faqs).where(eq(s.faqs.id, faq!.id))
      )[0]!.q.fr,
    ).toBe(input.text);
    expect(
      (
        await manager.client.call('/v1/admin/i18n/review', 'POST', {
          ...input,
          entity: 'request',
        })
      ).status,
    ).toBe(422);
  });
  it('preserves page-block identity and authored translation provenance when publishing an unchanged draft', async () => {
    const manager = await dashboardAccount('manager');
    const [block] = await connection.db
      .insert(s.pageBlocks)
      .values({
        pageKey: 'contact',
        type: 'rich_text',
        status: 'draft',
        data: { title: { en: 'Contact' }, text: { en: 'Contact the office' } },
      })
      .returning();
    await connection.db.insert(s.contentTranslations).values({
      entity: 'page_block',
      entityId: block!.id,
      field: 'text',
      locale: 'fr',
      text: 'Contactez le bureau',
      origin: 'machine',
      provider: 'codex-authored',
      sourceHash: sha('Contact the office'),
    });
    const response = await manager.client.call(
      '/v1/admin/pages/contact/blocks',
      'PUT',
      {
        publish: true,
        blocks: [
          { id: block!.id, type: 'rich_text', sort: 0, data: block!.data },
        ],
      },
    );
    expect(response.status).toBe(200);
    expect(
      (
        await connection.db
          .select()
          .from(s.pageBlocks)
          .where(eq(s.pageBlocks.id, block!.id))
      )[0]!.status,
    ).toBe('published');
    const translated = await (
      await app.request('/v1/public/pages/contact?locale=fr')
    ).json();
    expect(translated.blocks[0].text.text).toBe('Contactez le bureau');
    expect(
      (
        await connection.db
          .select()
          .from(s.contentTranslations)
          .where(eq(s.contentTranslations.entityId, block!.id))
      )[0]!.provider,
    ).toBe('codex-authored');
    expect(
      (
        await manager.client.call('/v1/admin/pages/privacy/blocks', 'PUT', {
          publish: false,
          blocks: [{ id: block!.id, type: 'rich_text', data: block!.data }],
        })
      ).status,
    ).toBe(422);
  });
  it('sends generic push payloads only to eligible staff through an injected transport, never customer fields', async () => {
    const owner = await dashboardAccount(),
      keys = webpush.generateVAPIDKeys(),
      ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const subscriptionKeys = {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    };
    await connection.db.insert(s.pushSubscriptions).values({
      userId: owner.user.id,
      endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-test',
      endpointHash: sha(randomUUID()),
      ...subscriptionKeys,
      locale: 'fr',
    });
    const [request] = await connection.db
      .insert(s.bookingRequests)
      .values({
        ref: 'PUSH-' + randomUUID(),
        mode: 'single',
        locale: 'en',
        startDate: cairoDate(),
        adults: 1,
        children: 0,
        name: 'Never sent to a push provider',
        phone: '+201000000001',
      })
      .returning();
    const payloads: string[] = [];
    await notifyPush(
      connection.db,
      {
        ...cfg,
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: keys.privateKey,
        VAPID_SUBJECT: 'mailto:owner@example.test',
      },
      request!.id,
      async (_subscription, payload) => {
        payloads.push(String(payload));
        return { statusCode: 201, body: '', headers: {} };
      },
    );
    expect(payloads).toEqual([JSON.stringify({ locale: 'fr' })]);
    expect(payloads.join('')).not.toContain(request!.name);
    expect(
      (
        await (
          await dashboardAccount('editor')
        ).client.call('/v1/admin/push/key')
      ).status,
    ).toBe(403);
  });
  it('requires confirmation when a zero price becomes positive or a primary row is replaced', async () => {
    const manager = await dashboardAccount('manager'),
      [collection] = await connection.db.select().from(s.collections).limit(1);
    const [trip] = await connection.db
      .insert(s.trips)
      .values({
        slug: 'qa-price-' + randomUUID(),
        collectionId: collection!.id,
        title: { en: 'Synthetic price regression' },
        format: 'group',
      })
      .returning();
    const [price] = await connection.db
      .insert(s.tripPrices)
      .values({
        tripId: trip!.id,
        amountEur: '0',
        unit: 'person',
        isPrimary: true,
      })
      .returning();
    const row = {
      id: price!.id,
      label: null,
      amountEur: 1,
      unit: 'person',
      isPrimary: true,
    };
    expect(
      (
        await manager.client.call(
          '/v1/admin/trips/' + trip!.id + '/prices',
          'PUT',
          { rows: [row] },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await manager.client.call(
          '/v1/admin/trips/' + trip!.id + '/prices',
          'PUT',
          { rows: [row], confirmLargeChange: true },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await manager.client.call(
          '/v1/admin/trips/' + trip!.id + '/prices',
          'PUT',
          {
            rows: [
              { label: null, amountEur: 100, unit: 'person', isPrimary: true },
            ],
          },
        )
      ).status,
    ).toBe(409);
  });
  async function blockedOnUser() {
    await expect
      .poll(
        async () =>
          Number(
            (
              await connection.pool.query(
                "select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%admin_users%'",
              )
            ).rows[0].count,
          ),
        { timeout: 5000 },
      )
      .toBeGreaterThan(0);
  }
  it('invalidates existing sessions immediately when SESSION_SECRET rotates', async () => {
    const { client } = await account();
    expect((await client.call('/v1/admin/me')).status).toBe(200);
    const rotated = createApp(connection.db, {
      ...cfg,
      SESSION_SECRET: randomBytes(32).toString('hex'),
    });
    const response = await rotated.request('/v1/admin/me', {
      headers: {
        Cookie:
          '__Host-stella_admin=' + client.cookies.get('__Host-stella_admin'),
      },
    });
    expect(response.status).toBe(401);
  });
  it('revokes all sessions and remembered devices with CSRF-protected logout-all', async () => {
    const { user, client } = await account();
    const second = new Client();
    expect(
      (
        await second.call('/v1/admin/auth/login', 'POST', {
          email: user.email,
          password,
        })
      ).status,
    ).toBe(200);
    expect(
      (await client.call('/v1/admin/auth/logout-all', 'POST', {})).status,
    ).toBe(200);
    expect((await client.call('/v1/admin/me')).status).toBe(401);
    expect((await second.call('/v1/admin/me')).status).toBe(401);
    expect(
      (
        await connection.db
          .select()
          .from(s.adminDevices)
          .where(eq(s.adminDevices.userId, user.id))
      ).length,
    ).toBe(0);
  });
  it('requires a recent password check before optional-MFA secret enrollment', async () => {
    const { client } = await account();
    expect(
      (await client.call('/v1/admin/auth/2fa/setup', 'POST', {})).status,
    ).toBe(403);
    expect(
      (await client.call('/v1/admin/auth/reauth', 'POST', { password })).status,
    ).toBe(200);
    expect(
      (await client.call('/v1/admin/auth/2fa/setup', 'POST', {})).status,
    ).toBe(200);
  });
  it('does not resurrect a revoked pending session while an MFA check waits for the user lock', async () => {
    const { user, client, secret } = await account('manager', true);
    const blocker = await connection.pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query('select id from admin_users where id=$1 for update', [
        user.id,
      ]);
      pending = client.call('/v1/admin/auth/2fa/verify', 'POST', {
        code: generateSync({ secret }),
      });
      await blockedOnUser();
      await blocker.query('delete from sessions where user_id=$1', [user.id]);
      await blocker.query('commit');
      expect((await pending).status).toBe(401);
      expect(
        (
          await connection.db
            .select()
            .from(s.sessions)
            .where(eq(s.sessions.userId, user.id))
        ).length,
      ).toBe(0);
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await pending;
    }
  });
  it('does not complete a login checked against a password replaced concurrently', async () => {
    const { user } = await account();
    const changed = await passwordHash(randomBytes(24).toString('base64url'));
    const blocker = await connection.pool.connect(),
      client = new Client();
    let pending: Promise<Response> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query('select id from admin_users where id=$1 for update', [
        user.id,
      ]);
      pending = client.call('/v1/admin/auth/login', 'POST', {
        email: user.email,
        password,
      });
      await blockedOnUser();
      await blocker.query(
        'update admin_users set password_hash=$1 where id=$2',
        [changed, user.id],
      );
      await blocker.query('delete from sessions where user_id=$1', [user.id]);
      await blocker.query('commit');
      expect((await pending).status).toBe(401);
      expect(
        (
          await connection.db
            .select()
            .from(s.sessions)
            .where(eq(s.sessions.userId, user.id))
        ).length,
      ).toBe(0);
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await pending;
    }
  });
  it('registers a device only after MFA, suppresses repeat alerts and supplies all seven email copies without raw secrets', async () => {
    const { user, client, secret } = await account('manager', true);
    expect(
      (
        await connection.db
          .select()
          .from(s.adminDevices)
          .where(eq(s.adminDevices.userId, user.id))
      ).length,
    ).toBe(0);
    expect(
      (
        await client.call('/v1/admin/auth/2fa/verify', 'POST', {
          code: generateSync({ secret }),
        })
      ).status,
    ).toBe(200);
    const raw = client.cookies.get('__Host-stella_device')!;
    const [device] = await connection.db
      .select()
      .from(s.adminDevices)
      .where(eq(s.adminDevices.userId, user.id));
    expect(raw).toHaveLength(43);
    expect(device!.tokenHash).toBe(sha(raw));
    for (const locale of locales) {
      const messages: { text: string }[] = [];
      await notifyNewDevice(
        connection.db,
        { ...cfg, OWNER_REPORT_LOCALE: locale },
        user.id,
        device!.id,
        {
          sendMail: async (mail) => {
            messages.push(mail);
          },
        },
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]!.text).not.toContain(raw);
      expect(messages[0]!.text).not.toContain(secret);
    }
    expect(
      (
        await client.call('/v1/admin/auth/2fa/verify', 'POST', {
          code: generateSync({ secret }),
        })
      ).status,
    ).toBe(409);
    const { user: editor, client: first } = await account();
    expect(
      (
        await first.call('/v1/admin/auth/login', 'POST', {
          email: editor.email,
          password,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await connection.db
          .select()
          .from(s.adminDevices)
          .where(eq(s.adminDevices.userId, editor.id))
      ).length,
    ).toBe(1);
    const alerts = await connection.db
      .select()
      .from(s.outbox)
      .where(
        and(
          eq(s.outbox.name, 'auth.new_device'),
          sql`${s.outbox.data}->>'userId'=${editor.id}`,
        ),
      );
    expect(alerts).toHaveLength(1);
  });
  it('requires manager/owner reauthentication for phone-specific export and irreversible erasure, and scrubs historical copies', async () => {
    const phone = '+201055588001';
    const result = await (
      await submit(
        booking({
          phone,
          name: 'Privacy QA customer',
          notes: 'private erasure note',
        }),
      )
    ).json();
    const [row] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.ref, result.ref));
    await connection.db.insert(s.revisions).values({
      entity: 'request',
      entityId: row!.id,
      snapshot: { internalNote: 'private erasure note' },
    });
    await connection.db.insert(s.auditLog).values({
      entity: 'request',
      entityId: row!.id,
      action: 'legacy_update',
      before: { phone },
      after: { note: 'private erasure note' },
    });
    const { client: editor } = await account();
    expect(
      (
        await editor.call('/v1/admin/privacy/requests/erase', 'POST', {
          phone,
          confirm: true,
        })
      ).status,
    ).toBe(403);
    const { client, user, secret } = await account('manager', true);
    expect(
      (
        await client.call('/v1/admin/auth/2fa/verify', 'POST', {
          code: generateSync({ secret }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.call('/v1/admin/privacy/requests/export', 'POST', {
          phone,
        })
      ).status,
    ).toBe(403);
    const recovery = randomBytes(10).toString('hex');
    await connection.db
      .update(s.adminUsers)
      .set({ recoveryCodesHash: [sha(recovery)] })
      .where(eq(s.adminUsers.id, user.id));
    expect(
      (
        await client.call('/v1/admin/auth/reauth', 'POST', {
          password,
          code: recovery,
        })
      ).status,
    ).toBe(200);
    const exported = await client.call(
      '/v1/admin/privacy/requests/export',
      'POST',
      { phone },
    );
    expect(exported.status).toBe(200);
    const payload = await exported.json();
    expect(payload.requests).toHaveLength(1);
    expect(payload.requests[0].notes).toBe('private erasure note');
    expect(payload.requests[0].items).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toMatch(
      /ipHash|userAgent|passwordHash|totpSecret/,
    );
    expect(
      (await client.call('/v1/admin/privacy/requests/erase', 'POST', { phone }))
        .status,
    ).toBe(422);
    const response = await client.call(
      '/v1/admin/privacy/requests/erase',
      'POST',
      { phone, confirm: true },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).erased).toBe(1);
    expect(
      (
        await connection.db
          .select()
          .from(s.bookingRequests)
          .where(eq(s.bookingRequests.id, row!.id))
      ).length,
    ).toBe(0);
    expect(
      (
        await connection.db
          .select()
          .from(s.revisions)
          .where(eq(s.revisions.entityId, row!.id))
      ).length,
    ).toBe(0);
    const history = await connection.db
      .select()
      .from(s.auditLog)
      .where(eq(s.auditLog.entityId, row!.id));
    expect(history[0]!.before).toBeNull();
    expect(history[0]!.after).toEqual({ redacted: true });
    const mail: unknown[] = [];
    await notifyRequest(connection.db, cfg, row!.id, {
      sendMail: async (message) => {
        mail.push(message);
      },
    });
    expect(mail).toHaveLength(0);
  });
  it('retains no direct identifiers or history when an expired booking used the removal marker as its real name', async () => {
    const result = await (
      await submit(
        booking({
          phone: '+201055588002',
          name: '[removed]',
          notes: 'retention secret',
        }),
      )
    ).json();
    const [row] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.ref, result.ref));
    await connection.db
      .update(s.bookingRequests)
      .set({
        createdAt: new Date('2020-01-01'),
        internalNote: 'retention secret',
      })
      .where(eq(s.bookingRequests.id, row!.id));
    await connection.db.insert(s.revisions).values({
      entity: 'request',
      entityId: row!.id,
      snapshot: { internalNote: 'retention secret' },
    });
    await connection.db.insert(s.auditLog).values({
      entity: 'request',
      entityId: row!.id,
      action: 'legacy_update',
      after: { note: 'retention secret' },
    });
    await purgeRequests(connection.db);
    const [redacted] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.id, row!.id));
    expect(redacted!.phone).toBe('[removed]');
    expect(redacted!.anonymizedAt).toBeInstanceOf(Date);
    expect(redacted!.notes).toBeNull();
    expect(redacted!.internalNote).toBeNull();
    expect(
      (
        await connection.db
          .select()
          .from(s.revisions)
          .where(eq(s.revisions.entityId, row!.id))
      ).length,
    ).toBe(0);
    expect(
      JSON.stringify(
        await connection.db
          .select()
          .from(s.auditLog)
          .where(eq(s.auditLog.entityId, row!.id)),
      ),
    ).not.toContain('retention secret');
    const { client } = await account('sales');
    expect(
      (
        await client.call('/v1/admin/requests/' + row!.id, 'PATCH', {
          internalNote: 'must not return',
        })
      ).status,
    ).toBe(409);
  });
});
describe('media, notifications, jobs and translation privacy', () => {
  it('builds owner summaries in every core locale from aggregate data without customer details', async () => {
    for (const locale of locales) {
      const messages: { subject: string; text: string }[] = [];
      await notifyWeeklyOperations(
        connection.db,
        { ...cfg, OWNER_REPORT_LOCALE: locale },
        {
          sendMail: async (message) => {
            messages.push(message);
          },
        },
      );
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]!.text).toMatch(/\d{4}-\d{2}-\d{2}: \d+/);
      expect(messages[0]!.text).not.toMatch(
        /Synthetic QA visitor|201055500111|private notes|setup-required|totp|ipHash/i,
      );
    }
  });
  it('decodes an actual HEVC HEIC upload locally and emits metadata-free JPEG/AVIF variants', async () => {
    const bytes = await readFile(
        resolve('.local/media-format-qa/example.heic'),
      ),
      form = new FormData();
    form.set('file', new Blob([new Uint8Array(bytes)]), 'iphone.heic');
    const response = await (
      await login('editor')
    ).call('/v1/admin/media', 'POST', form);
    expect(response.status).toBe(202);
    const { id } = await response.json();
    await processMedia(connection.db, cfg, id);
    const [m] = await connection.db
      .select()
      .from(s.media)
      .where(eq(s.media.id, id));
    expect(m!.status).toBe('ready');
    const variants = m!.variants as {
      jpg: Record<string, string>;
      avif: Record<string, string>;
    };
    const image = await sharp(
      resolve(cfg.ORIGINALS_ROOT, 'previews', variants.jpg['480']!),
    ).metadata();
    expect(image.width).toBe(480);
    expect(image.exif).toBeUndefined();
    expect(
      (
        await sharp(
          resolve(cfg.ORIGINALS_ROOT, 'previews', variants.avif['480']!),
        ).metadata()
      ).format,
    ).toBe('heif');
  });
  it('processes real video without audio or location metadata and keeps unknown-rights variants private', async () => {
    const path = resolve(root, 'synthetic-' + nonce + '.mp4');
    await mkdir(root, { recursive: true });
    await runTool(cfg.FFMPEG_PATH, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=orange:s=160x90:r=15:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-metadata',
      'location=+30.0000+031.0000/',
      '-shortest',
      path,
    ]);
    const form = new FormData();
    form.set(
      'file',
      new Blob([new Uint8Array(await readFile(path))]),
      'synthetic.mp4',
    );
    const response = await (
      await login('editor')
    ).call('/v1/admin/media', 'POST', form);
    expect(response.status).toBe(202);
    const { id } = await response.json();
    await processMedia(connection.db, cfg, id);
    const [m] = await connection.db
      .select()
      .from(s.media)
      .where(eq(s.media.id, id));
    const variants = m!.variants as Record<string, string>;
    for (const [variant, width, height] of [
      ['mp4_v', 720, 1280],
      ['mp4_h', 1280, 720],
    ] as const) {
      const probe = JSON.parse(
        await runTool(cfg.FFPROBE_PATH, [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          resolve(cfg.ORIGINALS_ROOT, 'previews', variants[variant]!),
        ]),
      );
      expect(probe.streams).toHaveLength(1);
      expect(probe.streams[0]).toMatchObject({
        codec_name: 'h264',
        width,
        height,
      });
      expect(JSON.stringify(probe.format.tags)).not.toMatch(/location|GPS/);
      expect(Number(probe.format.duration)).toBeLessThanOrEqual(20);
    }
    expect(
      (
        await serveProcessed(
          cfg.MEDIA_ROOT,
          variants.mp4_v!,
          undefined,
          '',
          true,
        )
      ).status,
    ).toBe(404);
    const preview = await (
      await login('editor')
    ).call(`/v1/admin/media/${id}/preview?variant=mp4_v`, 'GET', undefined, {
      Range: 'bytes=0-99',
    });
    expect(preview.status).toBe(206);
    expect(preview.headers.get('content-length')).toBe('100');
    expect(preview.headers.get('cache-control')).toContain('no-store');
    await preview.arrayBuffer();
    const poster = await serveProcessed(
      resolve(cfg.ORIGINALS_ROOT, 'previews'),
      variants.poster!,
      undefined,
      'image/avif',
      true,
    );
    expect(poster.headers.get('content-type')).toBe('image/avif');
    await poster.arrayBuffer();
    expect(
      (
        await serveProcessed(
          resolve(cfg.ORIGINALS_ROOT, 'previews'),
          variants.mp4_v!,
          'bytes=99999999-',
          '',
          false,
        )
      ).status,
    ).toBe(416);
  });
  it('reports actual price changes to owners through the injected transport', async () => {
    const sent: { to: string; text: string }[] = [];
    await notifyWeeklyPrices(connection.db, cfg, {
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
    expect(sent.some((mail) => mail.to === cfg.SEED_OWNER_EMAIL)).toBe(true);
    expect(JSON.stringify(sent)).toContain('trip_prices');
    expect(JSON.stringify(sent)).not.toContain('Synthetic QA visitor');
  });
  it('rejects SVG/PDF/malformed images by content, ignores the filename and strips metadata', async () => {
    const editor = await login('editor');
    for (const bytes of [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from('%PDF-1.7\n'),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ]) {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(bytes)]), 'photo.jpg');
      expect((await editor.call('/v1/admin/media', 'POST', form)).status).toBe(
        422,
      );
    }
    const jpeg = await sharp({
      create: { width: 100, height: 60, channels: 3, background: '#d9b976' },
    })
      .withExif({
        IFD0: { Artist: 'Synthetic QA' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '30/1 0/1 0/1' },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeTruthy();
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(jpeg)]), '../../ignored.svg');
    const response = await editor.call('/v1/admin/media', 'POST', form);
    expect(response.status).toBe(202);
    const { id } = await response.json();
    await processMedia(connection.db, cfg, id);
    const [m] = await connection.db
      .select()
      .from(s.media)
      .where(eq(s.media.id, id));
    expect(m!.rightsStatus).toBe('unknown');
    const jpg = (m!.variants as { jpg: Record<string, string> }).jpg['480']!;
    const output = await sharp(
      resolve(cfg.ORIGINALS_ROOT, 'previews', jpg),
    ).metadata();
    expect(output.exif).toBeUndefined();
    expect(output.width).toBe(100);
    const tooLarge = new FormData();
    tooLarge.set(
      'file',
      new Blob([new Uint8Array(jpeg), new Uint8Array(25 * 1024 * 1024)]),
      'oversized.jpg',
    );
    expect(
      (await editor.call('/v1/admin/media', 'POST', tooLarge)).status,
    ).toBe(413);
    const multiple = new FormData();
    multiple.append('file', new Blob([new Uint8Array(jpeg)]), 'one.jpg');
    multiple.append('file', new Blob([new Uint8Array(jpeg)]), 'two.jpg');
    expect(
      (await editor.call('/v1/admin/media', 'POST', multiple)).status,
    ).toBe(413);
  });
  it('sends staff notification only through an injected test transport and purges retained PII', async () => {
    const [request] = await connection.db
        .select()
        .from(s.bookingRequests)
        .limit(1),
      messages: unknown[] = [];
    await notifyRequest(connection.db, cfg, request!.id, {
      sendMail: async (mail) => {
        messages.push(mail);
      },
    });
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages)).toContain(request!.ref);
    await connection.db
      .update(s.bookingRequests)
      .set({ createdAt: new Date('2020-01-01') })
      .where(eq(s.bookingRequests.id, request!.id));
    await purgeRequests(connection.db);
    const [purged] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.id, request!.id));
    expect(purged!.name).toBe('[removed]');
    expect(purged!.phone).toBe('[removed]');
    expect(purged!.notes).toBeNull();
  });
  it('limits translation to published public fields, preserves human values and enforces the budget', async () => {
    const payloads: { texts: string[]; locale: string }[] = [],
      fields = await publicTranslationFields(connection.db, cfg);
    expect(JSON.stringify(fields)).not.toMatch(
      /Synthetic QA visitor|ipHash|originalPath|editorialNotes|setup-required/,
    );
    const provider = fakeProvider(payloads);
    await translatePublic(connection.db, cfg, { locale: 'pl' }, [provider]);
    expect(payloads.length).toBeGreaterThan(0);
    expect(JSON.stringify(payloads)).not.toMatch(
      /Synthetic QA visitor|201012345678|setup-required/,
    );
    const live = await (await app.request('/v1/public/locales')).json();
    expect(live.some((l: { code: string }) => l.code === 'pl')).toBe(true);
    await translatePublic(
      connection.db,
      cfg,
      { entity: 'collection', locale: 'it' },
      [provider],
    );
    const [privateCollection] = await connection.db
      .select()
      .from(s.collections)
      .where(eq(s.collections.slug, 'private'));
    const [human] = await connection.db
      .select()
      .from(s.contentTranslations)
      .where(
        and(
          eq(s.contentTranslations.entityId, privateCollection!.id),
          eq(s.contentTranslations.locale, 'it'),
          eq(s.contentTranslations.field, 'name'),
        ),
      );
    expect(human?.origin).toBe('human');
    expect(human?.text).toBe(privateCollection!.name.it);
    expect(
      await reserveCharacters(connection.db, 'google', 500001, 1000000, true),
    ).toBe(false);
  });
  it('expands invalidation across affected collections/packages in bounded webhook bodies', async () => {
    const calls: string[][] = [];
    await revalidateWeb(
      connection.db,
      cfg,
      ['trip:quad-bike-safari'],
      async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        calls.push(body.tags);
        return new Response('{}', { status: 200 });
      },
    );
    expect(calls.flat()).toContain('collection:private');
    expect(calls.flat()).toContain('trip:egypt-in-4-days');
    expect(calls.every((tags) => tags.length <= 50)).toBe(true);
  });
  it('dispatches the durable outbox and pg-boss enqueue in one transaction', async () => {
    const boss = new PgBoss(cfg.DATABASE_URL);
    await boss.start();
    try {
      await bootstrapQueues(boss);
      expect(await dispatchOutbox(connection.pool, boss)).toBeGreaterThan(0);
      const tasks = await boss.fetch('notify.request.created', {
        batchSize: 100,
      });
      expect(tasks.length).toBeGreaterThan(0);
      expect(JSON.stringify(tasks.map((t) => t.data))).not.toContain(
        'Synthetic QA visitor',
      );
    } finally {
      await boss.stop();
    }
  });
  it('generates a JSON OpenAPI contract and protects it in production', async () => {
    const response = await app.request('/v1/openapi.json'),
      document = await response.json();
    expect(document.openapi).toBe('3.1.0');
    expect(
      document.paths['/v1/admin/homepage'].put.requestBody.content[
        'application/json'
      ].schema.additionalProperties,
    ).toBe(false);
    await expect(JSON.stringify(document, null, 2) + '\n').toMatchFileSnapshot(
      '../../../tests/contracts/openapi.json',
    );
    expect(
      document.paths['/v1/requests'].post.requestBody.content[
        'application/json'
      ].schema.additionalProperties,
    ).toBe(false);
    const production = createApp(connection.db, {
      ...cfg,
      NODE_ENV: 'production',
    });
    expect((await production.request('/v1/openapi.json')).status).toBe(401);
  });
});
