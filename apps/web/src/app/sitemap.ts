import type { MetadataRoute } from 'next';
import { getSite, getCollections, getCollection } from '@/lib/api';
import { siteOrigin } from '@/lib/env';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const site = await getSite('en'),
      collections = await getCollections('en');
    const details = await Promise.all(
      collections.map((c) => getCollection(c.slug, 'en')),
    );
    const paths = [
      '',
      '/contact',
      '/faq',
      '/legal/terms',
      '/legal/privacy',
      '/legal/cancellation',
      ...collections.map((c) => '/c/' + c.slug),
      ...[...new Set(details.flatMap((d) => d.trips.map((t) => t.slug)))].map(
        (s) => '/t/' + s,
      ),
    ];
    const locales = site.locales.filter((l) => l.indexable);
    return paths.flatMap((path) =>
      locales.map((l) => ({
        url: siteOrigin + '/' + l.code + path,
        alternates: {
          languages: {
            ...Object.fromEntries(
              locales.map((lang) => [
                lang.code,
                siteOrigin + '/' + lang.code + path,
              ]),
            ),
            'x-default': siteOrigin + '/en' + path,
          },
        },
      })),
    );
  } catch {
    return [];
  }
}
