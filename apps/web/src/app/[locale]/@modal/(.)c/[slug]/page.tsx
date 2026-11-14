import { Overlay } from '@/components/overlay';
import { CollectionView } from '@/components/collection-view';
import { collectionData } from '@/lib/route-data';
export default async function CollectionModal({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return (
    <Overlay kind="collection">
      <CollectionView data={await collectionData(slug, locale)} />
    </Overlay>
  );
}
