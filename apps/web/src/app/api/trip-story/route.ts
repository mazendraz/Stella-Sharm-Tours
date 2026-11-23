import { getStory, ApiError } from '@/lib/api';
import { limitCaller } from '@/lib/client-limit';

export async function GET(request: Request) {
  const limited = limitCaller(request);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const slug = params.get('slug') ?? '',
    locale = params.get('locale') ?? '';
  if (
    !/^[a-z0-9-]{1,120}$/.test(slug) ||
    !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/.test(locale)
  )
    return new Response(null, { status: 400 });
  try {
    return Response.json(await getStory(slug, locale, 'proxy-reader'));
  } catch (error) {
    return new Response(null, {
      status: error instanceof ApiError ? error.status : 503,
    });
  }
}
