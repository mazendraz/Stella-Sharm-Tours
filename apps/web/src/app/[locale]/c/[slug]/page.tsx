import { getTranslations } from 'next-intl/server';
import { CollectionView } from '@/components/collection-view';
import { collectionData } from '@/lib/route-data';
import { metadataFor, JsonLd } from '@/lib/seo';
import { siteOrigin } from '@/lib/env';
import { breadcrumbs, graph, tripList, webPage } from '@/lib/structured-data';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [{ collection: c }, t] = await Promise.all([
    collectionData(slug, locale),
    getTranslations({ locale }),
  ]);
  return metadataFor(
    locale,
    '/c/' + slug,
    t('seoCollectionTitle', { name: c.name.text }),
    c.subline?.text ?? c.headline.text,
    c.cover?.url,
  );
}
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const data = await collectionData(slug, locale);
  const home = siteOrigin + '/' + locale,
    url = home + '/c/' + slug,
    name = data.collection.name.text;
  return (
    <main id="main">
      <CollectionView data={data} />
      <JsonLd
        value={graph([
          webPage('CollectionPage', url, siteOrigin, locale, name, {
            description: data.collection.subline?.text,
            breadcrumb: { '@id': url + '#breadcrumb' },
            mainEntity: tripList(data.trips, locale, siteOrigin),
          }),
          breadcrumbs(url, [
            { name: 'Stella Sharm Tours', url: home },
            { name, url },
          ]),
        ])}
      />
    </main>
  );
}
