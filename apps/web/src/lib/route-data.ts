import { notFound } from 'next/navigation';
import { cardTrip } from '@stella/shared/card-trip';
import { ApiError, getTrip, getCollection, getCollections } from './api';
export async function tripData(slug: string, locale: string) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) notFound();
  try {
    return await getTrip(slug, locale);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
export async function collectionData(slug: string, locale: string) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) notFound();
  try {
    const data = await getCollection(slug, locale);
    // "All of Egypt" lists every trip, grouped under each collection's name.
    const groups =
      data.collection.kind === 'packages'
        ? (await getCollections(locale)).map((c) => ({
            slug: c.slug,
            name: c.name,
            short_name: c.short_name,
            color: c.color,
          }))
        : [];
    // Collection views list cards only; full trips load on the trip page.
    return { ...data, trips: data.trips.map(cardTrip), groups };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
