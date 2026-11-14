import { reportOperationalError } from '@stella/shared/operational-errors';
import { siteOrigin } from '@/lib/env';
import { readBoundedText, BodyReadError } from '@stella/shared/bounded-body';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== siteOrigin)
    return new Response(null, { status: 403 });
  if (
    request.headers.get('content-type') !== 'application/json' ||
    Number(request.headers.get('content-length') ?? 0) > 64
  )
    return new Response(null, { status: 400 });
  // Do not deserialize arbitrary client error details or log the request.
  let body = '';
  try {
    body = await readBoundedText(request, 64);
  } catch (error) {
    return new Response(null, {
      status: error instanceof BodyReadError ? error.status : 400,
    });
  }
  if (body !== '{"code":"web_client_error"}')
    return new Response(null, { status: 400 });
  await reportOperationalError('web', 'web_client_error');
  return new Response(null, { status: 204 });
}
