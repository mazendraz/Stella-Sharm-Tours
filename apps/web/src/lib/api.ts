import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import {
  siteSchema,
  collectionSchema,
  collectionDetailSchema,
  tripSchema,
  faqSchema,
  pageSchema,
} from '@stella/shared/public-contract';
import { env } from './env';
export class ApiError extends Error {
  constructor(public status: number) {
    super('Catalog service unavailable');
  }
}
async function read<T>(
  path: string,
  schema: z.ZodType<T>,
  tags: string[],
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      new URL('/v1/public/' + path, env.API_INTERNAL_URL),
      { next: { revalidate: 60, tags }, signal: AbortSignal.timeout(5000) },
    );
  } catch {
    throw new ApiError(503);
  }
  if (!response.ok) throw new ApiError(response.status);
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new ApiError(502);
  return result.data;
}
export const getSite = cache((locale: string) =>
  read('site?locale=' + encodeURIComponent(locale), siteSchema, [
    'site',
    'locales',
  ]),
);
export const getCollections = cache((locale: string) =>
  read(
    'collections?locale=' + encodeURIComponent(locale),
    z.array(collectionSchema),
    ['collections'],
  ),
);
export const getCollection = cache((slug: string, locale: string) =>
  read(
    'collections/' +
      encodeURIComponent(slug) +
      '?locale=' +
      encodeURIComponent(locale),
    collectionDetailSchema,
    ['collection:' + slug],
  ),
);
export const getTrip = cache((slug: string, locale: string) =>
  read(
    'trips/' +
      encodeURIComponent(slug) +
      '?locale=' +
      encodeURIComponent(locale),
    tripSchema,
    ['trip:' + slug],
  ),
);
export const getFaq = (locale: string) =>
  read('faq?locale=' + encodeURIComponent(locale), faqSchema, ['faq']);
export const getPage = (key: string, locale: string) =>
  read(
    'pages/' +
      encodeURIComponent(key) +
      '?locale=' +
      encodeURIComponent(locale),
    pageSchema,
    ['page:' + key],
  );
