import { NextRequest, NextResponse } from 'next/server';
import { locales } from '@stella/shared';
import { analyticsConfig } from '@stella/shared/analytics';
const core: readonly string[] = locales;
// Live locales change only when the owner switches a language in the admin.
// Cache them per instance so a page request does not wait on the API each time;
// 60 s matches the public API's s-maxage. Failures fall back to core quickly
// and are retried sooner.
const LOCALES_TTL_MS = 60_000;
const LOCALES_RETRY_MS = 10_000;
let cachedLocales: { value: readonly string[]; expires: number } | undefined;
let pendingLocales: Promise<readonly string[]> | undefined;
async function fetchLiveLocales(): Promise<readonly string[]> {
  try {
    const r = await fetch(
      new URL('/v1/public/locales', process.env.API_INTERNAL_URL),
      { signal: AbortSignal.timeout(1500) },
    );
    if (r.ok) {
      const data = await r.json();
      if (
        Array.isArray(data) &&
        data.every(
          (x) =>
            typeof x.code === 'string' &&
            /^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/.test(x.code),
        )
      ) {
        const value = [...new Set([...core, ...data.map((x) => x.code)])];
        cachedLocales = { value, expires: Date.now() + LOCALES_TTL_MS };
        return value;
      }
    }
  } catch {
    /* Core locales are a documented safe default. */
  }
  // Keep a previously known list over a transient failure; otherwise core.
  const value = cachedLocales?.value ?? core;
  cachedLocales = { value, expires: Date.now() + LOCALES_RETRY_MS };
  return value;
}
async function liveLocales(): Promise<readonly string[]> {
  if (cachedLocales && cachedLocales.expires > Date.now())
    return cachedLocales.value;
  pendingLocales ??= fetchLiveLocales().finally(() => {
    pendingLocales = undefined;
  });
  return pendingLocales;
}
export async function middleware(request: NextRequest) {
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  );
  const headers = new Headers(request.headers);
  const path = request.nextUrl.pathname;
  const media = process.env.MEDIA_PUBLIC_URL
    ? new URL(process.env.MEDIA_PUBLIC_URL).origin
    : '';
  const apiUrl = process.env.PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const api = apiUrl ? new URL(apiUrl).origin : '';
  const analytics = analyticsConfig(
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '',
    process.env.UMAMI_SCRIPT_URL,
    process.env.UMAMI_WEBSITE_ID,
  );
  const dev = process.env.NODE_ENV !== 'production';
  const csp = `default-src 'self'; script-src 'self' ${analytics?.origin ?? ''} 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${media}; media-src 'self' ${media}; font-src 'self'; connect-src 'self' ${api} ${analytics?.origin ?? ''}${dev ? ' ws:' : ''}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me; object-src 'none'`;
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const live = await liveLocales();
  const segment = path.split('/')[1] ?? '';
  if (path === '/' || !segment) {
    const saved = request.cookies.get('NEXT_LOCALE')?.value;
    const bot = /bot|crawl|spider/i.test(
      request.headers.get('user-agent') ?? '',
    );
    const preferences = (request.headers.get('accept-language') ?? '')
      .split(',')
      .map((v, i) => {
        const [tag, quality] = v.trim().split(';q=');
        return {
          code: tag?.toLowerCase().split('-')[0] ?? '',
          q: quality ? Number(quality) : 1,
          i,
        };
      })
      .sort((a, b) => b.q - a.q || a.i - b.i);
    const locale = bot
      ? 'en'
      : saved && live.includes(saved)
        ? saved
        : (preferences.find((p) => live.includes(p.code) && p.q > 0)?.code ??
          'en');
    const response = NextResponse.redirect(new URL('/' + locale, request.url));
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }
  if (!live.includes(segment))
    return new NextResponse(null, {
      status: 404,
      headers: { 'Content-Security-Policy': csp },
    });
  headers.set('x-stella-locale', segment);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  if (path.endsWith('/preview')) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  return response;
}
export const config = {
  matcher: [
    '/((?!api(?:/|$)|healthz(?:/|$)|readyz(?:/|$)|_next(?:/|$)|fonts(?:/|$)|brand(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|analytics-guard\\.js$).*)',
  ],
};
