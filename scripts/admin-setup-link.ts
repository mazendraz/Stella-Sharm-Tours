import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectDatabase } from '../packages/db/src/index';
const source = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!source || !process.env.SEED_OWNER_EMAIL)
  throw new Error('Local database and seed owner email are required');
const url = new URL(source);
if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.port !== '55433' ||
  url.pathname !== '/stella_dev'
)
  throw new Error(
    'This helper is restricted to the generated local development database',
  );
const { pool } = connectDatabase(source);
try {
  const token = randomBytes(32).toString('base64url');
  const ownerEmail = await (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const {
        rows: [owner],
      } = await client.query<{
        id: string;
        email: string;
        role: string;
        disabled_at: Date | null;
        password_hash: string;
      }>(
        'select id,email,role,disabled_at,password_hash from admin_users where email=$1 for update',
        [process.env.SEED_OWNER_EMAIL!],
      );
      if (
        !owner ||
        owner.role !== 'owner' ||
        owner.disabled_at ||
        owner.password_hash !== '!setup-required'
      )
        throw new Error(
          'No unfinished local owner setup; use password reset in the dashboard',
        );
      await client.query(
        "delete from auth_tokens where user_id=$1 and purpose='setup'",
        [owner.id],
      );
      await client.query(
        "insert into auth_tokens(id,user_id,purpose,expires_at) values($1,$2,'setup',$3)",
        [
          createHash('sha256').update(token).digest('hex'),
          owner.id,
          new Date(Date.now() + 1800000),
        ],
      );
      await client.query('COMMIT');
      return owner.email;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })();
  const directory = resolve('.local/admin'),
    path = resolve(directory, 'owner-setup.txt');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    new URL(
      '/auth/setup?token=' + token,
      process.env.ADMIN_ORIGIN ?? 'http://localhost:3001',
    ).href +
      '\n\nEmail: ' +
      ownerEmail +
      '\nSingle use; expires in 30 minutes. Set your own password and keep it private.\n',
    { mode: 0o600 },
  );
  console.log(
    'Saved a private one-time local owner link to .local/admin/owner-setup.txt (30 minutes). No password was created.',
  );
} finally {
  await pool.end();
}
