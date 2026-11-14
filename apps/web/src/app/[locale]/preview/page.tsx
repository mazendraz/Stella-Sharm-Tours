import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TripView } from '@/components/trip-view';
import { CollectionView } from '@/components/collection-view';
import { previewData } from '@/lib/preview';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  const data = await previewData(locale, (await searchParams).token);
  const t = await getTranslations();
  return (
    <main id="main" className="trip-page">
      <p role="status" className="section small-text">
        {t('previewMode')}
      </p>
      {data.kind === 'trip' ? (
        <TripView trip={data.data} whatsappUrl={null} preview />
      ) : (
        <CollectionView data={data.data} preview />
      )}
    </main>
  );
}
