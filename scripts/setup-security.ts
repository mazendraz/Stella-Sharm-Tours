import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const url =
  'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/Pwdb_top-100000.txt';
const expected =
  '07f876a616f08fb2cc5c3e0ce04e4a6d1123380580472b0997baebc4e8226977';
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error('Password list download failed');
const bytes = Buffer.from(await response.arrayBuffer());
if (
  createHash('sha256').update(bytes).digest('hex') !== expected ||
  bytes.toString('utf8').split(/\r?\n/).filter(Boolean).length !== 100000
)
  throw new Error(
    'Password list changed: review upstream source and hash before accepting it',
  );
const root = resolve('.local/security');
await mkdir(root, { recursive: true });
await writeFile(resolve(root, 'common-passwords-100k.txt'), bytes, {
  mode: 0o600,
});
console.log('Verified 100,000-entry local password blocklist installed.');
