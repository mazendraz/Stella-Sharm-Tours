import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Real Git and digest-pinned offline Gitleaks, synthetic local histories only.
const directory = resolve('.local/scaffold');
await mkdir(directory, { recursive: true, mode: 0o700 });
const suite = await mkdtemp(resolve(directory, 'history-test-'));
const repo = resolve(suite, 'repo');
const hooks = resolve(suite, 'no-hooks');
await mkdir(repo);
await mkdir(hooks);
const git = (args, cwd = repo) => {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=Scaffold QA',
      '-c',
      'user.email=qa@example.test',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=' + hooks,
      ...args,
    ],
    {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    },
  );
  if (result.status !== 0) throw new Error('Synthetic Git fixture failed');
  return result;
};
const script = fileURLToPath(
  new URL('./security-history-scan.mjs', import.meta.url),
);
const scan = (cwd) =>
  spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
git(['init', '--template=', '-b', 'main']);
if (scan(repo).status === 0) throw new Error('Empty history was accepted');
await writeFile(resolve(repo, '.gitignore'), '.local/\n');
await writeFile(resolve(repo, 'README.md'), '# Synthetic clean history\n');
git(['add', '.gitignore', 'README.md']);
git(['commit', '-m', 'Synthetic clean snapshot']);
const credential = randomBytes(24).toString('base64url');
await writeFile(
  resolve(repo, '.env'),
  'GITHUB_TOKEN=ghp_' + randomBytes(18).toString('hex') + '\n',
  { mode: 0o600 },
);
git([
  'config',
  'http.https://example.test/.extraheader',
  'AUTHORIZATION: bearer ' + credential,
]);
if (scan(repo).status !== 0) throw new Error('Clean committed history failed');
const local = resolve(repo, '.local');
for (const name of (await readdir(local)).filter((name) =>
  name.startsWith('history-scan-'),
)) {
  const config = await readFile(
    resolve(local, name, 'history.git/config'),
    'utf8',
  );
  if (/extraheader|authorization/i.test(config) || config.includes(credential))
    throw new Error('Checkout credential configuration reached the export');
}
await mkdir(resolve(repo, '.local'), { recursive: true });
// Deliberately fake, never a real service token. Commit it under an ignored path
// and remove it, proving the scanner inspects history and doesn't exempt .local.
git(['checkout', '-b', 'audit-fixture']);
const token = 'ghp_' + randomBytes(18).toString('hex');
await writeFile(
  resolve(repo, '.local/forced.env'),
  'GITHUB_TOKEN=' + token + '\n',
  { mode: 0o600 },
);
git(['add', '--force', '.local/forced.env']);
git(['commit', '-m', 'Synthetic historical finding']);
git(['rm', '--', '.local/forced.env']);
git(['commit', '-m', 'Remove synthetic finding from current files']);
git(['update-ref', 'refs/remotes/fixture/deleted-branch', 'HEAD']);
git(['checkout', 'main']);
git(['branch', '-D', 'audit-fixture']);
if (scan(repo).status !== 1)
  throw new Error('Removed historical credential was not detected');
const finding = await readFile(
  resolve(local, 'security-history-latest.log'),
  'utf8',
);
if (
  /\bFTL\b/.test(finding) ||
  !/leaks found:\s*[1-9]/.test(stripVTControlCharacters(finding))
)
  throw new Error(
    'Expected historical token finding, not an unrelated scanner failure',
  );
if (finding.includes(token) || finding.includes(credential))
  throw new Error('Private scan log was not redacted');
const result = JSON.parse(
  await readFile(resolve(local, 'security-history-result.json'), 'utf8'),
);
if (
  result.originalGitConfigSupplied ||
  result.privateWorkingFilesSupplied ||
  result.ignoredCommittedPathsExcluded ||
  result.network !== 'none'
)
  throw new Error('Unexpected history scan boundary');
const shallow = resolve(suite, 'shallow');
git(['branch', 'shallow-source', 'refs/remotes/fixture/deleted-branch']);
git(
  [
    'clone',
    '--template=',
    '--branch=shallow-source',
    '--depth=1',
    pathToFileURL(repo).href,
    shallow,
  ],
  suite,
);
if (scan(shallow).status === 0) throw new Error('Shallow history was accepted');
console.log(
  '4 checks passed: empty/shallow histories refused; clean history accepted without working env or checkout credentials; deleted fake secret in ignored path on a remote-only ref detected; logs redacted. No real secret or token printed.',
);
