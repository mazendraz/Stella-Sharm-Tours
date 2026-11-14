// Explicit fallback for integration QA when Docker is unavailable. Never uses
// an existing service/database: credentials belong to our ignored workspace cluster.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { connectDatabase } from '../packages/db/src/index';
const cfg = JSON.parse(
  await readFile(
    new URL('../.local/postgres16/connection.json', import.meta.url),
    'utf8',
  ),
) as { user: string; password: string; port: number };
if (
  cfg.user !== 'stella_qa' ||
  cfg.port !== 55432 ||
  typeof cfg.password !== 'string'
)
  throw new Error('Use the isolated workspace QA cluster');
const base = new URL('postgresql://127.0.0.1:55432/postgres');
base.username = cfg.user;
base.password = cfg.password;
const { pool } = connectDatabase(base.href),
  name = 'stella_' + randomBytes(8).toString('hex') + '_test';
if (!/^stella_[a-f0-9]{16}_test$/.test(name))
  throw new Error('Invalid isolated test database');
let created = false;
try {
  await pool.query('create database "' + name + '"');
  created = true;
  const url = new URL(base);
  url.pathname = '/' + name;
  const child = spawn(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'vitest.integration.config.ts',
    ],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, TEST_DATABASE_URL: url.href },
    },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  if (created) {
    await pool.query('drop database "' + name + '" with (force)');
  }
  await pool.end();
}
