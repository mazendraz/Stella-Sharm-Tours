import { TripView } from '@/components/trip-view';
import { tripData } from '@/lib/route-data';
import { getSite } from '@/lib/api';
import { metadataFor, JsonLd } from '@/lib/seo';
import { whatsapp } from '@/lib/links';
import { siteOrigin } from '@/lib/env';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const trip = await tripData(slug, locale);
  return metadataFor(
    locale,
    '/t/' + slug,
    trip.seo_title?.text ?? trip.title.text,
    trip.seo_description?.text ?? trip.summary?.text,
    trip.cover?.url,
  );
}
export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ format?: string | string[] }>;
}) {
  const { locale, slug } = await params,
    trip = await tripData(slug, locale),
    site = await getSite(locale),
    requestedPrivate = (await searchParams).format === 'private';
  return (
    <main id="main" className="trip-page">
      <TripView
        trip={trip}
        whatsappUrl={whatsapp(site.contacts.whatsapp_primary)}
        requestedPrivate={requestedPrivate}
      />
      <JsonLd
        value={{
          '@context': 'https://schema.org',
          '@type': 'TouristTrip',
          name: trip.title.text,
          inLanguage: locale,
          url: siteOrigin + '/' + locale + '/t/' + slug,
          provider: { '@type': 'TravelAgency', name: site.name },
          offers: trip.prices
            .filter((p) => p.amount_eur !== null)
            .map((p) => ({
              '@type': 'Offer',
              price: p.amount_eur,
              priceCurrency: 'EUR',
            })),
          itinerary: trip.itinerary.map((p) => p.text.text),
        }}
      />
    </main>
  );
}
