import { NextRequest } from 'next/server';
import { ApiError, getSearchIndex } from '@/lib/api';
import { limitCaller } from '@/lib/client-limit';
export async function GET(request: NextRequest) {
  const limited = limitCaller(request);
  if (limited) return limited;
  const params = request.nextUrl.searchParams,
    keys = [...params.keys()],
    locale = params.get('locale') ?? 'en';
  if (
    keys.some((k) => k !== 'locale') ||
    new Set(keys).size !== keys.length ||
    !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/.test(locale)
  )
    return Response.json({ error: { code: 'INVALID_INPUT' } }, { status: 400 });
  try {
    return Response.json(await getSearchIndex(locale, 'proxy-reader'), {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      return Response.json(
        { error: { code: 'INVALID_LOCALE' } },
        { status: 400 },
      );
    if (error instanceof ApiError && error.status === 429)
      return Response.json(
        { error: { code: 'RATE_LIMITED' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    return Response.json(
      { error: { code: 'CATALOG_UNAVAILABLE' } },
      { status: 503 },
    );
  }
}
