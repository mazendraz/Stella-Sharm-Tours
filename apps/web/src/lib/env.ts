import 'server-only';
import { parseEnv, webEnvSchema } from '@stella/shared/env';
export const env = parseEnv(webEnvSchema, {
  API_INTERNAL_URL: process.env.API_INTERNAL_URL,
  NEXT_PUBLIC_SITE_URL:
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_API_URL:
    process.env.PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL,
});
export const siteOrigin = new URL(env.NEXT_PUBLIC_SITE_URL).origin;
