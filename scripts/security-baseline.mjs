import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Deliberately scoped to our disposable local integration gateway, never a live site.
const admin = process.argv.includes('--admin');
if (process.argv.slice(2).some((argument) => argument !== '--admin'))
  throw new Error('Only the local --admin scope is supported');
const target = admin ? 'http://admin:3001/' : 'http://caddy:8080/en';
const output = resolve(
  admin ? '.local/security-zap-admin' : '.local/security-zap',
);
await mkdir(output, { recursive: true });
const response = await fetch(
  admin ? 'http://localhost:4986/' : 'http://localhost:4983/en',
  {
    signal: AbortSignal.timeout(10000),
  },
);
if (!response.ok)
  throw new Error('Start the local integration verification stack first');
const log = [];
const code = await new Promise((done, reject) => {
  const child = spawn(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'stella-integration-verify_edge',
      '--memory',
      '2g',
      '--cpus',
      '2',
      '-v',
      `${output}:/zap/wrk:rw`,
      'ghcr.io/zaproxy/zaproxy:stable@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af',
      'zap-baseline.py',
      '-t',
      target,
      '-m',
      '1',
      '-T',
      '5',
      '-J',
      'zap.json',
      '-r',
      'zap.html',
      '-z',
      '-config spider.processForm=false -config spider.postForm=false -config spider.maxDepth=3 -config spider.maxChildren=12 -config spider.thread=2',
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (chunk) => log.push(chunk));
  child.stderr.on('data', (chunk) => log.push(chunk));
  child.on('error', reject);
  child.on('exit', done);
});
await writeFile(resolve(output, 'scan.log'), Buffer.concat(log));
if (![0, 1, 2].includes(code))
  throw new Error('ZAP did not complete; inspect the private local scan log');
const report = JSON.parse(await readFile(resolve(output, 'zap.json'), 'utf8'));
const alerts = (report.site ?? []).flatMap((site) => site.alerts ?? []);
const summary = alerts.map((alert) => ({
  id: alert.pluginid,
  name: alert.name,
  risk: alert.riskdesc,
  instances: alert.instances?.length ?? 0,
}));
await writeFile(
  resolve(output, 'summary.json'),
  JSON.stringify({ target, exitCode: code, alerts: summary }, null, 2),
);
console.log(JSON.stringify({ exitCode: code, alerts: summary }, null, 2));
// Never turn warnings or accepted policy exceptions into an implicit clean scan.
process.exitCode = code;
