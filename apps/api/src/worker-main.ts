import { createTransport } from 'nodemailer';
import pino from 'pino';
import { z } from 'zod';
import { writeFile } from 'node:fs/promises';
import { connectDatabase } from '@stella/db';
import { parseEnv } from '@stella/shared/env';
import { configSchema } from './config';
import { startWorker } from './jobs';
import { reportOperationalError } from '@stella/shared/operational-errors';
import { summarizeError } from '@stella/shared/error-summary';
const cfg = parseEnv(
  configSchema.safeExtend({
    VAPID_PRIVATE_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    VAPID_SUBJECT: z
      .string()
      .refine(
        (value) =>
          /^mailto:[^\s@]+@[^\s@]+$/.test(value) ||
          value.startsWith('https://'),
      )
      .optional(),
    TRANSLATE_PROVIDER: z.enum(['deepl', 'google', 'libre', 'fake']).optional(),
    DEEPL_API_KEY: z.string().optional(),
    GOOGLE_TRANSLATE_KEY: z.string().optional(),
    GOOGLE_FREE_TIER_CONFIRMED: z.enum(['true', 'false']).optional(),
    LIBRETRANSLATE_URL: z.url().optional(),
  }),
  process.env,
);
if (
  [cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY, cfg.VAPID_SUBJECT].some(
    Boolean,
  ) &&
  ![cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY, cfg.VAPID_SUBJECT].every(
    Boolean,
  )
)
  throw new Error('Configure all three VAPID settings together');
const logger = pino({ level: cfg.LOG_LEVEL }),
  { db, pool } = connectDatabase(cfg.DATABASE_URL);
const mailer = createTransport({
  host: cfg.SMTP_HOST,
  port: cfg.SMTP_PORT,
  secure: cfg.SMTP_SECURE === 'true',
  requireTLS: cfg.NODE_ENV === 'production' && cfg.SMTP_SECURE !== 'true',
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  ...(cfg.SMTP_USER && cfg.SMTP_PASSWORD
    ? { auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASSWORD } }
    : {}),
});
const worker = await startWorker(
  db,
  pool,
  cfg,
  mailer,
  (task, error) => {
    logger.error(
      {
        task,
        ...(error === undefined ? {} : { error: summarizeError(error) }),
      },
      'Worker task failed',
    );
    void reportOperationalError('worker', 'worker_task_failed');
  },
  async () => {
    if (process.env.WORKER_HEARTBEAT_FILE)
      await writeFile(process.env.WORKER_HEARTBEAT_FILE, String(Date.now()), {
        mode: 0o600,
      });
  },
);
logger.info('Worker ready');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void worker
      .stop()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
