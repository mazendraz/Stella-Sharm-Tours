/**
 * Schema.org JSON-LD builders for the public site.
 *
 * Every value comes from the published catalogue (site settings, trips,
 * collections, FAQ). Nothing here invents ratings, reviews, availability or
 * business facts: when a value is missing the property is left out.
 *
 * Stable @id values tie the nodes of every page into one graph:
 *   {origin}/#organization   the business (TravelAgency, a LocalBusiness)
 *   {origin}/#website        the website
 *   {pageUrl}#webpage        the page itself
 *   {pageUrl}#trip           a tour (TouristTrip)
 *   {pageUrl}#breadcrumb     the breadcrumb trail
 */
import type {
  Collection,
  Price,
  Site,
  Trip,
} from '@stella/shared/public-contract';

type Node = Record<string, unknown>;

export const orgId = (origin: string) => origin + '/#organization';
export const websiteId = (origin: string) => origin + '/#website';

/** The office pin shown on the contact page (same source as the map link). */
export const officeGeo = { latitude: 27.8669735, longitude: 34.293776 };

const isMap = (label: string, url: string) =>
  /map/i.test(label) || /google\.[a-z.]+\/maps|maps\.app\.goo\.gl/.test(url);

/** Drop undefined/null/empty-array properties so no empty claims are emitted. */
function clean<T extends Node>(node: T): T {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        v !== '' &&
        !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;
}

export function organization(site: Site, origin: string): Node {
  const https = site.social.filter((s) => /^https:\/\//.test(s.url));
  const map = https.find((s) => isMap(s.label, s.url));
  return clean({
    '@type': 'TravelAgency',
    '@id': orgId(origin),
    name: site.name,
    url: origin + '/',
    logo: {
      '@type': 'ImageObject',
      '@id': origin + '/#logo',
      url: origin + '/brand/logo.webp',
      width: 415,
      height: 360,
    },
    image: origin + '/brand/og.jpg',
    telephone: site.contacts.phone ?? undefined,
    email: site.contacts.email ?? undefined,
    address: site.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: site.address.text,
          addressLocality: 'Sharm El Sheikh',
          addressRegion: 'South Sinai',
          addressCountry: 'EG',
        }
      : undefined,
    geo: {
      '@type': 'GeoCoordinates',
      ...officeGeo,
    },
    hasMap: map?.url,
    areaServed: { '@type': 'City', name: 'Sharm El Sheikh' },
    sameAs: https.filter((s) => s !== map).map((s) => s.url),
  });
}

export function website(site: Site, origin: string, locales: string[]): Node {
  return {
    '@type': 'WebSite',
    '@id': websiteId(origin),
    name: site.name,
    url: origin + '/',
    publisher: { '@id': orgId(origin) },
    inLanguage: locales,
  };
}

export function webPage(
  type: 'WebPage' | 'CollectionPage' | 'ContactPage' | 'FAQPage' | 'AboutPage',
  url: string,
  origin: string,
  locale: string,
  name: string,
  extra: Node = {},
): Node {
  return clean({
    '@type': type,
    '@id': url + '#webpage',
    url,
    name,
    inLanguage: locale,
    isPartOf: { '@id': websiteId(origin) },
    about: { '@id': orgId(origin) },
    ...extra,
  });
}

export function breadcrumbs(
  url: string,
  items: { name: string; url: string }[],
): Node {
  return {
    '@type': 'BreadcrumbList',
    '@id': url + '#breadcrumb',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

const unitText: Record<Price['unit'], string> = {
  person: 'person',
  child: 'child',
  quad: 'quad bike',
  buggy: 'buggy',
  car: 'car',
  boat: 'boat',
  group: 'group',
  hour: 'hour',
};

/** Offers only for prices the admin has set; "on request" prices emit none. */
export function offers(trip: Trip, url: string, origin: string): Node[] {
  return trip.prices
    .filter((p) => p.amount_eur !== null)
    .map((p) =>
      clean({
        '@type': 'Offer',
        name: p.label?.text,
        url,
        price: p.amount_eur,
        priceCurrency: 'EUR',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: p.amount_eur,
          priceCurrency: 'EUR',
          referenceQuantity: {
            '@type': 'QuantitativeValue',
            value: 1,
            unitText: unitText[p.unit],
          },
        },
        offeredBy: { '@id': orgId(origin) },
      }),
    );
}

/** Plain text for JSON-LD: strips the light Markdown used in descriptions. */
export function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function touristTrip(trip: Trip, url: string, origin: string): Node {
  const images = [trip.cover, ...trip.gallery]
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => m.url)
    .filter((u, i, all) => all.indexOf(u) === i)
    .slice(0, 6);
  const description = trip.description?.text ?? trip.summary?.text;
  return clean({
    '@type': 'TouristTrip',
    '@id': url + '#trip',
    name: trip.title.text,
    description: description ? plain(description) : undefined,
    url,
    image: images,
    provider: { '@id': orgId(origin) },
    touristType: trip.family_friendly ? 'Families' : undefined,
    itinerary: trip.itinerary.length
      ? {
          '@type': 'ItemList',
          numberOfItems: trip.itinerary.length,
          itemListElement: trip.itinerary.map((stop, i) =>
            clean({
              '@type': 'ListItem',
              position: i + 1,
              name: plain(stop.text.text),
            }),
          ),
        }
      : undefined,
    subTrip: trip.parts.map((part) => ({
      '@type': 'TouristTrip',
      name: part.title.text,
      url: url.replace(/\/t\/[^/]+$/, '/t/' + part.slug),
    })),
    offers: offers(trip, url, origin),
  });
}

export function tripList(trips: Trip[], locale: string, origin: string): Node {
  return {
    '@type': 'ItemList',
    numberOfItems: trips.length,
    itemListElement: trips.map((trip, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: trip.title.text,
      url: origin + '/' + locale + '/t/' + trip.slug,
    })),
  };
}

export function faqEntities(
  items: { q: { text: string }; a: { text: string } }[],
): Node[] {
  return items.map((item) => ({
    '@type': 'Question',
    name: plain(item.q.text),
    acceptedAnswer: { '@type': 'Answer', text: plain(item.a.text) },
  }));
}

export function graph(nodes: Node[]): Node {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

export function collectionName(
  collections: Collection[],
  slug: string,
): string | undefined {
  return collections.find((c) => c.slug === slug)?.name.text;
}

/**
 * A guide, destination or activity page. The author is a Person only when the
 * page names one; dates are the real publish/update times from the database.
 */
export function article(
  page: {
    title: { text: string };
    summary: { text: string } | null;
    author: { name: string; role: string | null } | null;
    cover: { url: string } | null;
    published_at: string | null;
    updated_at: string;
    kind: 'guide' | 'destination' | 'activity';
  },
  url: string,
  origin: string,
  locale: string,
): Node {
  return clean({
    '@type': page.kind === 'destination' ? 'TouristDestination' : 'Article',
    '@id': url + '#article',
    ...(page.kind === 'destination'
      ? { name: page.title.text }
      : {
          headline: page.title.text,
          inLanguage: locale,
          datePublished: page.published_at ?? undefined,
          dateModified: page.updated_at,
          author: page.author
            ? {
                '@type': 'Person',
                name: page.author.name,
                jobTitle: page.author.role ?? undefined,
                worksFor: { '@id': orgId(origin) },
              }
            : { '@id': orgId(origin) },
          publisher: { '@id': orgId(origin) },
        }),
    description: page.summary ? plain(page.summary.text) : undefined,
    image: page.cover?.url,
    url,
    mainEntityOfPage: { '@id': url + '#webpage' },
  });
}
