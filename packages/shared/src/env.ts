import { z } from 'zod';

const httpUrl = z
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Must use HTTP or HTTPS',
  );
const runtime = z
  .enum(['development', 'test', 'production'])
  .default('development');
export const apiEnvSchema = z.object({
  NODE_ENV: runtime,
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});
export const webEnvSchema = z.object({
  API_INTERNAL_URL: httpUrl,
  NEXT_PUBLIC_SITE_URL: httpUrl,
  NEXT_PUBLIC_API_URL: httpUrl,
});
export const adminEnvSchema = z.object({
  NEXT_PUBLIC_ADMIN_URL: httpUrl,
  NEXT_PUBLIC_API_URL: httpUrl,
});

// Report keys only: schema issues may contain secrets in their input or message.
export function parseEnv<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const keys = [
      ...new Set(
        result.error.issues.map(
          (issue) => issue.path.join('.') || 'environment',
        ),
      ),
    ];
    throw new Error('Invalid environment variables: ' + keys.join(', '));
  }
  return result.data;
}
