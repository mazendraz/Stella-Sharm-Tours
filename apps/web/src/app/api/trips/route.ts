import { NextRequest } from 'next/server';
import { getTrip, getSite } from '@/lib/api';
export async function GET(request: NextRequest) {
  const keys = [...request.nextUrl.searchParams.keys()];
  const locale = request.nextUrl.searchParams.get('locale') ?? 'en',
    slugs = request.nextUrl.searchParams.get('slugs')?.split(',') ?? [];
  if (
    keys.some((k) => !['locale', 'slugs'].includes(k)) ||
    slugs.length < 1 ||
    slugs.length > 38 ||
    slugs.some((s) => !/^[a-z0-9-]{1,120}$/.test(s)) ||
    !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/.test(locale)
  )
    return Response.json({ error: { code: 'INVALID_INPUT' } }, { status: 400 });
  try {
    const site = await getSite(locale);
    if (!site.locales.some((l) => l.code === locale))
      return Response.json(
        { error: { code: 'INVALID_LOCALE' } },
        { status: 400 },
      );
    const trips = await Promise.all(slugs.map((s) => getTrip(s, locale)));
    return Response.json(trips, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { error: { code: 'CATALOG_UNAVAILABLE' } },
      { status: 503 },
    );
  }
}
