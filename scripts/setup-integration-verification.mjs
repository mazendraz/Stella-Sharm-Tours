import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('.local/integration-runtime');
const result = spawnSync(
  process.execPath,
  ['infra/configure.mjs', 'production', 'example.test', 'ghcr.io/local', root],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const base = resolve(root, 'production');
const update = async (path, replacements) => {
  let value = await readFile(resolve(base, path), 'utf8');
  for (const [from, to] of replacements) value = value.replaceAll(from, to);
  await writeFile(resolve(base, path), value, { mode: 0o600 });
};
await update('compose.env', [
  ['stella-production', 'stella-integration-verify'],
  ['ghcr.io/local', 'stella-local'],
  ['0000000000000000000000000000000000000000', 'integration'],
  ['172.30.20.', '172.31.20.'],
  [base, base.replaceAll('\\', '/')],
]);
await update('env/api.env', [
  ['https://example.test', 'http://localhost:4983'],
  ['https://admin.example.test', 'http://localhost:4986'],
  ['https://media.example.test', 'http://localhost:4983/media'],
  ['REPLACE_SMTP_HOST', 'mailpit'],
]);
await update('env/web.env', [
  ['https://example.test', 'http://localhost:4983'],
  ['https://api.example.test', 'http://localhost:4984'],
  ['https://media.example.test', 'http://localhost:4983/media'],
]);
await update('env/admin.env', [
  ['https://example.test', 'http://localhost:4983'],
  ['https://api.example.test', 'http://localhost:4984'],
]);
await mkdir(resolve(base, 'setup'), { mode: 0o700 });
console.log(
  'Created isolated local verification configuration: ports 4983–4987, no external mail/translation.',
);
