import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access, copyFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
// Generates owner-only config; values are never printed. Existing credentials are preserved.
const [target, domain, registry, root = '/srv/stella'] = process.argv.slice(2);
if (
  !['production', 'staging'].includes(target) ||
  !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain ?? '') ||
  !/^ghcr\.io\/[a-z0-9][a-z0-9._-]*$/.test(registry ?? '') ||
  !isAbsolute(root)
) {
  throw new Error(
    'Usage: node infra/configure.mjs production|staging domain ghcr.io/org [/absolute/root]',
  );
}
const base = resolve(root, target);
for (const path of [
  'compose.env',
  'env/postgres.env',
  'env/api.env',
  'env/worker.env',
  'env/web.env',
  'env/admin.env',
  'env/migration.env',
  'env/staging-gate.env',
]) {
  if (
    await access(resolve(base, path))
      .then(() => true)
      .catch(() => false)
  )
    throw new Error('Existing environment preserved; edit it deliberately.');
}
for (const path of [
  '',
  'env',
  'originals',
  'security',
  'backups',
  'releases',
  'caddy/data',
  'caddy/config',
])
  await mkdir(resolve(base, path), { recursive: true, mode: 0o700 });
await mkdir(resolve(base, 'media'), { recursive: true, mode: 0o755 });
const hex = () => randomBytes(32).toString('hex');
const migration = hex(),
  api = hex(),
  worker = hex(),
  session = hex(),
  salt = hex(),
  revalidate = hex();
const dbName = target === 'production' ? 'stella_prod' : 'stella_staging';
const web = target === 'production' ? domain : `staging.${domain}`;
const admin =
  target === 'production' ? `admin.${domain}` : `staging-admin.${domain}`;
const apiHost =
  target === 'production' ? `api.${domain}` : `staging-api.${domain}`;
const media =
  target === 'production' ? `media.${domain}` : `staging-media.${domain}`;
const connection = (role, password) =>
  `postgresql://${role}:${password}@postgres:5432/${dbName}`;
const quote = (v) => "'" + v.replaceAll("'", "'\\''") + "'";
const compose = {
  COMPOSE_PROJECT_NAME: `stella-${target}`,
  IMAGE_PREFIX: registry,
  RELEASE: '0000000000000000000000000000000000000000',
  ENV_DIR: `${base}/env`,
  DATA_DIR: base,
  POSTGRES_DB: dbName,
  WEB_HOST: web,
  ADMIN_HOST: admin,
  API_HOST: apiHost,
  MEDIA_HOST: media,
  ACME_EMAIL: `owner@${domain}`,
  EDGE_SUBNET: target === 'production' ? '172.30.20.0/24' : '172.30.21.0/24',
  EDGE_DYNAMIC_RANGE:
    target === 'production' ? '172.30.20.128/25' : '172.30.21.128/25',
  CADDY_IP: target === 'production' ? '172.30.20.2' : '172.30.21.2',
};
const raw = (object) =>
  Object.entries(object)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';
const write = (name, value) =>
  writeFile(resolve(base, name), value, { flag: 'wx', mode: 0o600 });
await write(
  'compose.env',
  Object.entries(compose)
    .map(([k, v]) => `${k}=${quote(v)}`)
    .join('\n') + '\n',
);
await write(
  'env/postgres.env',
  raw({
    POSTGRES_PASSWORD: migration,
    APP_DB_PASSWORD: api,
    WORKER_DB_PASSWORD: worker,
  }),
);
await write(
  'env/migration.env',
  raw({
    MIGRATION_DATABASE_URL: connection('stella_migrate', migration),
    DATABASE_URL: connection('stella_migrate', migration),
    SEED_OWNER_EMAIL: `owner@${domain}`,
    ADMIN_ORIGIN: `https://${admin}`,
    MEDIA_ROOT: '/srv/stella/media',
    ORIGINALS_ROOT: '/srv/stella/originals',
  }),
);
await write(
  'env/api.env',
  raw({
    DATABASE_URL: connection('stella_api', api),
    SESSION_SECRET: session,
    TOTP_ENC_KEY: randomBytes(32).toString('base64'),
    IP_HASH_SALT: salt,
    WEB_REVALIDATE_SECRET: revalidate,
    WEB_ORIGIN: `https://${web}`,
    ADMIN_ORIGIN: `https://${admin}`,
    MEDIA_PUBLIC_URL:
      target === 'staging' ? `https://${web}/media` : `https://${media}`,
    SMTP_HOST: 'REPLACE_SMTP_HOST',
    SMTP_PORT: 587,
    SMTP_SECURE: 'false',
    SMTP_FROM: `website@${domain}`,
    STAFF_NOTIFY_EMAIL: `staff@${domain}`,
    SEED_OWNER_EMAIL: `owner@${domain}`,
  }),
);
await write(
  'env/worker.env',
  raw({
    DATABASE_URL: connection('stella_worker', worker),
    GOOGLE_FREE_TIER_CONFIRMED: 'false',
  }),
);
await write(
  'env/web.env',
  raw({
    SITE_URL: `https://${web}`,
    PUBLIC_API_URL:
      target === 'staging' ? `https://${web}` : `https://${apiHost}`,
    MEDIA_PUBLIC_URL:
      target === 'staging' ? `https://${web}/media` : `https://${media}`,
    WEB_REVALIDATE_SECRET: revalidate,
  }),
);
await write(
  'env/admin.env',
  raw({
    SITE_URL: `https://${web}`,
    PUBLIC_API_URL:
      target === 'staging' ? `https://${admin}` : `https://${apiHost}`,
  }),
);
if (target === 'staging')
  await write(
    'env/staging-gate.env',
    'STAGING_USER=stella\nSTAGING_PASSWORD_HASH=REPLACE_WITH_CADDY_BCRYPT_HASH\n',
  );
const repo = fileURLToPath(new URL('../', import.meta.url));
try {
  await copyFile(
    resolve(repo, '.local/security/common-passwords-100k.txt'),
    resolve(base, 'security/common-passwords-100k.txt'),
  );
} catch {
  console.log(
    'Install the hash-verified password blocklist into security/ before starting API.',
  );
}
console.log(
  `Created private ${target} configuration. Review SMTP, real addresses, image pins and backup credentials before deployment.`,
);
