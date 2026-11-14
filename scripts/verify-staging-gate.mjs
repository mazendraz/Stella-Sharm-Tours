import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const docker = (args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
// Public synthetic QA credential only. Never used by production/staging config generation.
const password = 'local-staging-gate-test-only';
const hash = docker([
  'run',
  '--rm',
  'caddy:2-alpine',
  'caddy',
  'hash-password',
  '--plaintext',
  password,
]);
const id = docker([
  'run',
  '--rm',
  '-d',
  '--network',
  'stella-integration-verify_edge',
  '--read-only',
  '--user',
  '1000:1000',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--tmpfs',
  '/tmp:mode=1777',
  '--tmpfs',
  '/config:mode=1777',
  '--tmpfs',
  '/data:mode=1777',
  '-p',
  '127.0.0.1:4992:8080',
  '-v',
  resolve('infra/Caddyfile.staging') + ':/etc/caddy/Caddyfile:ro',
  '-v',
  resolve('infra/caddy') + ':/etc/caddy/stella:ro',
  '-e',
  'WEB_HOST=localhost',
  '-e',
  'ADMIN_HOST=staging-admin.example.test',
  '-e',
  'API_HOST=staging-api.example.test',
  '-e',
  'MEDIA_HOST=staging-media.example.test',
  '-e',
  'STAGING_USER=qa',
  '-e',
  'STAGING_PASSWORD_HASH=' + hash,
  'caddy:2-alpine',
]);
if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Unexpected test container ID');
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch('http://localhost:4992/en');
      if (response.status === 401) {
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error('Staging auth gate did not start');
  const headers = {
    Authorization: 'Basic ' + Buffer.from('qa:' + password).toString('base64'),
  };
  const denied = await fetch('http://localhost:4992/en');
  if (
    denied.status !== 401 ||
    !denied.headers.get('www-authenticate')?.includes('Basic')
  )
    throw new Error('Unauthenticated staging request was not challenged');
  const allowed = await fetch('http://localhost:4992/en', { headers });
  if (!allowed.ok || !allowed.headers.get('x-robots-tag')?.includes('noindex'))
    throw new Error('Authenticated staging response missing noindex/content');
  const privateRoute = await fetch('http://localhost:4992/api/revalidate', {
    method: 'POST',
    headers,
  });
  if (privateRoute.status !== 404)
    throw new Error('Staging exposed internal revalidation route');
  console.log(
    'PASS: actual staging Caddy basic-auth, noindex and internal-route isolation.',
  );
} finally {
  docker(['stop', id]);
}
