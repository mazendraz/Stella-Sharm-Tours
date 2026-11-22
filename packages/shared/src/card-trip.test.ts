import { describe, it, expect } from 'vitest';
import { cardTrip, navCollection, shellSite } from './card-trip';
import { estimateTrip } from './price';
import { planDays } from './days';
import type { Collection, Site, Trip } from './public-contract';
const text = (value: string) => ({ text: value, lang: 'en' });
const media = {
  url: '/media/a/1200.jpg',
  alt: text('Boat'),
  rights_status: 'client',
  variants: { '480': '/media/a/480.jpg' },
} as unknown as NonNullable<Trip['cover']>;
const trip = {
  slug: 'tiran',
  collection: 'sea',
  kind: 'trip',
  title: text('Tiran Island'),
  summary: text('Snorkelling'),
  description: text('Long description'),
  cover: media,
  gallery: [media, media],
  duration_label: text('Full day'),
  duration_minutes: 480,
  days_label: null,
  run_days: [0, 3],
  departure_label: '08:00',
  days_count: 1,
  flight: false,
  overnight: false,
  family_friendly: true,
  min_age: null,
  format: 'both',
  private_surcharge_pct: null,
  private_on_request: true,
  prices: [
    {
      id: 'p',
      unit: 'person',
      amount_eur: 35,
      max_qty: null,
      min_qty: null,
      label: null,
      is_primary: true,
    },
  ],
  itinerary: [{ time: '08:00', text: text('Pickup') }],
  items: [{ type: 'include', text: text('Lunch') }],
  notes: [text('Bring a towel')],
  parts: [],
  seo_title: text('SEO'),
  seo_description: text('SEO description'),
} as unknown as Trip;
describe('client payload projections', () => {
  it('keeps everything cards, estimates and My trip need', () => {
    const card = cardTrip(trip);
    expect(card.gallery).toEqual([]);
    expect(card.itinerary).toEqual([]);
    expect(card.items).toEqual([]);
    expect(card.notes).toEqual([]);
    expect(card.description).toBeNull();
    expect(card.seo_title).toBeNull();
    for (const key of [
      'slug',
      'collection',
      'title',
      'summary',
      'cover',
      'duration_label',
      'duration_minutes',
      'days_count',
      'flight',
      'overnight',
      'family_friendly',
      'format',
      'private_on_request',
      'prices',
      'parts',
    ] as const)
      expect(card[key]).toEqual(trip[key]);
    expect(estimateTrip(card, 2, 0, 'group')).toEqual(
      estimateTrip(trip, 2, 0, 'group'),
    );
    expect(planDays([card])).toEqual(
      planDays([trip]).map((row) => ({
        ...row,
        trip: row.trip && cardTrip(row.trip),
      })),
    );
  });
  it('gives navigation collections no images', () => {
    const collection = {
      slug: 'sea',
      kind: 'normal',
      name: text('Sea'),
      cover: media,
      previews: [media],
      color: '#123456',
    } as unknown as Collection;
    expect(navCollection(collection)).toMatchObject({
      slug: 'sea',
      name: collection.name,
      color: '#123456',
      cover: null,
      previews: [],
    });
  });
  it('passes the shell only its fields, never trips or slides', () => {
    const site = {
      locales: [],
      contacts: { whatsapp_primary: '+20', whatsapp_secondary: null },
      address: text('Old Market'),
      legal_entity: null,
      pickup_areas: ['Naama Bay'],
      social: [{ label: 'Instagram', url: 'https://instagram.com/x' }],
      hero_slides: [{ id: 's' }],
      featured_trips: [trip],
      private_trips: [trip],
    } as unknown as Site;
    const shell = shellSite(site);
    expect(Object.keys(shell).sort()).toEqual([
      'address',
      'contacts',
      'has_hero',
      'legal_entity',
      'locales',
      'pickup_areas',
      'social',
    ]);
    expect(shell.has_hero).toBe(true);
    expect(shellSite({ ...site, hero_slides: [] }).has_hero).toBe(false);
  });
});
