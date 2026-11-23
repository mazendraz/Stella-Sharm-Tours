import 'server-only';
import { publicStorySchema } from '@stella/shared/story';
import { cache } from 'react';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import {
  siteSchema,
  collectionSchema,
  collectionDetailSchema,
  tripSchema,
  faqSchema,
  pageSchema,
  savedTripsSchema,
} from '@stella/shared/public-contract';
import { env } from './env';
export class ApiError extends Error {
  constructor(public status: number) {
    super('Catalog service unavailable');
  }
}
/**
 * Which API quota a read uses. Page rendering uses 'catalog-reader'. The public
 * /api/* proxy routes use 'proxy-reader', so callers of those routes cannot use
 * up the quota that page rendering depends on.
 */
export type Reader = 'catalog-reader' | 'proxy-reader';
async function read<T>(
  path: string,
  schema: z.ZodType<T>,
  tags: string[],
  reader: Reader = 'catalog-reader',
): Promise<T> {
  let response: Response;
  try {
    const secret = process.env.WEB_REVALIDATE_SECRET;
    response = await fetch(
      new URL('/v1/public/' + path, env.API_INTERNAL_URL),
      {
        next: { revalidate: 60, tags: ['catalog', ...tags] },
        signal: AbortSignal.timeout(5000),
        ...(secret
          ? {
              headers: {
                'X-Stella-Catalog-Reader': createHmac('sha256', secret)
                  .update(`stella:public-${reader}:v1`)
                  .digest('hex'),
              },
            }
          : {}),
      },
    );
  } catch {
    throw new ApiError(503);
  }
  if (!response.ok) throw new ApiError(response.status);
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new ApiError(502);
  return result.data;
}
export const getSavedTrips = (
  slugs: string[],
  locale: string,
  reader: Reader = 'catalog-reader',
) =>
  read(
    'saved-trips?' + new URLSearchParams({ slugs: slugs.join(','), locale }),
    savedTripsSchema,
    ['locales', ...slugs.map((slug) => 'trip:' + slug)],
    reader,
  );
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
export const getStory = (
  slug: string,
  locale: string,
  reader: Reader = 'catalog-reader',
) =>
  read(
    'trips/' +
      encodeURIComponent(slug) +
      '/story?' +
      new URLSearchParams({ locale }),
    publicStorySchema,
    ['trip:' + slug, 'locales'],
    reader,
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
