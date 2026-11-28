import type { Trip } from '@stella/shared/public-contract';
import {
  defaultSeoDescription,
  defaultSeoTitle,
  inTownCollections,
  leadPrice,
  type SeoInput,
} from '@stella/shared/seo-defaults';

/** Inputs for the deterministic defaults, in the page language only. */
export function tripSeoInput(trip: Trip, locale: string): SeoInput {
  const own = (t: { text: string; lang: string } | null | undefined) =>
    t && t.lang === locale ? t.text : null;
  const highlights = trip.items
    .filter((i) => i.type === 'highlight')
    .flatMap((i) => own(i.text) ?? []);
  const summary = own(trip.summary);
  return {
    locale,
    title: trip.title.text,
    highlights: highlights.length
      ? highlights
      : summary
        ? summary.split(' · ')
        : [],
    duration: own(trip.duration_label),
    departure: trip.departure_label,
    price: leadPrice(trip.prices),
    place: inTownCollections.has(trip.collection) ? 'in' : 'from',
  };
}

/** Admin override first, then the deterministic default. */
export function tripSeo(trip: Trip, locale: string) {
  const input = tripSeoInput(trip, locale);
  return {
    title: trip.seo_title?.text || defaultSeoTitle(input),
    description: trip.seo_description?.text || defaultSeoDescription(input),
  };
}
