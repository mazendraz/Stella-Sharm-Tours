import 'server-only';
import { isIP } from 'node:net';
import { rateLimitAddress } from '@stella/shared/ip';
import { createWindowLimiter } from '@stella/shared/window-limiter';

// Per-caller limit for the public /api/* proxy routes. Caddy overwrites
// X-Forwarded-For with the connecting address (infra/Caddyfile), and the web
// container is reachable only through Caddy in staging and production.
const PER_MINUTE = 60;
const limiter = createWindowLimiter();

export function callerAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const last = forwarded.split(',').pop()?.trim() ?? '';
  return isIP(last) ? rateLimitAddress(last) : 'unknown';
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export function limitCaller(request: Request): Response | null {
  const { allowed, retryAfter } = limiter.hit(
    callerAddress(request),
    PER_MINUTE,
  );
  return allowed
    ? null
    : Response.json(
        { error: { code: 'RATE_LIMITED' } },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'Cache-Control': 'no-store',
          },
        },
      );
}
