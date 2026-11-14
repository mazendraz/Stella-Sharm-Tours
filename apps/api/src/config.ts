import { z } from 'zod';
import { apiEnvSchema, parseEnv } from '@stella/shared/env';
import { isIP } from 'node:net';
const url = z.string().refine((v) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
});
export const configSchema = apiEnvSchema
  .extend({
    DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
    SESSION_SECRET: z.string().min(32),
    VAPID_PUBLIC_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{87}$/)
      .optional(),
    TOTP_ENC_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32),
    IP_HASH_SALT: z.string().min(32),
    MEDIA_ROOT: z.string().min(1),
    ORIGINALS_ROOT: z.string().min(1),
    MEDIA_PUBLIC_URL: url,
    WEB_REVALIDATE_URL: url,
    WEB_REVALIDATE_SECRET: z.string().min(32),
    WEB_ORIGIN: url,
    ADMIN_ORIGIN: url,
    TRUSTED_PROXY_IPS: z
      .string()
      .refine((value) =>
        value.split(',').every((ip) => !ip.trim() || isIP(ip.trim()) !== 0),
      )
      .default(''),
    PUBLIC_READS_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(600),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.email(),
    STAFF_NOTIFY_EMAIL: z.email(),
    SEED_OWNER_EMAIL: z.email(),
    BREACHED_PASSWORDS_FILE: z.string().min(1),
    FFMPEG_PATH: z.string().default('ffmpeg'),
    FFPROBE_PATH: z.string().default('ffprobe'),
    OWNER_REPORT_LOCALE: z
      .enum(['en', 'it', 'es', 'fr', 'de', 'ru', 'tr'])
      .default('en'),
    // Owner request (2026-11-14): on a developer's own machine the admin login
    // is email + password only. Refused outside NODE_ENV=development, so
    // staging and production keep mandatory 2FA (docs/04-security-plan.md).
    DEV_SIMPLE_ADMIN_LOGIN: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((config, ctx) => {
    if (
      config.DEV_SIMPLE_ADMIN_LOGIN === 'true' &&
      config.NODE_ENV !== 'development'
    )
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_SIMPLE_ADMIN_LOGIN'],
        message: 'Only allowed in development',
      });
    for (const key of ['WEB_ORIGIN', 'ADMIN_ORIGIN'] as const) {
      let value: URL;
      try {
        value = new URL(config[key]);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Origin required',
        });
        continue;
      }
      if (
        value.username ||
        value.password ||
        value.search ||
        value.hash ||
        value.pathname !== '/'
      )
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Origin required',
        });
      if (
        config.NODE_ENV === 'production' &&
        value.protocol !== 'https:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)
      )
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'HTTPS required',
        });
    }
  });
export type Config = z.infer<typeof configSchema>;
export const loadConfig = () => parseEnv(configSchema, process.env);
