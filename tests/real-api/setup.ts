import { parseEnv } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { rateLimitAddress } from '../../packages/shared/src/ip';
import { connectDatabase } from '../../packages/db/src/index';
export async function localDatabase(
  mode: 'development' | 'verification' = 'development',
  access: 'fixture' | 'runtime' = 'fixture',
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
  } else if (
    env.NODE_ENV !== 'development' ||
    url.hostname !== '127.0.0.1' ||
    // A second disposable stack (another worktree) may use other loopback
    // ports; the host, database name and test mail domain stay fixed.
    url.port !== (process.env.STELLA_DEV_POSTGRES_PORT ?? '55433') ||
    url.pathname !== '/stella_dev' ||
    env.STAFF_NOTIFY_EMAIL !== 'staff@example.test' ||
    env.SMTP_PORT !== (process.env.STELLA_DEV_SMTP_PORT ?? '11025')
  )
    throw new Error(
      'This browser suite requires the isolated generated local development configuration',
    );
  if (url.username !== 'stella_api')
    throw new Error('The isolated API must use its runtime role');
  const credential =
    access === 'runtime'
      ? url
      : new URL(
          parseEnv(
            await readFile(
              mode === 'verification'
                ? '.local/integration-runtime/production/env/migration.env'
                : '.env',
              'utf8',
            ),
          ).MIGRATION_DATABASE_URL!,
        );
  if (
    credential.host !== url.host ||
    credential.pathname !== url.pathname ||
    credential.username !==
      (access === 'runtime' ? 'stella_api' : 'stella_migrate')
  )
    throw new Error('Fixture credentials must match the isolated database');
  if (mode === 'verification') {
    credential.hostname = '127.0.0.1';
    credential.port = '4991';
  }
  return { ...connectDatabase(credential.href), env };
}
export async function assertRestrictedRuntime(
  mode: 'development' | 'verification',
) {
  const { pool } = await localDatabase(mode, 'runtime');
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
  } finally {
    await pool.end();
  }
}
export default async function setup() {
  await assertRestrictedRuntime('development');
  const { pool, env } = await localDatabase();
  try {
    const hashes = [
      '127.0.0.1',
      '::1',
      '::ffff:127.0.0.1',
      rateLimitAddress('::1'),
    ].map(
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
