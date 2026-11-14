import { parseEnv } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { connectDatabase } from '../../packages/db/src/index';
export async function localDatabase(
  mode: 'development' | 'verification' = 'development',
) {
  const env = parseEnv(
      await readFile(
        mode === 'verification'
          ? '.local/integration-runtime/production/env/api.env'
          : 'apps/api/.env',
        'utf8',
      ),
    ),
    url = new URL(env.DATABASE_URL!);
  if (mode === 'verification') {
    if (
      url.hostname !== 'postgres' ||
      url.pathname !== '/stella_prod' ||
      env.WEB_ORIGIN !== 'http://localhost:4983' ||
      env.ADMIN_ORIGIN !== 'http://localhost:4986' ||
      env.SMTP_HOST !== 'mailpit'
    )
      throw new Error(
        'Verification config is not the isolated local container stack',
      );
    url.hostname = '127.0.0.1';
    url.port = '4991';
    return { ...connectDatabase(url.href), env };
  }
  if (
    env.NODE_ENV !== 'development' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55433' ||
    url.pathname !== '/stella_dev' ||
    env.STAFF_NOTIFY_EMAIL !== 'staff@example.test' ||
    env.SMTP_PORT !== '11025'
  )
    throw new Error(
      'This browser suite requires the isolated generated local development configuration',
    );
  return { ...connectDatabase(env.DATABASE_URL!), env };
}
export default async function setup() {
  const { pool, env } = await localDatabase();
  try {
    const {
      rows: [role],
    } = await pool.query(
      "select rolsuper,rolcreatedb,rolcreaterole,has_schema_privilege(current_user,'public','CREATE') as can_create from pg_roles where rolname=current_user",
    );
    if (
      role.rolsuper ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.can_create
    )
      throw new Error('Runtime API database role has excessive privileges');
    const hashes = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].map(
      (ip) =>
        'request-ip:' +
        createHmac('sha256', env.IP_HASH_SALT!).update(ip).digest('hex'),
    );
    await pool.query('delete from rate_buckets where key=any($1::text[])', [
      hashes,
    ]);
  } finally {
    await pool.end();
  }
}
