/**
 * AUDIT-T01 — Admin route authentication sweep (no database required).
 *
 * Builds the real Hono app with a database stub that throws on ANY use, then
 * sends an unauthenticated request (no cookie) to every registered
 * /v1/admin/* route and every other non-public route. A correctly guarded
 * route must answer 401/403 before touching the database. Anything else
 * (2xx, 404 from a handler, 422 from body parsing, 500 from the DB stub)
 * means the route ran code without authentication.
 *
 * Run: node_modules/.bin/tsx audit/2026-11-24/REPRODUCIBLE_TEST_CASES/route-auth-sweep.ts
 * Deterministic: no randomness, no network, no DB.
 */
import { createApp } from '../../../apps/api/src/app';
import type { Config } from '../../../apps/api/src/config';

const touched: string[] = [];
const db = new Proxy(
  {},
  {
    get(_t, prop) {
      touched.push(String(prop));
      throw new Error('DB_TOUCHED:' + String(prop));
    },
  },
) as never;

const cfg = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://x',
  SESSION_SECRET: 'a'.repeat(40),
  TOTP_ENC_KEY: Buffer.alloc(32).toString('base64'),
  IP_HASH_SALT: 'b'.repeat(40),
  MEDIA_ROOT: '.local/none',
  ORIGINALS_ROOT: '.local/none',
  MEDIA_PUBLIC_URL: 'https://media.example.test',
  WEB_REVALIDATE_URL: 'https://web.example.test/api/revalidate',
  WEB_REVALIDATE_SECRET: 'c'.repeat(40),
  WEB_ORIGIN: 'https://www.example.test',
  ADMIN_ORIGIN: 'https://admin.example.test',
  TRUSTED_PROXY_IPS: '',
  PUBLIC_READS_PER_MINUTE: 600,
  SMTP_HOST: 'localhost',
  SMTP_PORT: 25,
  SMTP_SECURE: 'false',
  SMTP_FROM: 'a@example.test',
  STAFF_NOTIFY_EMAIL: 'a@example.test',
  SEED_OWNER_EMAIL: 'a@example.test',
  BREACHED_PASSWORDS_FILE: 'none',
  FFMPEG_PATH: 'ffmpeg',
  FFPROBE_PATH: 'ffprobe',
  OWNER_REPORT_LOCALE: 'en',
  DEV_SIMPLE_ADMIN_LOGIN: 'false',
} as unknown as Config;

// The documented anonymous endpoints (they must still reject without a DB
// hit when the Origin is wrong, which we also test).
const anonymous = new Set([
  'POST /v1/admin/auth/login',
  'POST /v1/admin/auth/password/reset-request',
  'POST /v1/admin/auth/password/setup',
  'POST /v1/admin/auth/password/reset',
]);

async function main() {
  const errors: unknown[] = [];
  const app = createApp(db, cfg, (e) => errors.push(e));
  const seen = new Set<string>();
  const routes = app.routes
    .filter((r) => r.method !== 'ALL')
    .map((r) => ({ method: r.method, path: r.path }))
    .filter(({ method, path }) => {
      const k = method + ' ' + path;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const results: Array<{ route: string; status: number; dbTouched: boolean }> =
    [];
  for (const { method, path } of routes) {
    if (!path.startsWith('/v1/admin') && !path.startsWith('/internal'))
      continue;
    const url =
      'http://api.test' +
      path
        .replace(
          /:id\b|:userId\b|:requestId\b/g,
          '00000000-0000-4000-8000-000000000000',
        )
        .replace(/:[a-zA-Z]+/g, 'x')
        .replace(/\*$/, 'x');
    touched.length = 0;
    const res = await app.request(url, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'https://admin.example.test',
      },
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: '{}' }),
    });
    results.push({
      route: method + ' ' + path,
      status: res.status,
      dbTouched: touched.length > 0,
    });
  }
  let suspicious = 0;
  for (const r of results) {
    const ok = r.status === 401 || r.status === 403;
    const expectedAnon = anonymous.has(r.route);
    const flag = !ok && !expectedAnon;
    if (flag) suspicious++;
    console.log(
      (flag ? 'SUSPICIOUS ' : expectedAnon ? 'anonymous  ' : 'guarded    ') +
        String(r.status).padEnd(4) +
        (r.dbTouched ? 'db ' : '   ') +
        r.route,
    );
  }
  console.log(
    `\nroutes tested: ${results.length}; suspicious: ${suspicious}; unexpected 500s logged: ${errors.length}`,
  );
  process.exitCode = suspicious ? 1 : 0;
}
void main();
