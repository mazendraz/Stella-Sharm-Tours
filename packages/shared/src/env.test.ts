import { describe, expect, it } from 'vitest';
import { apiEnvSchema, parseEnv, webEnvSchema } from './env';
describe('environment validation', () => {
  it('rejects missing web origins', () => {
    expect(() => parseEnv(webEnvSchema, {})).toThrow('API_INTERNAL_URL');
  });
  it.each([0, 65536, 'not-a-port'])('rejects invalid port %s', (PORT) => {
    expect(() => parseEnv(apiEnvSchema, { PORT })).toThrow('PORT');
  });
  it('does not expose input values in diagnostics', () => {
    expect(() => parseEnv(apiEnvSchema, { LOG_LEVEL: 'secret-value' })).toThrow(
      'Invalid environment variables: LOG_LEVEL',
    );
  });
  it('rejects non-http origins', () => {
    expect(() =>
      parseEnv(webEnvSchema, {
        API_INTERNAL_URL: 'file:///private',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      }),
    ).toThrow('API_INTERNAL_URL');
  });
});
