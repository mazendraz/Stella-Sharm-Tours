import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { readBoundedText, BodyReadError } from '@stella/shared/bounded-body';
const schema = z
  .object({
    tags: z
      .array(
        z
          .string()
          .regex(
            /^(site|collections|faq|locales|collection:[a-z0-9-]{1,120}|trip:[a-z0-9-]{1,120}|page:[a-z-]{1,40}|ui:[a-z-]{2,16})$/,
          ),
      )
      .min(1)
      .max(50),
  })
  .strict();
export async function POST(request: NextRequest) {
  const secret = process.env.WEB_REVALIDATE_SECRET,
    provided = request.headers.get('x-revalidate-secret') ?? '';
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(provided) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  )
    return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > 8192)
    return new Response(null, { status: 413 });
  try {
    const input = await readBoundedText(request, 8192);
    const parsed = schema.safeParse(JSON.parse(input));
    if (!parsed.success)
      return Response.json(
        { error: { code: 'INVALID_INPUT' } },
        { status: 400 },
      );
    parsed.data.tags.forEach((tag) => revalidateTag(tag));
    return Response.json({ revalidated: true });
  } catch (error) {
    if (error instanceof BodyReadError)
      return Response.json(
        { error: { code: error.message } },
        { status: error.status },
      );
    return Response.json({ error: { code: 'INVALID_INPUT' } }, { status: 400 });
  }
}
