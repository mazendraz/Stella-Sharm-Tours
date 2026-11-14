import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Export objects, never the checkout's .git/config, credentials or current envs.
const root = process.cwd();
const local = resolve(root, '.local');
const git = (args) =>
  spawnSync(
    'git',
    ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), ...args],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    },
  );
if (git(['rev-parse', '--verify', 'HEAD']).status !== 0)
  throw new Error(
    'Committed Git history is required; an empty checkout is not a passing history scan',
  );
const shallow = git(['rev-parse', '--is-shallow-repository']);
if (shallow.status !== 0 || shallow.stdout.trim() !== 'false')
  throw new Error('Complete Git history required: use checkout fetch-depth 0');

await mkdir(local, { recursive: true, mode: 0o700 });
const output = await mkdtemp(resolve(local, 'history-scan-'));
const bundle = resolve(output, 'history.bundle');
const history = resolve(output, 'history.git');
if (git(['bundle', 'create', bundle, '--all']).status !== 0)
  throw new Error('Could not export Git history');
await chmod(bundle, 0o600);
if (
  git(['clone', '--mirror', '--template=', '--', bundle, history]).status !== 0
)
  throw new Error('Could not prepare isolated Git history');
// Remove configuration only; `remote remove` can also delete exported refs.
if (
  git(['--git-dir=' + history, 'config', '--remove-section', 'remote.origin'])
    .status !== 0
)
  throw new Error('Could not remove the local export remote');
await copyFile(
  fileURLToPath(new URL('../.gitleaks-history.toml', import.meta.url)),
  resolve(output, 'gitleaks.toml'),
);
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
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '-e',
    'GIT_CONFIG_COUNT=1',
    '-e',
    'GIT_CONFIG_KEY_0=safe.directory',
    '-e',
    'GIT_CONFIG_VALUE_0=/scan/history.git',
    '-v',
    output + ':/scan:ro',
    'ghcr.io/gitleaks/gitleaks:v8.24.3@sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055',
    'git',
    '/scan/history.git',
    '--redact',
    '--no-banner',
    '--log-opts=--all',
    '--config',
    '/scan/gitleaks.toml',
  ],
  { encoding: 'utf8', windowsHide: true },
);
await writeFile(
  resolve(local, 'security-history-latest.log'),
  scan.stdout + scan.stderr,
  { mode: 0o600 },
);
const result = {
  exitCode: scan.status ?? 1,
  originalGitConfigSupplied: false,
  privateWorkingFilesSupplied: false,
  ignoredCommittedPathsExcluded: false,
  fullHistory: true,
  network: 'none',
};
await writeFile(
  resolve(local, 'security-history-result.json'),
  JSON.stringify(result, null, 2) + '\n',
  { mode: 0o600 },
);
console.log(JSON.stringify(result));
process.exitCode = result.exitCode;
