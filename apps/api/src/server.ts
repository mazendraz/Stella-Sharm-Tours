import { serve } from '@hono/node-server';
import pino from 'pino';
import { reportOperationalError } from '@stella/shared/operational-errors';

import { relative, resolve, isAbsolute } from 'node:path';
import { connectDatabase } from '@stella/db';
import { createApp } from './app';
import { loadConfig } from './config';
const cfg = loadConfig();
const contains = (a: string, b: string) => {
  const rel = relative(resolve(a), resolve(b));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
if (
  contains(cfg.MEDIA_ROOT, cfg.ORIGINALS_ROOT) ||
  contains(cfg.ORIGINALS_ROOT, cfg.MEDIA_ROOT)
)
  throw new Error(
    'Public media and private originals must use separate storage trees',
  );
const logger = pino({ level: cfg.LOG_LEVEL }),
  { db, pool } = connectDatabase(cfg.DATABASE_URL),
  app = createApp(db, cfg, () => {
    logger.error({ code: 'unexpected_api_error' }, 'API operation failed');
    void reportOperationalError('api', 'unexpected_api_error');
  });
const server = serve(
  { fetch: app.fetch, port: cfg.PORT, hostname: cfg.HOST },
  () => logger.info({ port: cfg.PORT }, 'API ready'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
