import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { notFound } from 'next/navigation';
import {
  tripSchema,
  collectionDetailSchema,
} from '@stella/shared/public-contract';
import { env } from './env';
const result = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('trip'), locale: z.string(), data: tripSchema }),
  z.object({
    kind: z.literal('collection'),
    locale: z.string(),
    data: collectionDetailSchema,
  }),
]);
export const previewData = cache(async (locale: string, token: unknown) => {
  if (
    typeof token !== 'string' ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
    token.length > 2000
  )
    notFound();
  try {
    const url = new URL('/v1/public/preview', env.API_INTERNAL_URL);
    url.searchParams.set('token', token);
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) notFound();
    const data = result.safeParse(await response.json());
    if (!data.success || data.data.locale !== locale) notFound();
    return data.data;
  } catch {
    notFound();
  }
});
