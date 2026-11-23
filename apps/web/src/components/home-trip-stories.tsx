import { getTranslations } from 'next-intl/server';
import { getSavedTrips } from '@/lib/api';
import TripStory from './trip-story';

const destinations = [
  ['petra-bus-ferry'],
  ['cairo-bus-gem', 'cairo-bus-2-days'],
  ['luxor-plane-1-day'],
  ['cairo-alexandria-bus-2-days'],
  ['mount-sinai-st-catherine'],
  ['jerusalem-bethlehem'],
];

export async function HomeTripStories({ locale }: { locale: string }) {
  const [t, programs] = await Promise.all([
    getTranslations(),
    getSavedTrips(destinations.flat(), locale).catch(() => []),
  ]);
  const published = new Map(
    programs.flatMap((program) =>
      program.status === 'available' &&
      program.trip.story_available &&
      program.trip.story_cover
        ? [[program.slug, program.trip] as const]
        : [],
    ),
  );
  const trips = destinations.flatMap((group) => {
    const trip = group.map((slug) => published.get(slug)).find(Boolean);
    return trip ? [trip] : [];
  });
  if (!trips.length) return null;
  return (
    <section className="section" aria-labelledby="home-story-title">
      <div className="section-heading">
        <h2 id="home-story-title">{t('homeTripStories')}</h2>
      </div>
      <div className="home-story-gallery">
        {trips.map((trip) => (
          <TripStory
            key={trip.slug}
            trip={trip}
            privateMode={trip.format === 'private'}
            homeCard
          />
        ))}
      </div>
    </section>
  );
}
