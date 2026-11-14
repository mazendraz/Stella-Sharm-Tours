import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    cli,
    'test',
    '--config',
    'playwright.integration.config.ts',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: { ...process.env, STELLA_INTEGRATION_VERIFY: '1' } },
);
child.on('error', () => process.exit(1));
child.on('close', (code) => process.exit(code ?? 1));
