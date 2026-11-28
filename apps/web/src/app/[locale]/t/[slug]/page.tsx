import { TripView } from '@/components/trip-view';
import { TripGuides } from '@/components/trip-guides';
import { tripData } from '@/lib/route-data';
import { getSite, getCollections } from '@/lib/api';
import { metadataFor, JsonLd } from '@/lib/seo';
import { tripSeo } from '@/lib/trip-seo';
import { whatsapp } from '@/lib/links';
import { whatsappNumberFor } from '@stella/shared/whatsapp';
import { siteOrigin } from '@/lib/env';
import {
  breadcrumbs,
  collectionName,
  graph,
  touristTrip,
  webPage,
} from '@/lib/structured-data';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const trip = await tripData(slug, locale),
    seo = tripSeo(trip, locale);
  return metadataFor(
    locale,
    '/t/' + slug,
    seo.title,
    seo.description,
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
    collections = await getCollections(locale).catch(() => []),
    requestedPrivate = (await searchParams).format === 'private';
  const url = siteOrigin + '/' + locale + '/t/' + slug,
    home = siteOrigin + '/' + locale,
    inCollection = collectionName(collections, trip.collection);
  const jsonLd = graph([
    webPage('WebPage', url, siteOrigin, locale, trip.title.text, {
      mainEntity: { '@id': url + '#trip' },
      breadcrumb: { '@id': url + '#breadcrumb' },
      ...(trip.cover ? { primaryImageOfPage: trip.cover.url } : {}),
    }),
    touristTrip(trip, url, siteOrigin),
    breadcrumbs(url, [
      { name: site.name, url: home },
      ...(inCollection
        ? [{ name: inCollection, url: home + '/c/' + trip.collection }]
        : []),
      { name: trip.title.text, url },
    ]),
  ]);
  return (
    <main id="main" className="trip-page">
      <TripView
        trip={trip}
        whatsappUrl={whatsapp(whatsappNumberFor(locale, site.contacts))}
        requestedPrivate={requestedPrivate}
      />
      <TripGuides slug={slug} locale={locale} />
      <JsonLd value={jsonLd} />
    </main>
  );
}
