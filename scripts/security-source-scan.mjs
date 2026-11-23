import { spawnSync } from 'node:child_process';
import { printScanSummary } from './scan-summary.mjs';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, dirname, basename, extname, relative } from 'node:path';
// Only publishable text sources enter the scanner. No workspace/env mount.
const root = process.cwd(),
  output = resolve('.local', 'source-scan-' + Date.now());
const inventory = spawnSync(
  'git',
  [
    '-c',
    'safe.directory=' + root.replaceAll('\\', '/'),
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ],
  { encoding: 'utf8', windowsHide: true },
);
if (inventory.status !== 0)
  throw new Error('Cannot obtain an ignore-aware source inventory');
await mkdir(output, { recursive: false, mode: 0o700 });
let count = 0;
for (const path of new Set(inventory.stdout.split('\0').filter(Boolean))) {
  const normalized = path.replaceAll('\\', '/'),
    name = basename(path);
  if (
    normalized
      .split('/')
      .some((part) =>
        [
          '.local',
          '.tools',
          '.git',
          '.aws',
          '.codex',
          '.agents',
          'node_modules',
          '.pnpm-store',
          '.next',
          '.turbo',
          'test-results',
          'playwright-report',
          'coverage',
        ].includes(part),
      )
  )
    continue;
  if (name.startsWith('.env') && !name.endsWith('.example')) continue;
  // This is an inclusion list: unlisted extensions are skipped. Include patches
  // so dependency source changes receive the same secret scan as our TS/JS.
  if (
    ![
      '',
      '.md',
      '.json',
      '.yaml',
      '.yml',
      '.toml',
      '.ts',
      '.tsx',
      '.mjs',
      '.js',
      '.css',
      '.sql',
      '.html',
      '.svg',
      '.sh',
      '.ps1',
      '.txt',
      '.webmanifest',
      '.patch',
    ].includes(extname(path))
  )
    continue;
  const source = resolve(root, path),
    destination = resolve(output, path);
  if (
    relative(root, source).startsWith('..') ||
    relative(output, destination).startsWith('..')
  )
    throw new Error('Source escaped inventory');
  const entry = await lstat(source).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!entry?.isFile()) continue;
  const bytes = await readFile(source);
  if (bytes.includes(0)) continue;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    continue;
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
  count++;
}
const scan = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    // The scan copy is owner-only (0600); read it as the same user on Linux/macOS.
    ...(process.getuid
      ? ['--user', process.getuid() + ':' + process.getgid()]
      : []),
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '-v',
    output + ':/src:ro',
    'ghcr.io/gitleaks/gitleaks:v8.24.3@sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055',
    'dir',
    '/src',
    '--redact',
    '--no-banner',
    // Findings stay redacted; verbose adds rule/file/line for the summary.
    '--verbose',
    '--config',
    '/src/.gitleaks.toml',
  ],
  { encoding: 'utf8', windowsHide: true },
);
await writeFile(
  resolve('.local', 'source-scan-latest.log'),
  scan.stdout + scan.stderr,
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    files: count,
    exitCode: scan.status,
    privateEnvironmentFilesSupplied: 0,
    network: 'none',
  }),
);
if (scan.status !== 0) printScanSummary(scan.stdout + scan.stderr);
process.exitCode = scan.status ?? 1;
