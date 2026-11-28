import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql, desc } from 'drizzle-orm';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import sourceCatalog from '../../../data/catalog.json';
import { connectDatabase } from '../../../packages/db/src/index';
import { seedCatalog } from '../../../packages/db/src/seed-data';
import { preparePrivacyDraft } from '../../../packages/db/src/privacy-draft';
import { applyRuntimePrivileges } from '../../../packages/db/src/runtime-privileges';
import * as s from '../../../packages/db/src/schema';
import { roles, can, permissions } from '@stella/shared/admin';
import { bundledCoreText } from '@stella/shared/i18n/core-content';
import { bookingStay } from '@stella/shared/i18n/booking-messages';
import { locales } from '@stella/shared';
import { loadCatalog } from './catalog';
import { siteSchema, tripSchema } from '@stella/shared/public-contract';
import {
  createSearch,
  normalize,
  searchIndexSchema,
} from '@stella/shared/search';
import { gzipSync } from 'node:zlib';
import { estimateTrip } from '@stella/shared/price';
import {
  addCalendarDays,
  cairoDate,
  minBookingDate,
  quoteSchema,
} from '@stella/shared/booking';
import { configSchema, type Config } from './config';
import { createApp } from './app';
import { createMediaImporter, processMedia, runTool } from './media';
import { passwordHash, sha, unseal, sessionHash, aad } from './auth';
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
  cleanupSessions,
  cleanupMedia,
  notifyWeeklyPrices,
  notifyWeeklyOperations,
  notifyNewDevice,
  queueRequestPush,
} from './jobs';
import { migrateQueues } from './migration-jobs';
import { erasureHash, reapplyErasures } from './privacy';
import { PgBoss } from 'pg-boss';
import sharp from 'sharp';
import { serveProcessed } from './serve-media';
import { notifyPush } from './push';
import webpush from 'web-push';
import { createECDH } from 'node:crypto';
let container: StartedPostgreSqlContainer | undefined,
  connection: ReturnType<typeof connectDatabase>,
  apiConnection: ReturnType<typeof connectDatabase>,
  workerConnection: ReturnType<typeof connectDatabase>,
  workerUrl: string,
  cfg: Config,
  app: ReturnType<typeof createApp>,
  seed: Awaited<ReturnType<typeof seedCatalog>>;
let owner: Client;
const clients = new Map<string, Client>(),
  password = 'QA-' + randomBytes(24).toString('base64url'),
  nonce = randomUUID(),
  root = resolve('.local/integration');
const runtimeRoles = {
  api: 'qa_api_' + nonce.replaceAll('-', ''),
  worker: 'qa_worker_' + nonce.replaceAll('-', ''),
};
const createdRoles: string[] = [];
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
  await connection.db.insert(s.adminUsers).values({
    email,
    name: 'QA ' + role,
    role,
    passwordHash: await passwordHash(password),
  });
  const client = new Client();
  expect(
    (await client.call('/v1/admin/auth/login', 'POST', { email, password }))
      .status,
  ).toBe(200);
  clients.set(role, client);
  return client;
}
function booking(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'single',
    items: [{ trip_slug: 'quad-bike-safari', day_index: 100 }],
    start_date: minBookingDate(),
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
async function previewQuote(body: unknown, origin = cfg.WEB_ORIGIN) {
  return app.request(
    'http://localhost/v1/requests/quote',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    },
    { remoteAddress: 'quote-' + randomUUID() },
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
  await migrateQueues(url);
  const roleUrl = async (role: string) => {
    const credential = randomBytes(24).toString('hex');
    await connection.pool.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${credential}'`,
    );
    createdRoles.push(role);
    const result = new URL(url);
    result.username = role;
    result.password = credential;
    return result.href;
  };
  const apiUrl = await roleUrl(runtimeRoles.api);
  workerUrl = await roleUrl(runtimeRoles.worker);
  await applyRuntimePrivileges(connection.pool, runtimeRoles);
  apiConnection = connectDatabase(apiUrl);
  workerConnection = connectDatabase(workerUrl);
  app = createApp(apiConnection.db, cfg);
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
  // Email + password is the whole sign-in (owner decision, 2026-11-25).
  expect(Object.keys(await logged.json())).toEqual(['csrf_token']);
  expect((await owner.call('/v1/admin/requests')).status).toBe(200);
});
const completeQaCopy = (text: string) =>
  Object.fromEntries(locales.map((locale) => [locale, text])) as s.Localized;
afterAll(async () => {
  try {
    await apiConnection?.pool.end();
    await workerConnection?.pool.end();
    for (const role of createdRoles) {
      await connection.pool.query(`DROP OWNED BY "${role}"`);
      await connection.pool.query(`DROP ROLE "${role}"`);
    }
  } finally {
    await connection?.pool.end();
    await container?.stop();
  }
});
describe('runtime database privileges', () => {
  it('creates the operational indexes from migration 0011', async () => {
    const names = [
      'sessions_user',
      'rate_buckets_expiry',
      'outbox_pending',
      'outbox_delivered',
      'booking_request_items_trip',
      'audit_at',
    ];
    const { rows } = await connection.pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1)",
      [names],
    );
    expect(rows.map((row) => row.indexname).sort()).toEqual([...names].sort());
  });
  it('sets server-side timeouts on both runtime roles', async () => {
    const { rows } = await connection.pool.query<{
      rolname: string;
      rolconfig: string[] | null;
    }>('SELECT rolname, rolconfig FROM pg_roles WHERE rolname = ANY($1)', [
      [runtimeRoles.api, runtimeRoles.worker],
    ]);
    const config = Object.fromEntries(
      rows.map((row) => [row.rolname, row.rolconfig ?? []]),
    );
    expect(config[runtimeRoles.api]).toEqual(
      expect.arrayContaining([
        'statement_timeout=30s',
        'lock_timeout=10s',
        'idle_in_transaction_session_timeout=60s',
      ]),
    );
    expect(config[runtimeRoles.worker]).toEqual(
      expect.arrayContaining([
        'statement_timeout=5min',
        'idle_in_transaction_session_timeout=5min',
      ]),
    );
  });
  it('removes legacy table, column and default grants on repeat migration', async () => {
    const worker = '"' + runtimeRoles.worker + '"';
    await connection.pool.query(
      `GRANT SELECT (password_hash), UPDATE (role) ON public.admin_users TO ${worker}`,
    );
    await connection.pool.query(
      `GRANT DELETE ON public.audit_log TO ${worker}`,
    );
    await connection.pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${worker}`,
    );
    await applyRuntimePrivileges(connection.pool, runtimeRoles);
    await connection.pool.query(
      'CREATE TABLE public.qa_future_table (id integer)',
    );
    try {
      const {
        rows: [access],
      } = await workerConnection.pool.query(`
        SELECT
          has_column_privilege(current_user,'admin_users','email','SELECT') AS staff_email,
          has_column_privilege(current_user,'admin_users','password_hash','SELECT') AS password_hash,
          has_column_privilege(current_user,'admin_users','role','UPDATE') AS change_role,
          has_table_privilege(current_user,'audit_log','SELECT,INSERT,UPDATE,DELETE') AS audit_access,
          has_table_privilege(current_user,'sessions','SELECT,INSERT,UPDATE,DELETE') AS sessions_access,
          has_table_privilege(current_user,'auth_tokens','SELECT,INSERT,UPDATE,DELETE') AS reset_access,
          has_column_privilege(current_user,'booking_requests','notes','SELECT') AS booking_notes,
          has_table_privilege(current_user,'settings','INSERT,UPDATE,DELETE') AS settings_write,
          has_table_privilege(current_user,'qa_future_table','SELECT,INSERT,UPDATE,DELETE') AS future_access,
          has_schema_privilege(current_user,'public','CREATE') AS public_ddl
      `);
      expect(access).toEqual({
        staff_email: true,
        password_hash: false,
        change_role: false,
        audit_access: false,
        sessions_access: false,
        reset_access: false,
        booking_notes: false,
        settings_write: false,
        future_access: false,
        public_ddl: false,
      });
      const {
        rows: [api],
      } = await apiConnection.pool.query(`
        SELECT
          has_table_privilege(current_user,'audit_log','INSERT') AS log_write,
          has_table_privilege(current_user,'audit_log','UPDATE,DELETE') AS log_tamper,
          has_schema_privilege(current_user,'pgboss','USAGE') AS queue_access,
          has_table_privilege(current_user,'qa_future_table','SELECT,INSERT,UPDATE,DELETE') AS future_access
      `);
      expect(api).toEqual({
        log_write: true,
        log_tamper: false,
        queue_access: false,
        future_access: false,
      });
      await expect(
        workerConnection.pool.query(
          'select public.worker_set_translation_status($1,$2::jsonb)',
          ['contacts', '{}'],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await cleanupSessions(workerConnection.db);
      await cleanupMedia(workerConnection.db, cfg);
    } finally {
      await connection.pool.query('DROP TABLE public.qa_future_table');
    }
  });
});
describe('real PostgreSQL catalog and requests', () => {
  it('seeds all 38 trips and site/collection content in all seven core languages without English fallback', async () => {
    const returnTimes = sourceCatalog.trips.filter((trip) => trip.return_time);
    expect(returnTimes).toHaveLength(19);
    for (const locale of locales) {
      const catalog = await loadCatalog(
        connection.db,
        locale,
        cfg.MEDIA_PUBLIC_URL,
      );
      expect(catalog.trips).toHaveLength(38);
      for (const source of returnTimes) {
        const trip = catalog.trips.find((entry) => entry.slug === source.slug);
        expect(trip?.return_label).toEqual({
          text: bundledCoreText(source.return_time!, locale),
          lang: locale,
        });
      }
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
    const limited = createApp(apiConnection.db, {
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
    const reader = createHmac('sha256', cfg.WEB_REVALIDATE_SECRET)
      .update('stella:public-catalog-reader:v1')
      .digest('hex');
    const headers = { 'X-Stella-Catalog-Reader': reader };
    for (let i = 0; i < 3; i++)
      expect(
        (await limited.request('/v1/public/locales', { headers })).status,
      ).toBe(200);
    expect(
      (
        await limited.request('/v1/public/locales', {
          headers: { 'X-Stella-Catalog-Reader': 'forged' },
        })
      ).status,
    ).toBe(429);
  });
  it('loads selected saved trips in order and keeps draft and missing slugs withdrawn', async () => {
    const locale = 'fr';
    const [first, second] = ['quad-bike-safari', 'glass-bottom-boat'];
    const fetchTrip = async (slug: string) =>
      (
        await app.request('/v1/public/trips/' + slug + '?locale=' + locale)
      ).json();
    const result = await app.request(
      '/v1/public/saved-trips?locale=fr&slugs=' +
        [first, 'hidden-trip-qa', 'egypt-in-4-days', second, first].join(','),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual([
      { slug: first, status: 'available', trip: await fetchTrip(first!) },
      { slug: 'hidden-trip-qa', status: 'withdrawn' },
      { slug: 'egypt-in-4-days', status: 'withdrawn' },
      { slug: second, status: 'available', trip: await fetchTrip(second!) },
    ]);
    expect(
      (
        await app.request(
          '/v1/public/saved-trips?slugs=' +
            Array.from({ length: 39 }, (_, i) => 'trip-' + i).join(','),
        )
      ).status,
    ).toBe(422);
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
    ).toHaveLength(7);
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
    await connection.db
      .update(s.trips)
      .set({ returnLabel: '20:30' })
      .where(eq(s.trips.slug, 'cairo-plane-1-day'));
    await connection.db
      .update(s.trips)
      .set({ returnLabel: null })
      .where(eq(s.trips.slug, 'luxor-plane-1-day'));
    const second = await seedCatalog(connection.db, {
      catalogPath: new URL('../../../data/catalog.json', import.meta.url),
      ownerEmail: cfg.SEED_OWNER_EMAIL,
    });
    expect(second.setupToken).toBeNull();
    for (const [slug, time] of [
      ['cairo-plane-1-day', '20:30'],
      ['luxor-plane-1-day', '~21:00'],
    ] as const) {
      const [withReturn] = await connection.db
        .select({ returnLabel: s.trips.returnLabel })
        .from(s.trips)
        .where(eq(s.trips.slug, slug));
      expect(withReturn?.returnLabel).toBe(time);
    }
    await connection.db
      .update(s.trips)
      .set({ returnLabel: '~21:00' })
      .where(eq(s.trips.slug, 'cairo-plane-1-day'));
    for (const [slug, untimed] of [
      ['jerusalem-bethlehem', 6],
      ['ras-mohammed-bus', 5],
      ['ras-mohammed-private-car', 5],
    ] as const) {
      const source = sourceCatalog.trips.find((entry) => entry.slug === slug)!;
      expect(source.itinerary.filter(([time]) => time === null)).toHaveLength(
        untimed,
      );
      const stops = await connection.db
        .select({
          time: s.tripItinerary.timeLabel,
          text: s.tripItinerary.text,
        })
        .from(s.tripItinerary)
        .innerJoin(s.trips, eq(s.trips.id, s.tripItinerary.tripId))
        .where(eq(s.trips.slug, slug))
        .orderBy(s.tripItinerary.sort);
      expect(stops.map(({ time, text }) => [time, text.en])).toEqual(
        source.itinerary,
      );
    }
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
  it('serves one multilingual search index of published content', async () => {
    const response = await app.request('/v1/public/search-index?locale=en');
    expect(response.status).toBe(200);
    const body = await response.text();
    const index = searchIndexSchema.parse(JSON.parse(body));
    expect(gzipSync(body).length).toBeLessThanOrEqual(80 * 1024);
    const slugs = index.entries.map((e) => e.slug);
    expect(slugs).toContain('tiran-island-boat');
    expect(slugs).toContain('sea');
    expect(slugs).not.toContain('egypt-in-4-days'); // draft package
    const site = siteSchema.parse(
      await (await app.request('/v1/public/site?locale=en')).json(),
    );
    expect(index.suggested).toEqual(site.featured_trips.map((t) => t.slug));
    // Every core language the site shows is searchable from the EN index.
    const ru = tripSchema.parse(
      await (
        await app.request('/v1/public/trips/tiran-island-boat?locale=ru')
      ).json(),
    );
    expect(ru.title.lang).toBe('ru');
    const tiran = index.entries.find((e) => e.slug === 'tiran-island-boat')!;
    expect(tiran.fields.title).toContain(normalize(ru.title.text));
    expect(tiran.fields.keywords).toContain('جزيره تيران');
    expect(tiran.title).toEqual({ text: 'Tiran Island by Boat', lang: 'en' });
    // Prices come from the database, computed exactly as the trip card does
    // (one adult, group unless the trip is private-only; null on request).
    const everyTrip = (
      await loadCatalog(connection.db, 'en', cfg.MEDIA_PUBLIC_URL)
    ).trips;
    expect(everyTrip.length).toBeGreaterThan(30);
    for (const en of everyTrip) {
      const slug = en.slug;
      const card = estimateTrip(
        en,
        1,
        0,
        en.format === 'private' ? 'private' : 'group',
      );
      expect(index.entries.find((e) => e.slug === slug)!.from_price_eur).toBe(
        card.onRequest ? null : card.amount,
      );
    }
    const [primary] = await connection.db
      .select()
      .from(s.tripPrices)
      .where(
        and(
          eq(s.tripPrices.isPrimary, true),
          eq(
            s.tripPrices.tripId,
            sql`(select id from trips where slug = 'tiran-island-boat')`,
          ),
        ),
      );
    await connection.db
      .update(s.tripPrices)
      .set({ amountEur: '999' })
      .where(eq(s.tripPrices.id, primary!.id));
    try {
      const repriced = searchIndexSchema.parse(
        await (await app.request('/v1/public/search-index?locale=en')).json(),
      );
      expect(
        repriced.entries.find((e) => e.slug === 'tiran-island-boat')!
          .from_price_eur,
      ).toBe(999);
    } finally {
      await connection.db
        .update(s.tripPrices)
        .set({ amountEur: primary!.amountEur })
        .where(eq(s.tripPrices.id, primary!.id));
    }
    expect(tiran.thumb?.video).toBeUndefined();
    expect(JSON.stringify(index)).not.toMatch(/editorial|original_path/);
    const search = createSearch(index);
    expect(search('isola di tiran')[0]?.slug).toBe('tiran-island-boat');
    expect(
      (await app.request('/v1/public/search-index?locale=zz')).status,
    ).toBe(404);
    expect(
      (await app.request('/v1/public/search-index?locale=en&q=tiran')).status,
    ).toBe(422);
    expect(
      (await app.request('/v1/public/search-index?locale=en&locale=it')).status,
    ).toBe(422);
  });
  it('saves search keywords from the admin and searches them without a deploy', async () => {
    const [trip] = await connection.db
      .select()
      .from(s.trips)
      .where(eq(s.trips.slug, 'glass-bottom-boat'));
    const [sea] = await connection.db
      .select()
      .from(s.collections)
      .where(eq(s.collections.slug, 'sea'));
    try {
      const saved = await owner.call(
        '/v1/admin/trips/' + trip!.id + '/seo',
        'PATCH',
        { searchKeywords: { it: ['barca di vetro'], extra: ['قارب قزاز'] } },
      );
      expect(saved.status).toBe(200);
      const tooMany = await owner.call(
        '/v1/admin/trips/' + trip!.id + '/seo',
        'PATCH',
        {
          searchKeywords: {
            en: Array.from({ length: 31 }, (_, i) => 'word' + i),
          },
        },
      );
      expect(tooMany.status).toBe(422);
      const duplicate = await owner.call(
        '/v1/admin/collections/' + sea!.id,
        'PATCH',
        { searchKeywords: { en: ['Reef', 'reef'] } },
      );
      expect(duplicate.status).toBe(422);
      expect(
        (
          await owner.call('/v1/admin/collections/' + sea!.id, 'PATCH', {
            searchKeywords: { en: ['underwater world'] },
          })
        ).status,
      ).toBe(200);
      const after = await owner.call('/v1/admin/trips/' + trip!.id, 'GET');
      expect((await after.json()).trip.searchKeywords).toEqual({
        it: ['barca di vetro'],
        extra: ['قارب قزاز'],
      });
      const search = createSearch(
        searchIndexSchema.parse(
          await (await app.request('/v1/public/search-index?locale=en')).json(),
        ),
      );
      expect(search('قارب قزاز')[0]?.slug).toBe('glass-bottom-boat');
      expect(search('underwater world').map((e) => e.slug)).toContain('sea');
    } finally {
      await connection.db
        .update(s.trips)
        .set({ searchKeywords: trip!.searchKeywords })
        .where(eq(s.trips.id, trip!.id));
      await connection.db
        .update(s.collections)
        .set({ searchKeywords: sea!.searchKeywords })
        .where(eq(s.collections.id, sea!.id));
    }
  });
  it('rejects an incomplete live hero edit and keeps legacy slides from blocking bookings', async () => {
    const [hero] = await connection.db
      .select()
      .from(s.heroSlides)
      .where(eq(s.heroSlides.status, 'published'))
      .orderBy(s.heroSlides.sort)
      .limit(1);
    const path = '/v1/admin/hero-slides/' + hero!.id;
    for (const patch of [
      { headline: null, collectionId: null },
      { videoMediaId: null, imageMediaId: null },
      { ctaType: 'trip', ctaTarget: 'missing-trip' },
      { ctaType: 'page', ctaTarget: '/missing-page' },
      { startsAt: '2027-02-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z' },
    ]) {
      const invalid = await owner.call(path, 'PATCH', patch);
      expect(invalid.status).toBe(422);
    }
    const [unchanged] = await connection.db
      .select()
      .from(s.heroSlides)
      .where(eq(s.heroSlides.id, hero!.id));
    expect(unchanged).toEqual(hero);

    // Simulate a previously saved row before live edits shared publish validation.
    await connection.db
      .update(s.heroSlides)
      .set({ headline: null, collectionId: null })
      .where(eq(s.heroSlides.id, hero!.id));
    try {
      const response = await app.request('/v1/public/site?locale=it');
      expect(response.status).toBe(200);
      expect(
        siteSchema.parse(await response.json()).hero_slides.map((s) => s.id),
      ).not.toContain(hero!.id);
      expect(
        (await app.request('/v1/public/trips/quad-bike-safari')).status,
      ).toBe(200);
      const request = await submit(booking({ phone: '+201055529982' }));
      expect(request.status).toBe(201);
    } finally {
      await connection.db
        .update(s.heroSlides)
        .set({ headline: hero!.headline, collectionId: hero!.collectionId })
        .where(eq(s.heroSlides.id, hero!.id));
    }
  });
  it('hands Italian, Russian and Turkish requests to the second WhatsApp line', async () => {
    for (const [locale, digits] of [
      ['it', '201008605904'],
      ['ru', '201008605904'],
      ['tr', '201008605904'],
      ['de', '201069012881'],
    ]) {
      const response = await submit(booking({ locale }));
      expect(response.status).toBe(201);
      expect((await response.json()).whatsapp_url).toMatch(
        new RegExp('^https://wa\\.me/' + digits + '\\?text='),
      );
    }
  });
  it('stores the currency an English visitor saw and euros for every other language', async () => {
    for (const [locale, currency, stored] of [
      ['en', 'GBP', 'GBP'],
      ['en', 'USD', 'USD'],
      ['en', undefined, 'EUR'],
      ['it', 'USD', 'EUR'],
    ] as const) {
      const response = await submit(
        booking({ locale, ...(currency ? { currency } : {}) }),
      );
      expect(response.status).toBe(201);
      const { ref } = await response.json();
      const [row] = await connection.db
        .select({ currency: s.bookingRequests.currency })
        .from(s.bookingRequests)
        .where(eq(s.bookingRequests.ref, ref));
      expect(row?.currency).toBe(stored);
    }
    expect((await submit(booking({ currency: 'EGP' }))).status).toBe(422);
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
  it('uses the canonical booking number in storage and staff email', async () => {
    const canonical = '+442079460958';
    for (const raw of [
      '020 7946 0958',
      '+4402079460958',
      '+44 (0)20 7946 0958',
    ]) {
      expect((await submit(booking({ phone: raw }))).status).toBe(422);
    }
    const response = await submit(booking({ phone: canonical }));
    expect(response.status).toBe(201);
    const { ref } = await response.json();
    const [request] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.ref, ref));
    expect(request?.phone).toBe(canonical);
    const messages: string[] = [];
    await notifyRequest(workerConnection.db, cfg, request!.id, {
      sendMail: async (mail) => {
        messages.push(String(mail.text));
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Phone: ' + canonical + '\n');
  });
  it('saves a mixed private itinerary in the requested order without pricing unknown trips at zero', async () => {
    const input = {
      items: [
        { trip_slug: 'cairo-plane-2-days-private' },
        { trip_slug: 'ras-mohammed-private-car' },
        { trip_slug: 'private-speed-boat' },
      ],
      start_date: minBookingDate(),
      adults: 2,
      children: 0,
      format: 'private',
      locale: 'en',
      rest_days: true,
      preserve_order: true,
    };
    expect(
      (await previewQuote({ ...input, start_date: cairoDate() })).status,
    ).toBe(422);
    const quoteResponse = await previewQuote(input);
    expect(quoteResponse.status).toBe(200);
    const quote = quoteSchema.parse(await quoteResponse.json());
    expect(
      quote.items.map(({ trip_slug, day_index }) => [trip_slug, day_index]),
    ).toEqual([
      ['cairo-plane-2-days-private', 1],
      ['ras-mohammed-private-car', 4],
      ['private-speed-boat', 5],
    ]);
    expect(quote.estimate_eur).toBeNull();
    expect(quote.items[1]?.amount_eur).toBeNull();
    expect(quote.known_eur).toBeGreaterThan(0);
    const body = booking({
      ...input,
      mode: 'multi',
      quote_id: quote.quote_id,
      phone: '+201033344763',
      submission_id: randomBytes(32).toString('hex'),
    });
    const invalidArea = await submit({
      ...body,
      pickup_area: 'Unlisted hotel',
    });
    expect(invalidArea.status).toBe(422);
    expect((await invalidArea.json()).error.code).toBe('PICKUP_AREA_INVALID');
    expect((await submit({ ...body, start_date: cairoDate() })).status).toBe(
      422,
    );
    const sent = await submit(body);
    expect(sent.status).toBe(201);
    const confirmation = await sent.json();
    expect(confirmation.message.split('\n')[0]).toBe(
      '*Booking request · ' + confirmation.ref + '*',
    );
    expect(confirmation.message).not.toContain('Estimated total');
    const [saved] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.ref, confirmation.ref));
    expect(saved?.estimateEur).toBeNull();
    const items = await connection.db
      .select({ day: s.bookingRequestItems.dayIndex })
      .from(s.bookingRequestItems)
      .where(eq(s.bookingRequestItems.requestId, saved!.id))
      .orderBy(s.bookingRequestItems.dayIndex);
    expect(items.map(({ day }) => day)).toEqual([1, 4, 5]);
  });
  it('recovers the original confirmation after a lost response and concurrent retries', async () => {
    const key = randomBytes(32).toString('hex');
    const phone = '+201033344781';
    const ip = 'replay-' + randomUUID();
    const body = booking({ submission_id: key, phone });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => submit(body, ip)),
    );
    expect(results.map((result) => result.status)).toEqual([
      201, 201, 201, 201, 201,
    ]);
    const confirmations = await Promise.all(
      results.map((result) => result.json()),
    );
    expect(confirmations).toEqual(Array(5).fill(confirmations[0]));
    const saved = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.phone, phone));
    expect(saved).toHaveLength(1);
    const [request] = saved;
    const rows = await connection.db
      .select()
      .from(s.bookingRequestReceipts)
      .where(eq(s.bookingRequestReceipts.submissionId, key));
    expect(rows[0]).toMatchObject({
      requestId: request!.id,
      confirmation: confirmations[0],
    });
    expect(rows[0]!.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    const notifications = await connection.db
      .select()
      .from(s.outbox)
      .where(
        sql`name in ('notify.request.created', 'notify.request.push') and data->>'requestId' = ${request!.id}`,
      );
    expect(
      notifications.filter((entry) => entry.name === 'notify.request.created'),
    ).toHaveLength(1);
    expect(
      notifications.filter((entry) => entry.name === 'notify.request.push')
        .length,
    ).toBeLessThanOrEqual(1);
    const retry = await submit({ ...body, t: Date.now() - 2 * 86400000 }, ip);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(confirmations[0]);
    const mismatch = await submit({ ...body, notes: 'Different request' }, ip);
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({
      error: { code: 'SUBMISSION_CONFLICT' },
    });
    expect(
      (
        await connection.db
          .select()
          .from(s.bookingRequests)
          .where(eq(s.bookingRequests.id, request!.id))
      )[0]!.notes,
    ).toBeNull();

    await connection.db
      .update(s.bookingRequestReceipts)
      .set({ expiresAt: new Date('2020-01-01') })
      .where(eq(s.bookingRequestReceipts.submissionId, key));
    await cleanupSessions(workerConnection.db);
    const [expired] = await connection.db
      .select()
      .from(s.bookingRequestReceipts)
      .where(eq(s.bookingRequestReceipts.submissionId, key));
    expect(expired?.confirmation).toBeNull();
    const late = await submit(body, ip);
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({
      error: { code: 'SUBMISSION_EXPIRED' },
    });
    await expect(
      workerConnection.db.select().from(s.bookingRequestReceipts),
    ).rejects.toThrow();
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
      expect(confirmation.message).toContain(confirmation.ref);
      expect(confirmation.message).not.toContain(
        bundledCoreText('Quad Bike Safari', locale),
      );
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
  it('requires the private format for a basket containing a private-only trip', async () => {
    const body = booking({
      mode: 'multi',
      items: [
        { trip_slug: 'quad-bike-safari' },
        { trip_slug: 'ras-mohammed-private-car' },
      ],
      phone: '+201033344499',
    });
    const group = await submit(body);
    expect(group.status).toBe(422);
    expect(await group.json()).toMatchObject({
      error: { code: 'PRIVATE_ONLY' },
    });

    const response = await submit({ ...body, format: 'private' });
    expect(response.status).toBe(201);
    const { ref } = await response.json();
    const [request] = await connection.db
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.ref, ref));
    expect(request).toMatchObject({ mode: 'multi', format: 'private' });
    const items = await connection.db
      .select({ slug: s.trips.slug })
      .from(s.bookingRequestItems)
      .innerJoin(s.trips, eq(s.bookingRequestItems.tripId, s.trips.id))
      .where(eq(s.bookingRequestItems.requestId, request!.id));
    expect(items.map(({ slug }) => slug).sort()).toEqual([
      'quad-bike-safari',
      'ras-mohammed-private-car',
    ]);
  });
  it('uses future service dates and the primary ID, and saves only after a changed quote is reviewed', async () => {
    const start = addCalendarDays(cairoDate(), 5);
    const privateDate = addCalendarDays(start, 2);
    const finish = addCalendarDays(start, 3);
    const flightSlug = 'cairo-plane-1-day';
    const privateSlug = 'cairo-plane-2-days-private';
    const [flight] = await connection.db
      .select()
      .from(s.trips)
      .where(eq(s.trips.slug, flightSlug));
    const [final] = await connection.db
      .select()
      .from(s.trips)
      .where(eq(s.trips.slug, privateSlug));
    const [original] = await connection.db
      .select()
      .from(s.tripPrices)
      .where(
        and(
          eq(s.tripPrices.tripId, final!.id),
          eq(s.tripPrices.isPrimary, true),
        ),
      );
    const [flightPrice] = await connection.db
      .select()
      .from(s.tripPrices)
      .where(
        and(
          eq(s.tripPrices.tripId, flight!.id),
          eq(s.tripPrices.isPrimary, true),
        ),
      );
    const seasonal = randomUUID();
    const phone = '+201033366611';
    try {
      await connection.db
        .update(s.trips)
        .set({ privateSurchargePct: '0' })
        .where(eq(s.trips.id, flight!.id));
      await connection.db
        .update(s.tripPrices)
        .set({ validTo: addCalendarDays(start, 1), isPrimary: false })
        .where(eq(s.tripPrices.id, original!.id));
      await connection.db.insert(s.tripPrices).values([
        {
          id: seasonal,
          tripId: final!.id,
          unit: 'person',
          amountEur: '149.60',
          validFrom: privateDate,
          isPrimary: true,
          sort: 9,
        },
        {
          tripId: final!.id,
          unit: 'car',
          amountEur: '220',
          validFrom: privateDate,
          sort: -1,
        },
      ]);
      const input = {
        items: [
          { trip_slug: flightSlug, day_index: 99 },
          { trip_slug: privateSlug, day_index: 1 },
        ],
        start_date: start,
        rest_days: true,
        adults: 1,
        children: 0,
        format: 'private',
        locale: 'en',
      };
      const single = quoteSchema.parse(
        await (
          await previewQuote({
            ...input,
            items: [{ trip_slug: privateSlug }],
            start_date: privateDate,
          })
        ).json(),
      );
      expect(single.items[0]!.price_options[0]!.unit).toBe('car');
      expect(single.items[0]!.selected_price_id).toBe(seasonal);
      expect(single.estimate_eur).toBe(150);

      const preview = await previewQuote(input);
      expect(preview.status).toBe(200);
      expect(preview.headers.get('cache-control')).toBe('no-store');
      const quote = quoteSchema.parse(await preview.json());
      expect(
        quote.items.map((item) => [
          item.day_index,
          item.service_date,
          item.service_end_date,
        ]),
      ).toEqual([
        [1, start, start],
        [3, privateDate, finish],
      ]);
      expect(
        quote.items[1]!.price_options.map((price) => price.id),
      ).not.toContain(original!.id);
      expect(quote.estimate_eur).toBe(Number(flightPrice!.amountEur) + 150);
      await connection.db
        .update(s.tripPrices)
        .set({ amountEur: '151.60' })
        .where(eq(s.tripPrices.id, seasonal));
      const payload = booking({
        ...input,
        mode: 'multi',
        quote_id: quote.quote_id,
        phone,
        end_date: finish,
      });
      const changed = await submit(payload);
      expect(changed.status).toBe(409);
      const conflict = await changed.json();
      expect(conflict.error.code).toBe('QUOTE_CHANGED');
      const revised = quoteSchema.parse(conflict.quote);
      expect(revised.estimate_eur).toBe(quote.estimate_eur! + 2);
      expect(
        await connection.db
          .select()
          .from(s.bookingRequests)
          .where(eq(s.bookingRequests.phone, phone)),
      ).toEqual([]);
      const response = await submit({ ...payload, quote_id: revised.quote_id });
      expect(response.status).toBe(201);
      const confirmation = await response.json();
      expect(confirmation.estimate_eur).toBe(revised.estimate_eur);
      // The WhatsApp hand-off is short: reference, name, stay and guests.
      // Staff open the full request (tours, dates, prices) by its reference.
      expect(confirmation.message).toContain(confirmation.ref);
      expect(confirmation.message).toContain(bookingStay(start, finish, 'en'));
      const [request] = await connection.db
        .select()
        .from(s.bookingRequests)
        .where(eq(s.bookingRequests.ref, confirmation.ref));
      expect(Number(request!.estimateEur)).toBe(revised.estimate_eur);
      const [saved] = await connection.db
        .select()
        .from(s.bookingRequestItems)
        .where(
          and(
            eq(s.bookingRequestItems.requestId, request!.id),
            eq(s.bookingRequestItems.tripId, final!.id),
          ),
        );
      expect(saved).toMatchObject({
        dayIndex: 3,
        priceSnapshot: {
          selected_price_id: seasonal,
          service_date: privateDate,
          service_end_date: finish,
          amount: 152,
          on_request: false,
        },
      });
      expect(
        (
          await connection.db
            .select()
            .from(s.outbox)
            .where(eq(s.outbox.name, 'notify.request.created'))
        ).filter(
          (task) =>
            (task.data as { requestId: string }).requestId === request!.id,
        ),
      ).toHaveLength(1);
    } finally {
      await connection.db
        .delete(s.tripPrices)
        .where(
          and(
            eq(s.tripPrices.tripId, final!.id),
            eq(s.tripPrices.validFrom, privateDate),
          ),
        );
      await connection.db
        .update(s.tripPrices)
        .set({ validTo: original!.validTo, isPrimary: true })
        .where(eq(s.tripPrices.id, original!.id));
      await connection.db
        .update(s.trips)
        .set({ privateSurchargePct: flight!.privateSurchargePct })
        .where(eq(s.trips.id, flight!.id));
    }
  });
  it('limits preview inputs to itinerary details from the public web origin', async () => {
    const input = {
      items: [{ trip_slug: 'quad-bike-safari' }],
      start_date: minBookingDate(),
      adults: 1,
      children: 0,
      format: 'private',
      locale: 'en',
    };
    expect((await previewQuote(input, 'https://example.invalid')).status).toBe(
      403,
    );
    expect(
      (await previewQuote({ ...input, name: 'Synthetic QA visitor' })).status,
    ).toBe(422);
    const quote = quoteSchema.parse(await (await previewQuote(input)).json());
    expect(quote).toMatchObject({
      estimate_eur: null,
      known_eur: 0,
      items: [{ amount_eur: null }],
    });
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
  it('signs in with email and password only and no longer serves two-step endpoints', async () => {
    const client = await login('editor');
    expect((await client.call('/v1/admin/trips')).status).toBe(200);
    const me = await (await client.call('/v1/admin/me')).json();
    expect(me).not.toHaveProperty('mfa_passed');
    expect(me).not.toHaveProperty('totp_enabled');
    for (const path of ['setup', 'enable', 'verify'])
      expect(
        (
          await client.call('/v1/admin/auth/2fa/' + path, 'POST', {
            code: '123456',
          })
        ).status,
      ).toBe(404);
    // Reauthentication takes the password alone.
    expect(
      (
        await client.call('/v1/admin/auth/reauth', 'POST', {
          password,
          code: '123456',
        })
      ).status,
    ).toBe(422);
    expect(
      (await client.call('/v1/admin/auth/reauth', 'POST', { password })).status,
    ).toBe(200);
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
    const sessionId = sessionHash(raw, cfg.SESSION_SECRET);
    const stale = new Date(Date.now() - 6 * 60_000);
    await connection.db
      .update(s.sessions)
      .set({ lastSeenAt: stale })
      .where(eq(s.sessions.id, sessionId));
    const activity = async () =>
      (
        await connection.db
          .select({ at: s.sessions.lastSeenAt })
          .from(s.sessions)
          .where(eq(s.sessions.id, sessionId))
      )[0]!.at.getTime();
    expect((await client.call('/v1/admin/requests')).status).toBe(200);
    const touched = await activity();
    expect(touched).toBeGreaterThan(stale.getTime());
    expect((await client.call('/v1/admin/requests')).status).toBe(200);
    expect(await activity()).toBe(touched);
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
        aad('auth-token', user!.id),
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
  it('previews and applies all 5000 prices with a compact token', async () => {
    const id = randomUUID();
    const [source] = await connection.db
      .select({ collectionId: s.trips.collectionId })
      .from(s.trips)
      .where(eq(s.trips.slug, 'tiran-island-boat'));
    await connection.db.insert(s.trips).values({
      id,
      slug: 'bulk-qa-' + id,
      title: { en: 'Bulk QA' },
      collectionId: source!.collectionId,
    });
    try {
      await connection.db
        .execute(sql`insert into trip_prices(trip_id, unit, amount_eur, sort)
        select ${id}::uuid, 'person', 20, n from generate_series(1, 5000) n`);
      const input = { tripIds: [id], mode: 'amount', value: 2 };
      const preview = await owner.call(
        '/v1/admin/prices/bulk/preview',
        'POST',
        input,
      );
      expect(preview.status).toBe(200);
      const { rows, token } = await preview.json();
      expect(rows).toHaveLength(5000);
      expect(token.length).toBeLessThan(1000);
      const [extra] = await connection.db
        .insert(s.tripPrices)
        .values({ tripId: id, unit: 'person', amountEur: '20' })
        .returning();
      const over = await owner.call(
        '/v1/admin/prices/bulk/preview',
        'POST',
        input,
      );
      expect(over.status).toBe(422);
      expect(await over.json()).toMatchObject({
        error: { code: 'PREVIEW_TOO_LARGE' },
      });
      const stale = await owner.call('/v1/admin/prices/bulk/apply', 'POST', {
        token,
      });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({
        error: { code: 'PREVIEW_STALE' },
      });
      await connection.db
        .delete(s.tripPrices)
        .where(eq(s.tripPrices.id, extra!.id));
      expect(
        (await owner.call('/v1/admin/prices/bulk/apply', 'POST', { token }))
          .status,
      ).toBe(200);
      const { rows: totals } = await connection.db.execute<{ count: number }>(
        sql`select count(*)::int as count from trip_prices where trip_id=${id} and amount_eur=22`,
      );
      expect(totals[0]?.count).toBe(5000);
    } finally {
      await connection.db.delete(s.trips).where(eq(s.trips.id, id));
    }
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
    const incomplete = await owner.call(
      `/v1/admin/trips/${trip!.id}/publish`,
      'POST',
      {},
    );
    expect(await incomplete.json()).toMatchObject({
      error: { code: 'CORE_TRANSLATIONS_REQUIRED' },
    });
    expect(
      (
        await editor.call(`/v1/admin/trips/${trip!.id}/basics`, 'PATCH', {
          title: completeQaCopy(trip!.title.en),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await editor.call(`/v1/admin/trips/${trip!.id}/itinerary`, 'PUT', {
          rows: [
            { timeLabel: null, text: completeQaCopy('QA staged itinerary') },
          ],
        })
      ).status,
    ).toBe(200);
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
          home: {
            ...body.home,
            build_heading: {
              ...completeQaCopy('QA homepage heading'),
              it: 'Titolo umano',
            },
          },
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
    ).toBe(422);
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
      (await owner.call('/v1/admin/auth/reauth', 'POST', { password })).status,
    ).toBe(200);
    const request = await submit(
      booking({ phone: '+201055500111', name: '=SUM(1,2)' }),
    );
    expect(request.status).toBe(201);
    const csv = await owner.call('/v1/admin/requests/export.csv');
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("'=SUM(1,2)");
  });
  it('matches one trip date for list, counts and filtered CSV, and streams a full export past 10000 rows', async () => {
    const prefix = 'CSV-QA-' + randomUUID();
    const split = prefix + '-split';
    const matched = prefix + '-matched';
    const trips = await connection.db
      .select({ id: s.trips.id })
      .from(s.trips)
      .limit(2);
    try {
      const requests = await connection.db
        .insert(s.bookingRequests)
        .values(
          [split, matched].map((ref) => ({
            ref,
            mode: 'multi' as const,
            locale: 'en',
            startDate: '2026-12-01',
            adults: 1,
            name: ref,
            phone: '+201033349241',
          })),
        )
        .returning();
      await connection.db.insert(s.bookingRequestItems).values([
        { requestId: requests[0]!.id, tripId: trips[0]!.id, dayIndex: 1 },
        { requestId: requests[0]!.id, tripId: trips[1]!.id, dayIndex: 10 },
        { requestId: requests[1]!.id, tripId: trips[0]!.id, dayIndex: 5 },
      ]);
      const criteria =
        '?q=' + prefix + '&tripFrom=2026-12-04&tripTo=2026-12-06';
      const list = await owner.call(
        '/v1/admin/requests' + criteria + '&status=new',
      );
      expect(list.status).toBe(200);
      expect(
        (await list.json()).map((entry: { ref: string }) => entry.ref),
      ).toEqual([matched]);
      const counts = await owner.call('/v1/admin/requests/counts' + criteria);
      expect(await counts.json()).toMatchObject({ new: 1, all: 1 });
      const selected = await owner.call(
        '/v1/admin/requests/export.csv' +
          criteria +
          '&scope=filtered&status=new',
      );
      expect(selected.status).toBe(200);
      const exported = await selected.text();
      expect(exported).toContain(matched);
      expect(exported).not.toContain(split);
      expect(exported.trim().split('\r\n')).toHaveLength(2);
      await connection.db.execute(sql`
        insert into booking_requests(ref, mode, locale, start_date, adults, name, phone, created_at)
        select ${prefix} || '-row-' || n, 'single', 'en', '2026-12-01', 1,
          'Synthetic QA', '+201033349241', '2026-11-12T12:00:00.123456Z'::timestamptz
        from generate_series(1,10001) n
      `);
      const all = await owner.call('/v1/admin/requests/export.csv?scope=all');
      expect(all.status).toBe(200);
      const full = await all.text();
      const ids = full
        .split('\r\n')
        .filter((row) => row.startsWith('"' + prefix + '-row-'))
        .map((row) => row.split(',')[0]);
      expect(ids).toHaveLength(10001);
      expect(new Set(ids).size).toBe(10001);
    } finally {
      await connection.db
        .delete(s.bookingRequests)
        .where(sql`${s.bookingRequests.ref} like ${prefix + '%'}`);
    }
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
  async function account(role: (typeof roles)[number] = 'editor') {
    const [user] = await connection.db
      .insert(s.adminUsers)
      .values({
        email: randomUUID() + '@example.test',
        name: 'Security QA',
        role,
        passwordHash: await passwordHash(password),
      })
      .returning();
    const client = new Client();
    expect(
      (
        await client.call('/v1/admin/auth/login', 'POST', {
          email: user!.email,
          password,
        })
      ).status,
    ).toBe(200);
    return { user: user!, client };
  }
  const dashboardAccount = (role: (typeof roles)[number] = 'owner') =>
    account(role);
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
  it('rejects the removed two-step requirement on staff accounts', async () => {
    const owner = await dashboardAccount(),
      editor = await dashboardAccount('editor');
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
    ).toBe(422);
    expect((await editor.client.call('/v1/admin/trips')).status).toBe(200);
  });
  it('keeps code-managed review rows read-only and blocks publication with incomplete core copy', async () => {
    const queue = await owner.call('/v1/admin/i18n/queue?locale=fr&entity=ui');
    expect(queue.status).toBe(200);
    const home = (await queue.json()).find(
      (row: { field: string }) => row.field === 'home',
    );
    expect(home).toMatchObject({ state: 'repository', value: 'Accueil' });
    const update = await owner.call('/v1/admin/i18n/review', 'POST', {
      entity: 'ui',
      id: home.id,
      field: home.field,
      locale: 'fr',
      source: home.source,
      text: 'QA',
    });
    expect(await update.json()).toMatchObject({
      error: { code: 'REPOSITORY_MANAGED_TRANSLATION' },
    });
    const rejected = await owner.call('/v1/admin/faqs', 'POST', {
      q: { en: 'Synthetic QA question', fr: ' ' },
      a: { en: 'Synthetic QA answer' },
      publish: true,
    });
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error: { code: 'CORE_TRANSLATIONS_REQUIRED' },
    });
    expect(
      (await connection.db.select().from(s.faqs)).some(
        (row) => row.q.en === 'Synthetic QA question',
      ),
    ).toBe(false);
  });
  it('publishes and undoes editorial translations of departure, return and itinerary times', async () => {
    const [trip] = await connection.db
      .select()
      .from(s.trips)
      .where(
        and(
          eq(s.trips.status, 'published'),
          sql`${s.trips.departureLabel} IS NOT NULL AND ${s.trips.returnLabel} IS NOT NULL
        AND EXISTS (SELECT 1 FROM trip_itinerary i WHERE i.trip_id=${s.trips.id} AND i.time_label IS NOT NULL)`,
        ),
      )
      .limit(1);
    const [stop] = await connection.db
      .select()
      .from(s.tripItinerary)
      .where(
        and(
          eq(s.tripItinerary.tripId, trip!.id),
          sql`${s.tripItinerary.timeLabel} IS NOT NULL`,
        ),
      )
      .limit(1);
    const publicTrip = async () =>
      tripSchema.parse(
        await (
          await app.request('/v1/public/trips/' + trip!.slug + '?locale=fr')
        ).json(),
      );
    const queue = async () => {
      const response = await owner.call('/v1/admin/i18n/queue?locale=fr');
      expect(response.status).toBe(200);
      return (await response.json()) as Array<{
        entity: string;
        id: string;
        field: string;
      }>;
    };
    for (const [entity, id, field, source, read] of [
      [
        'trip',
        trip!.id,
        'departure_label',
        trip!.departureLabel,
        (value: Awaited<ReturnType<typeof publicTrip>>) =>
          value.departure_label,
      ],
      [
        'trip',
        trip!.id,
        'return_label',
        trip!.returnLabel,
        (value: Awaited<ReturnType<typeof publicTrip>>) =>
          value.return_label?.text,
      ],
      [
        'itinerary',
        stop!.id,
        'time_label',
        stop!.timeLabel,
        (value: Awaited<ReturnType<typeof publicTrip>>) =>
          value.itinerary.map((entry) => entry.time),
      ],
    ] as const) {
      const before = read(await publicTrip());
      const matchesTime = (row: Awaited<ReturnType<typeof queue>>[number]) =>
        row.entity === entity && row.id === id && row.field === field;
      const wasQueued = (await queue()).some(matchesTime);
      const text = 'Heure de contrôle ' + source;
      const response = await owner.call('/v1/admin/i18n/review', 'POST', {
        entity,
        id,
        field,
        locale: 'fr',
        source,
        text,
      });
      expect(response.status).toBe(200);
      expect(read(await publicTrip())).toContain(text);
      expect((await queue()).some(matchesTime)).toBe(false);
      const revision = response.headers
        .get('X-Stella-Revisions')!
        .split(',')[0];
      expect(
        (
          await owner.call(
            '/v1/admin/revisions/' + revision + '/restore',
            'POST',
            {},
          )
        ).status,
      ).toBe(200);
      expect(read(await publicTrip())).toEqual(before);
      expect((await queue()).some(matchesTime)).toBe(wasQueued);
    }
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
        data: {
          title: completeQaCopy('Contact'),
          text: Object.fromEntries(
            Object.entries(completeQaCopy('Contact the office')).filter(
              ([locale]) => locale !== 'fr',
            ),
          ),
        },
      })
      .returning();
    await connection.db.insert(s.contentTranslations).values({
      entity: 'page_block',
      entityId: block!.id,
      field: 'text',
      locale: 'fr',
      text: 'Contactez le bureau',
      origin: 'human',
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
          .where(
            and(
              eq(s.contentTranslations.entity, 'page_block'),
              eq(s.contentTranslations.entityId, block!.id),
              eq(s.contentTranslations.field, 'text'),
              eq(s.contentTranslations.locale, 'fr'),
            ),
          )
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
    const [first, second] = await connection.db
      .insert(s.pushSubscriptions)
      .values(
        (['fr', 'it'] as const).map((locale) => ({
          userId: owner.user.id,
          endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-' + locale,
          endpointHash: sha(randomUUID()),
          ...subscriptionKeys,
          locale,
        })),
      )
      .returning();
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
    const pushCfg = {
      ...cfg,
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: 'mailto:owner@example.test',
    };
    const queue = 'notify.request.push.device';
    const boss = new PgBoss({
      connectionString: workerUrl,
      migrate: false,
      createSchema: false,
    });
    await boss.start();
    try {
      await queueRequestPush(workerConnection.db, pushCfg, request!.id, boss);
      await queueRequestPush(workerConnection.db, pushCfg, request!.id, boss);
      const jobs = await boss.fetch(queue, { batchSize: 5 });
      expect(jobs.map(({ data }) => data)).toEqual(
        expect.arrayContaining([
          { requestId: request!.id, subscriptionId: first!.id },
          { requestId: request!.id, subscriptionId: second!.id },
        ]),
      );
      expect(jobs).toHaveLength(2);
      await boss.complete(
        queue,
        jobs.map(({ id }) => id),
      );
    } finally {
      await boss.stop();
    }
    await expect(
      notifyPush(
        workerConnection.db,
        pushCfg,
        request!.id,
        async () => {
          throw Object.assign(new Error('temporary provider failure'), {
            statusCode: 503,
          });
        },
        second!.id,
      ),
    ).rejects.toThrow('Push delivery failed');
    await notifyPush(
      workerConnection.db,
      pushCfg,
      request!.id,
      async (_subscription, payload) => {
        payloads.push(String(payload));
        return { statusCode: 201, body: '', headers: {} };
      },
      first!.id,
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
    const rotated = createApp(apiConnection.db, {
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
  it('registers a device at login, suppresses repeat alerts and supplies all seven email copies without raw secrets', async () => {
    const { user, client } = await account('manager');
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
        workerConnection.db,
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
    }
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
    const { client } = await account('manager');
    expect(
      (
        await client.call('/v1/admin/privacy/requests/export', 'POST', {
          phone,
        })
      ).status,
    ).toBe(403);
    expect(
      (await client.call('/v1/admin/auth/reauth', 'POST', { password })).status,
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
      /ipHash|userAgent|passwordHash/,
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
    await notifyRequest(workerConnection.db, cfg, row!.id, {
      sendMail: async (message) => {
        mail.push(message);
      },
    });
    expect(mail).toHaveLength(0);

    // The ledger keeps only a keyed hash, never the phone number.
    const ledger = await connection.db.select().from(s.privacyErasures);
    expect(JSON.stringify(ledger)).not.toContain(phone);
    expect(ledger.map((entry) => entry.phoneHash)).toContain(
      erasureHash(phone, cfg.IP_HASH_SALT),
    );
    // Simulate restoring an older backup that still holds the erased request,
    // plus a genuine new booking made after the erasure.
    const restoredRef = 'STL-RESTORED' + randomBytes(4).toString('hex');
    const newRef = 'STL-NEWBOOK' + randomBytes(4).toString('hex');
    const restoredRow = {
      mode: 'single' as const,
      locale: 'en',
      startDate: '2027-01-10',
      adults: 2,
      name: 'Restored guest',
      phone,
    };
    await connection.db.insert(s.bookingRequests).values([
      {
        ...restoredRow,
        ref: restoredRef,
        createdAt: new Date(Date.now() - 86400000),
      },
      { ...restoredRow, ref: newRef, createdAt: new Date(Date.now() + 60000) },
    ]);
    expect(await reapplyErasures(apiConnection.db, cfg.IP_HASH_SALT)).toBe(1);
    const remaining = await connection.db
      .select({ ref: s.bookingRequests.ref })
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.phone, phone));
    expect(remaining.map((entry) => entry.ref)).toEqual([newRef]);
    expect(await reapplyErasures(apiConnection.db, cfg.IP_HASH_SALT)).toBe(0);
    await connection.db
      .delete(s.bookingRequests)
      .where(eq(s.bookingRequests.ref, newRef));
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
    await purgeRequests(workerConnection.db);
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
        workerConnection.db,
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
    await processMedia(workerConnection.db, cfg, id);
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
  it('withdraws every known public rendition while keeping the staff preview available', async () => {
    const editor = await login('editor');
    const form = new FormData();
    form.set(
      'file',
      new Blob([
        new Uint8Array(
          await sharp(Buffer.from(nonce.repeat(2).slice(0, 48)), {
            raw: { width: 4, height: 4, channels: 3 },
          })
            .png()
            .toBuffer(),
        ),
      ]),
      'withdrawal.png',
    );
    const upload = await editor.call('/v1/admin/media', 'POST', form);
    expect(upload.status).toBe(202);
    const { id } = await upload.json();
    const asset = '/v1/admin/media/' + id;
    const publicPath = async () => {
      const [row] = await connection.db
        .select({ variants: s.media.variants })
        .from(s.media)
        .where(eq(s.media.id, id));
      return (row!.variants!.jpg as Record<string, string>)['480']!;
    };
    expect(
      (await editor.call(asset, 'PATCH', { rightsStatus: 'owned' })).status,
    ).toBe(200);
    await processMedia(workerConnection.db, cfg, id);
    const firstPath = await publicPath();
    // Simulate a ready asset that predates the rendition registry.
    await connection.db
      .delete(s.publicMediaRenditions)
      .where(eq(s.publicMediaRenditions.mediaId, id));
    const backfill = await readFile(
      new URL(
        '../../../packages/db/drizzle/0005_public_media_renditions.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await connection.db.execute(
      sql.raw(backfill.split('--> statement-breakpoint').at(-1)!),
    );
    expect(
      (
        await app.request('/internal/media-access', {
          headers: {
            'X-Stella-Media-Key': firstPath.slice(
              0,
              firstPath.lastIndexOf('/'),
            ),
          },
        })
      ).status,
    ).toBe(204);
    expect(
      (await editor.call(asset, 'PATCH', { autoEnhance: false })).status,
    ).toBe(200);
    await processMedia(workerConnection.db, cfg, id);
    const currentPath = await publicPath();
    expect(currentPath).not.toBe(firstPath);
    for (const path of [firstPath, currentPath]) {
      const publicRead = await app.request('/media/' + path);
      expect(publicRead.status).toBe(200);
      expect(publicRead.headers.get('cache-control')).toContain(
        'must-revalidate',
      );
      await publicRead.arrayBuffer();
    }
    expect(
      (await editor.call(asset, 'PATCH', { rightsStatus: 'unknown' })).status,
    ).toBe(200);
    for (const path of [firstPath, currentPath]) {
      // The bytes still exist. Rights must be checked before reading them.
      expect(
        (await readFile(resolve(cfg.MEDIA_ROOT, path))).length,
      ).toBeGreaterThan(0);
      expect((await app.request('/media/' + path)).status).toBe(404);
      const gate = await app.request('/internal/media-access', {
        headers: { 'X-Stella-Media-Key': path.slice(0, path.lastIndexOf('/')) },
      });
      expect(gate.status).toBe(404);
    }
    await Promise.all([
      processMedia(workerConnection.db, cfg, id),
      processMedia(workerConnection.db, cfg, id),
    ]);
    const preview = await editor.call(asset + '/preview');
    expect(preview.status).toBe(200);
    expect(preview.headers.get('cache-control')).toContain('no-store');
    await preview.arrayBuffer();
    expect((await app.request('/media/' + currentPath)).status).toBe(404);
  });
  it('retries a failed upload once and restores an archived original without granting rights', async () => {
    const editor = await login('editor');
    const bytes = await sharp(
      Buffer.from(nonce.split('').reverse().join('').repeat(2).slice(0, 48)),
      { raw: { width: 4, height: 4, channels: 3 } },
    )
      .png()
      .toBuffer();
    const upload = async () => {
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(bytes)]), 'retry.png');
      const response = await editor.call('/v1/admin/media', 'POST', form);
      expect(response.status).toBe(202);
      return response.json();
    };
    const { id } = await upload();
    const asset = '/v1/admin/media/' + id;
    const [original] = await connection.db
      .select()
      .from(s.media)
      .where(eq(s.media.id, id));
    await connection.db
      .update(s.media)
      .set({ status: 'failed' })
      .where(eq(s.media.id, id));
    await rm(original!.originalPath);
    const retries = await Promise.all([upload(), upload()]);
    expect(retries).toEqual([
      { id, status: 'processing' },
      { id, status: 'processing' },
    ]);
    const queued = await connection.db
      .select()
      .from(s.outbox)
      .where(
        sql`${s.outbox.name} = 'media.process' and ${s.outbox.data}->>'mediaId' = ${id}`,
      );
    expect(queued).toHaveLength(2);
    expect(await readFile(original!.originalPath)).toEqual(bytes);
    expect(
      (await editor.call(asset, 'PATCH', { rightsStatus: 'owned' })).status,
    ).toBe(200);
    await processMedia(workerConnection.db, cfg, id);
    expect(await upload()).toEqual({ id, status: 'ready' });
    expect((await editor.call(asset, 'DELETE')).status).toBe(200);
    await rm(original!.originalPath);
    expect(await upload()).toEqual({ id, status: 'processing' });
    const [restored] = await connection.db
      .select()
      .from(s.media)
      .where(eq(s.media.id, id));
    expect(restored).toMatchObject({
      archivedAt: null,
      rightsStatus: 'unknown',
    });
    expect(await readFile(restored!.originalPath)).toEqual(bytes);
    await processMedia(workerConnection.db, cfg, id);
    const preview = await editor.call(asset + '/preview');
    expect(preview.status).toBe(200);
    await preview.arrayBuffer();
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
    await processMedia(workerConnection.db, cfg, id);
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
    await notifyWeeklyPrices(workerConnection.db, cfg, {
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
    expect(sent.some((mail) => mail.to === cfg.SEED_OWNER_EMAIL)).toBe(true);
    // Readable, localized report (audit BUG-03), never raw audit JSON.
    const report = sent.find((mail) => mail.to === cfg.SEED_OWNER_EMAIL)!;
    expect(report.text).toContain('→');
    expect(report.text).not.toContain('trip_prices');
    expect(report.text).not.toContain('"amountEur"');
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
    await processMedia(workerConnection.db, cfg, id);
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
    await notifyRequest(workerConnection.db, cfg, request!.id, {
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
    await purgeRequests(workerConnection.db);
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
      fields = await publicTranslationFields(workerConnection.db, cfg);
    expect(JSON.stringify(fields)).not.toMatch(
      /Synthetic QA visitor|ipHash|originalPath|editorialNotes|setup-required/,
    );
    const provider = fakeProvider(payloads);
    await translatePublic(workerConnection.db, cfg, { locale: 'pl' }, [
      provider,
    ]);
    expect(payloads.length).toBeGreaterThan(0);
    expect(JSON.stringify(payloads)).not.toMatch(
      /Synthetic QA visitor|201012345678|setup-required/,
    );
    const live = await (await app.request('/v1/public/locales')).json();
    expect(live.some((l: { code: string }) => l.code === 'pl')).toBe(true);
    const delivered = payloads.length;
    await translatePublic(
      workerConnection.db,
      cfg,
      { entity: 'collection', locale: 'it' },
      [provider],
    );
    expect(payloads).toHaveLength(delivered);
    expect(
      (await owner.call('/v1/admin/i18n/backfill/it', 'POST')).status,
    ).toBe(422);
    expect(
      (
        await owner.call('/v1/admin/i18n/translate', 'POST', {
          entity: 'ui',
          id: 'qa',
          locale: 'it',
        })
      ).status,
    ).toBe(422);
    await workerConnection.db
      .execute(sql`select public.worker_save_machine_translation(
      'ui', 'qa-core-protection', 'copy', 'it', 'QA provider output', 'qa', 'fake'
    )`);
    expect(
      await connection.db
        .select()
        .from(s.contentTranslations)
        .where(eq(s.contentTranslations.entityId, 'qa-core-protection')),
    ).toEqual([]);
    expect(
      (await (await app.request('/v1/public/locales')).json()).some(
        (l: { code: string }) => l.code === 'ar',
      ),
    ).toBe(false);
    await translatePublic(workerConnection.db, cfg, { locale: 'ar' }, [
      provider,
    ]);
    expect(
      await (await app.request('/v1/public/locales')).json(),
    ).toContainEqual(
      expect.objectContaining({ code: 'ar', dir: 'rtl', indexable: true }),
    );
    expect(
      payloads.every(({ locale }) => locale === 'pl' || locale === 'ar'),
    ).toBe(true);
    // Enabled auto languages become searchable, and show in their language.
    const autoIndex = searchIndexSchema.parse(
      await (await app.request('/v1/public/search-index?locale=pl')).json(),
    );
    const autoTiran = autoIndex.entries.find(
      (e) => e.slug === 'tiran-island-boat',
    )!;
    expect(autoTiran.title.lang).toBe('pl');
    expect(autoTiran.fields.title).toContain('pl tiran island by boat');
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
      await reserveCharacters(
        workerConnection.db,
        'google',
        500001,
        1000000,
        true,
      ),
    ).toBe(false);
  });
  it('expands invalidation across affected collections/packages in bounded webhook bodies', async () => {
    const calls: string[][] = [];
    await revalidateWeb(
      workerConnection.db,
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
    expect(calls.flat()).not.toContain('trip:glass-bottom-boat');
    expect(calls.every((tags) => tags.length <= 50)).toBe(true);
  });
  it('dispatches the durable outbox and pg-boss enqueue in one transaction', async () => {
    const boss = new PgBoss({
      connectionString: workerUrl,
      migrate: false,
      createSchema: false,
    });
    await boss.start();
    try {
      await boss.schedule(
        'cleanup.sessions',
        '0 * * * *',
        {},
        { tz: 'Africa/Cairo' },
      );
      let dispatched = 0;
      let batch: number;
      do {
        batch = await dispatchOutbox(workerConnection.pool, boss);
        dispatched += batch;
      } while (batch > 0);
      expect(dispatched).toBeGreaterThan(0);
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
    const production = createApp(apiConnection.db, {
      ...cfg,
      NODE_ENV: 'production',
    });
    expect((await production.request('/v1/openapi.json')).status).toBe(401);
  });
});
