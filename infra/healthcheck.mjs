import { readFile } from 'node:fs/promises';
const service = process.argv[2];
try {
  if (service === 'worker') {
    const time = Number(await readFile('/tmp/worker-heartbeat', 'utf8'));
    if (
      !Number.isFinite(time) ||
      Date.now() - time > 30000 ||
      time > Date.now() + 5000
    )
      throw new Error();
  } else {
    const port = { api: 4000, web: 3000, admin: 3001 }[service];
    if (!port) throw new Error();
    const response = await fetch(`http://127.0.0.1:${port}/readyz`, {
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
    });
    if (!response.ok || (await response.json()).status !== 'ok')
      throw new Error();
  }
} catch {
  process.exitCode = 1;
}
