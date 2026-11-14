import { apiReady } from '@stella/shared/readiness';
export const dynamic = 'force-dynamic';
export async function GET() {
  const configured =
    process.env.NODE_ENV !== 'production' ||
    [process.env.PUBLIC_API_URL, process.env.SITE_URL].every((value) => {
      try {
        const url = new URL(value ?? '');
        return (
          !url.username &&
          !url.password &&
          url.pathname === '/' &&
          !url.search &&
          !url.hash &&
          (url.protocol === 'https:' ||
            (url.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
        );
      } catch {
        return false;
      }
    });
  const ready = configured && (await apiReady(process.env.API_INTERNAL_URL));
  return Response.json(
    { status: ready ? 'ok' : 'unavailable', service: 'admin', ui: 'dashboard' },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
