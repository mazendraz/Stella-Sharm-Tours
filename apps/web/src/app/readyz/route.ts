import { apiReady } from '@stella/shared/readiness';
export const dynamic = 'force-dynamic';
export async function GET() {
  const ready = await apiReady(process.env.API_INTERNAL_URL);
  return Response.json(
    { status: ready ? 'ok' : 'unavailable', service: 'web' },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
