import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const paths = [
  '.env',
  'apps/api/.env',
  'apps/api/.env.worker',
  'apps/web/.env.local',
  'apps/admin/.env.local',
];
for (const path of paths) {
  if (
    await access(resolve(root, path))
      .then(() => true)
      .catch(() => false)
  )
    throw new Error('Existing local configuration preserved: ' + path);
}
const migration = randomBytes(32).toString('hex'),
  app = randomBytes(32).toString('hex'),
  worker = randomBytes(32).toString('hex'),
  session = randomBytes(32).toString('hex'),
  totp = randomBytes(32).toString('base64'),
  salt = randomBytes(32).toString('hex'),
  revalidate = randomBytes(32).toString('hex');
const db = (user: string, password: string) =>
  `postgresql://${user}:${password}@127.0.0.1:55433/stella_dev`;
const tool = (name: string) =>
  process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'] ??
  (process.platform === 'win32'
    ? resolve(root, '.tools/ffmpeg', name + '.exe').replaceAll('\\', '/')
    : name);
const files: Record<string, string> = {
  'apps/admin/.env.local': [
    'API_INTERNAL_URL=http://127.0.0.1:4000',
    'NEXT_PUBLIC_ADMIN_URL=http://localhost:3001',
    'NEXT_PUBLIC_API_URL=http://localhost:4000',
    'PUBLIC_API_URL=http://localhost:4000',
    'SITE_URL=http://localhost:3000',
  ].join('\n'),
  '.env': [
    `POSTGRES_PASSWORD=${migration}`,
    `APP_DB_PASSWORD=${app}`,
    `WORKER_DB_PASSWORD=${worker}`,
    'POSTGRES_PORT=55433',
    'MAILPIT_SMTP_PORT=11025',
    'MAILPIT_HTTP_PORT=18025',
    `DATABASE_URL=${db('stella_api', app)}`,
    `MIGRATION_DATABASE_URL=${db('stella_migrate', migration)}`,
    'SEED_OWNER_EMAIL=owner@example.test',
    'SEED_SETUP_FILE=.local/admin/owner-setup.txt',
    'ADMIN_ORIGIN=http://localhost:3001',
    'MEDIA_ROOT=.local/dev/media',
    'ORIGINALS_ROOT=.local/dev/originals',
    `FFMPEG_PATH=${tool('ffmpeg')}`,
    `FFPROBE_PATH=${tool('ffprobe')}`,
  ].join('\n'),
  'apps/api/.env': [
    'NODE_ENV=development',
    'HOST=127.0.0.1',
    'PORT=4000',
    `DATABASE_URL=${db('stella_api', app)}`,
    `SESSION_SECRET=${session}`,
    `TOTP_ENC_KEY=${totp}`,
    `IP_HASH_SALT=${salt}`,
    'MEDIA_ROOT=../../.local/dev/media',
    'ORIGINALS_ROOT=../../.local/dev/originals',
    'MEDIA_PUBLIC_URL=http://localhost:4000/media',
    'WEB_REVALIDATE_URL=http://localhost:3000/api/revalidate',
    `WEB_REVALIDATE_SECRET=${revalidate}`,
    'WEB_ORIGIN=http://localhost:3000',
    'ADMIN_ORIGIN=http://localhost:3001',
    'SMTP_HOST=127.0.0.1',
    'SMTP_PORT=11025',
    'SMTP_SECURE=false',
    'SMTP_FROM=stella@example.test',
    'STAFF_NOTIFY_EMAIL=staff@example.test',
    'SEED_OWNER_EMAIL=owner@example.test',
    'BREACHED_PASSWORDS_FILE=../../.local/security/common-passwords-100k.txt',
    `FFMPEG_PATH=${tool('ffmpeg')}`,
    `FFPROBE_PATH=${tool('ffprobe')}`,
  ].join('\n'),
  'apps/api/.env.worker': `DATABASE_URL=${db('stella_worker', worker)}\nTRANSLATE_PROVIDER=deepl\nGOOGLE_FREE_TIER_CONFIRMED=false`,
  'apps/web/.env.local': [
    'API_INTERNAL_URL=http://127.0.0.1:4000',
    'NEXT_PUBLIC_API_URL=http://localhost:4000',
    'NEXT_PUBLIC_SITE_URL=http://localhost:3000',
    'MEDIA_PUBLIC_URL=http://localhost:4000/media',
    `WEB_REVALIDATE_SECRET=${revalidate}`,
  ].join('\n'),
};
await mkdir(resolve(root, '.local/admin'), { recursive: true, mode: 0o700 });
for (const [path, value] of Object.entries(files)) {
  await mkdir(resolve(root, path, '..'), { recursive: true });
  await writeFile(resolve(root, path), value + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
}
console.log(
  'Created ignored development configs with unique credentials. PostgreSQL :55433, Mailpit :11025/:18025.',
);
