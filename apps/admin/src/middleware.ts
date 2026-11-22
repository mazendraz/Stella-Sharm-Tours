import { NextRequest, NextResponse } from 'next/server';
import { runtimeEnv } from './lib/runtime-env';
export function middleware(request: NextRequest) {
  const nonce = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
    ),
    headers = new Headers(request.headers);
  const api = new URL(
    runtimeEnv(
      'PUBLIC_API_URL',
      runtimeEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000'),
    ),
  ).origin;
  const dev = process.env.NODE_ENV !== 'production';
  // Dev only: the API accepts sign-in from ADMIN_URL's origin (localhost), and
  // its SameSite=Strict cookies don't reach 127.0.0.1. `next dev` prints the
  // 127.0.0.1 address, so send that to the configured one instead of letting
  // sign-in fail.
  // Named directly: middleware only sees statically referenced env vars.
  const admin = dev
    ? (process.env.NEXT_PUBLIC_ADMIN_URL ?? process.env.ADMIN_URL ?? '')
    : '';
  if (admin) {
    const want = new URL(admin),
      host = (request.headers.get('host') ?? '').toLowerCase();
    if (
      /^(127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) &&
      want.hostname === 'localhost' &&
      host.endsWith(':' + want.port)
    ) {
      const url = new URL(
        request.nextUrl.pathname + request.nextUrl.search,
        want,
      );
      return NextResponse.redirect(url, 307);
    }
  }
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' ${api} blob: data:; media-src 'self' ${api} blob:; connect-src 'self' ${api}${dev ? ' ws:' : ''}; font-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|healthz|readyz|sw.js|manifest.webmanifest|icon.svg).*)',
  ],
};
