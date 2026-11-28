import { Overlay } from '@/components/overlay';
import { TripView } from '@/components/trip-view';
import { tripData } from '@/lib/route-data';
import { getSite } from '@/lib/api';
import { whatsapp } from '@/lib/links';
import { whatsappNumberFor } from '@stella/shared/whatsapp';
export default async function TripModal({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ format?: string | string[] }>;
}) {
  const { locale, slug } = await params;
  const [trip, site, query] = await Promise.all([
    tripData(slug, locale),
    getSite(locale),
    searchParams,
  ]);
  return (
    <Overlay kind="trip">
      <TripView
        trip={trip}
        whatsappUrl={whatsapp(whatsappNumberFor(locale, site.contacts))}
        requestedPrivate={query.format === 'private'}
      />
    </Overlay>
  );
}
