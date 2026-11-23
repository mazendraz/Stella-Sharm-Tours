import { NextRequest } from 'next/server';
import { ApiError, getSavedTrips } from '@/lib/api';
import { savedTripLimit } from '@stella/shared/public-contract';
import { limitCaller } from '@/lib/client-limit';
export async function GET(request: NextRequest) {
  const limited = limitCaller(request);
  if (limited) return limited;
  const keys = [...request.nextUrl.searchParams.keys()];
  const locale = request.nextUrl.searchParams.get('locale') ?? 'en',
    slugs = request.nextUrl.searchParams.get('slugs')?.split(',') ?? [];
  if (
    keys.some((k) => !['locale', 'slugs'].includes(k)) ||
    new Set(keys).size !== keys.length ||
    slugs.length < 1 ||
    slugs.length > savedTripLimit ||
    slugs.some((s) => !/^[a-z0-9-]{1,120}$/.test(s)) ||
    !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/.test(locale)
  )
    return Response.json({ error: { code: 'INVALID_INPUT' } }, { status: 400 });
  try {
    const trips = await getSavedTrips(
      [...new Set(slugs)],
      locale,
      'proxy-reader',
    );
    return Response.json(trips, { headers: { 'Cache-Control': 'no-store' } });
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
