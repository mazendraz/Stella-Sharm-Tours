import { CollectionView } from '@/components/collection-view';
import { collectionData } from '@/lib/route-data';
import { metadataFor, JsonLd } from '@/lib/seo';
import { siteOrigin } from '@/lib/env';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const { collection: c } = await collectionData(slug, locale);
  return metadataFor(
    locale,
    '/c/' + slug,
    c.name.text,
    c.subline?.text,
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
  return (
    <main id="main">
      <CollectionView data={data} />
      <JsonLd
        value={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Stella Sharm Tours',
              item: siteOrigin + '/' + locale,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: data.collection.name.text,
              item: siteOrigin + '/' + locale + '/c/' + slug,
            },
          ],
        }}
      />
    </main>
  );
}
