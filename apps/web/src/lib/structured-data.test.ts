import { describe, expect, it } from 'vitest';
import type { Site, Trip } from '@stella/shared/public-contract';
import {
  breadcrumbs,
  faqEntities,
  graph,
  offers,
  orgId,
  organization,
  plain,
  touristTrip,
  website,
} from './structured-data';

const origin = 'https://example.test';
const text = (t: string) => ({ text: t, lang: 'en' });
const media = (url: string) => ({
  url,
  alt: text('alt'),
  width: 1200,
  height: 800,
  rights_status: 'owned' as const,
});

const site = {
  name: 'Stella Sharm Tours',
  locales: [],
  contacts: {
    whatsapp_primary: null,
    whatsapp_secondary: null,
    phone: '+201000000000',
    email: null,
  },
  address: text('152 Malek El Bahrain Street, Old Market, Sharm El Sheikh'),
  hours: null,
  legal_entity: null,
  social: [
    { label: 'Instagram', url: 'https://www.instagram.com/example/' },
    { label: 'Google Maps', url: 'https://maps.app.goo.gl/abc' },
    { label: 'Legacy', url: 'http://insecure.example/' },
  ],
} as unknown as Site;

const trip = {
  slug: 'boat',
  collection: 'sea',
  kind: 'trip',
  title: text('Boat trip'),
  summary: text('Two **snorkelling** stops'),
  description: null,
  cover: media('https://media.test/a.jpg'),
  gallery: [
    media('https://media.test/a.jpg'),
    media('https://media.test/b.jpg'),
  ],
  family_friendly: true,
  min_age: null,
  format: 'both',
  prices: [
    {
      id: 'p1',
      label: text('Adult'),
      amount_eur: 35,
      unit: 'person',
      min_qty: null,
      max_qty: null,
      is_primary: true,
    },
    {
      id: 'p2',
      label: null,
      amount_eur: null,
      unit: 'child',
      min_qty: null,
      max_qty: null,
      is_primary: false,
    },
  ],
  itinerary: [
    { time: '08:00', text: text('Hotel pickup') },
    { time: null, text: text('[White Island](https://x) swim') },
  ],
  items: [],
  notes: [],
  parts: [],
} as unknown as Trip;

describe('structured data', () => {
  it('describes the business without empty or insecure claims', () => {
    const org = organization(site, origin);
    expect(org['@id']).toBe(orgId(origin));
    expect(org['@type']).toBe('TravelAgency');
    expect(org.telephone).toBe('+201000000000');
    expect(org).not.toHaveProperty('email');
    expect(org.sameAs).toEqual(['https://www.instagram.com/example/']);
    expect(org.hasMap).toBe('https://maps.app.goo.gl/abc');
    expect(org).not.toHaveProperty('aggregateRating');
    expect(org).not.toHaveProperty('review');
  });

  it('links the website to the organization by @id', () => {
    const node = website(site, origin, ['en', 'it']);
    expect(node.publisher).toEqual({ '@id': orgId(origin) });
    expect(node.inLanguage).toEqual(['en', 'it']);
  });

  it('only emits offers for prices that are set, in EUR', () => {
    const list = offers(trip, origin + '/en/t/boat', origin);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      price: 35,
      priceCurrency: 'EUR',
      name: 'Adult',
    });
  });

  it('emits no offers when every price is on request', () => {
    const onRequest = {
      ...trip,
      prices: trip.prices.map((p) => ({ ...p, amount_eur: null })),
    } as Trip;
    expect(
      touristTrip(onRequest, origin + '/en/t/boat', origin),
    ).not.toHaveProperty('offers');
  });

  it('builds a TouristTrip with an itemised itinerary and unique images', () => {
    const node = touristTrip(trip, origin + '/en/t/boat', origin);
    expect(node.provider).toEqual({ '@id': orgId(origin) });
    expect(node.description).toBe('Two snorkelling stops');
    expect(node.image).toEqual([
      'https://media.test/a.jpg',
      'https://media.test/b.jpg',
    ]);
    expect(node.itinerary).toMatchObject({
      '@type': 'ItemList',
      numberOfItems: 2,
      itemListElement: [
        { position: 1, name: 'Hotel pickup' },
        { position: 2, name: 'White Island swim' },
      ],
    });
    expect(node).not.toHaveProperty('inLanguage');
  });

  it('numbers breadcrumbs from one', () => {
    const node = breadcrumbs('u', [
      { name: 'Home', url: 'a' },
      { name: 'Trip', url: 'b' },
    ]);
    expect(node.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'a' },
      { '@type': 'ListItem', position: 2, name: 'Trip', item: 'b' },
    ]);
  });

  it('turns FAQ markdown into plain question and answer text', () => {
    expect(
      faqEntities([{ q: text('Pickup?'), a: text('**Yes**, included') }]),
    ).toEqual([
      {
        '@type': 'Question',
        name: 'Pickup?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes, included' },
      },
    ]);
  });

  it('wraps nodes in one schema.org graph that serialises safely', () => {
    const json = JSON.stringify(graph([organization(site, origin)]));
    expect(JSON.parse(json)['@context']).toBe('https://schema.org');
    expect(plain('  a\n\n b ')).toBe('a b');
  });
});
