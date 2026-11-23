import type { Collection, Site, Trip } from './public-contract';
// Server-side projections for client components. Everything passed to a
// client component is serialized into the page's RSC payload, so list and
// layout components receive only the fields they render.

/**
 * Card-sized trip for lists (home, collections). Drops detail-only fields.
 * Prices, format, days, flags and parts stay intact: cards, price estimates,
 * the My trip store and the request sheet rely on them. The trip page and
 * My trip fetch full trips.
 */
export function cardTrip(trip: Trip): Trip {
  return {
    ...trip,
    description: null,
    gallery: [],
    itinerary: [],
    items: [],
    notes: [],
    seo_title: null,
    seo_description: null,
  };
}

/** Collection for navigation/counters: name, colour and kind, no images. */
export function navCollection(collection: Collection): Collection {
  return { ...collection, cover: null, previews: [] };
}

/** The site fields the layout shell, footer and request sheet use. */
export type ShellSite = Pick<
  Site,
  | 'locales'
  | 'contacts'
  | 'address'
  | 'legal_entity'
  | 'pickup_areas'
  | 'booking_min_days_ahead'
  | 'social'
> & { has_hero: boolean };
export function shellSite(site: Site): ShellSite {
  return {
    locales: site.locales,
    contacts: site.contacts,
    address: site.address,
    legal_entity: site.legal_entity,
    pickup_areas: site.pickup_areas,
    booking_min_days_ahead: site.booking_min_days_ahead,
    social: site.social,
    has_hero: site.hero_slides.length > 0,
  };
}
