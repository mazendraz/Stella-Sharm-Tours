import { readFile } from 'node:fs/promises';
import sources from '../../data/i18n/core-source.json' with { type: 'json' };
import translations from '../../data/i18n/core-content.json' with { type: 'json' };
const catalog = JSON.parse(
  await readFile(new URL('../../data/catalog.json', import.meta.url), 'utf8'),
);
const base = 'http://127.0.0.1:4100';
export const locales = [
  { code: 'en', name: 'English', auto: false, indexable: true, dir: 'ltr' },
  { code: 'it', name: 'Italiano', auto: false, indexable: true, dir: 'ltr' },
  { code: 'es', name: 'Español', auto: false, indexable: true, dir: 'ltr' },
  { code: 'fr', name: 'Français', auto: false, indexable: true, dir: 'ltr' },
  { code: 'de', name: 'Deutsch', auto: false, indexable: true, dir: 'ltr' },
  { code: 'ru', name: 'Русский', auto: false, indexable: true, dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', auto: false, indexable: true, dir: 'ltr' },
  { code: 'ar', name: 'العربية', auto: true, indexable: false, dir: 'rtl' },
];
const translated = new Map(
  translations.rows.map(([index, ...values]) => [sources[index], values]),
);
function text(value, locale = 'en') {
  if (!value) return null;
  if (typeof value !== 'string' && value[locale])
    return { text: value[locale], lang: locale };
  const en = typeof value === 'string' ? value : value.en;
  const index = translations.locales.indexOf(locale);
  if (index < 0) return { text: en, lang: 'en' };
  const copy = /[A-Za-z]/.test(en) ? translated.get(en)?.[index] : en;
  return copy ? { text: copy, lang: locale } : { text: en, lang: 'en' };
}
function media(path, alt, locale) {
  return path
    ? {
        url: base + '/media/' + path.replace(/^assets\//, ''),
        alt: text(alt, locale),
        width: 1600,
        height: 1100,
        variants: Object.fromEntries(
          [480, 768, 1200, 1920].map((w) => [
            String(w),
            base + '/media/' + path.replace(/^assets\//, '') + '?w=' + w,
          ]),
        ),
        rights_status: 'licensed',
      }
    : null;
}
const sourceTrips = catalog.trips;
export function trip(slug, locale = 'en') {
  const t = sourceTrips.find((t) => t.slug === slug);
  if (!t) return null;
  const duration = t.duration.match(/(?:~)?(\d+(?:\.\d+)?)\s*(?:h|hour)/i);
  const count = /2 days/.test(t.duration) ? 2 : 1;
  return {
    slug: t.slug,
    collection: t.collection,
    kind: 'trip',
    title: text(t.title, locale),
    summary: t.highlights?.length
      ? text(t.highlights.slice(0, 3).join(' · '), locale)
      : null,
    description: null,
    cover: media(t.media.cover, t.title, locale),
    gallery: [t.media.cover, ...(t.media.gallery ?? [])]
      .filter(Boolean)
      .map((p) => media(p, t.title, locale)),
    duration_label: text(t.duration, locale),
    duration_minutes: duration ? Number(duration[1]) * 60 : null,
    days_label: text(t.days, locale),
    run_days: null,
    departure_label: text(t.departure, locale)?.text ?? null,
    return_label: text(t.return_time, locale),
    days_count: count,
    flight: t.flight,
    overnight: count > 1 || /overnight/i.test(t.duration),
    family_friendly: t.family,
    min_age: null,
    format: t.format,
    private_surcharge_pct: null,
    private_on_request: t.private_on_request,
    prices: t.prices.map((p, i) => ({
      id: t.slug + '-' + i,
      label: text(p.label, locale),
      amount_eur: p.amount_eur,
      unit: p.unit,
      min_qty: null,
      max_qty: null,
      is_primary: i === 0,
    })),
    itinerary: t.itinerary.map((p) => ({
      time: text(p[0], locale)?.text ?? null,
      text: text(p[1], locale),
    })),
    items: [
      ...t.includes.map((v) => ({ type: 'include', text: text(v, locale) })),
      ...t.excludes.map((v) => ({ type: 'exclude', text: text(v, locale) })),
      ...t.optional.map((v) => ({ type: 'optional', text: text(v, locale) })),
    ],
    notes: t.notes
      .filter((n) => /^(Timing may vary|Book at least|Needed:|Bring:)/.test(n))
      .map((n) => text(n, locale)),
    parts: [],
    seo_title: null,
    seo_description: null,
  };
}
export function collections(locale = 'en') {
  return catalog.collections.map((c) => {
    const trips = sourceTrips.filter((t) =>
      c.id === 'private'
        ? ['private', 'both'].includes(t.format)
        : t.collection === c.id,
    );
    const prices = trips
      .filter((t) => c.id !== 'private' || t.format === 'private')
      .flatMap((t) =>
        t.prices
          .filter((p) => p.amount_eur !== null && p.unit !== 'child')
          .map((p) => p.amount_eur),
      );
    return {
      slug: c.id,
      kind: c.kind,
      name: text(c.name, locale),
      short_name: text(c.short, locale),
      headline: text(c.headline, locale),
      subline: text(c.sub, locale),
      color: c.color,
      cover: media(c.cover, c.name, locale),
      trip_count: trips.length,
      min_price_eur: prices.length ? Math.min(...prices) : null,
      max_days: trips.some((t) => /2 days/.test(t.duration)) ? 2 : 1,
      previews: trips
        .filter((t) => t.media.cover)
        .slice(0, 3)
        .map((t) => media(t.media.cover, t.title, locale)),
    };
  });
}
export function collection(slug, locale = 'en') {
  const c = collections(locale).find((c) => c.slug === slug);
  if (!c) return null;
  return {
    collection: c,
    trips: sourceTrips
      .filter((t) =>
        slug === 'private'
          ? ['private', 'both'].includes(t.format)
          : t.collection === slug,
      )
      .map((t) => trip(t.slug, locale)),
    combo: null,
  };
}
export function site(locale = 'en') {
  const cs = collections(locale);
  return {
    name: catalog.business.name,
    home: {
      private_heading: text(catalog.collections[0].headline, locale),
      private_text: text(catalog.collections[0].sub, locale),
      build_heading: text('Build your own Egypt.', locale),
      build_text: text(
        'A day on the water. A night in the desert. The rest is yours.',
        locale,
      ),
      contact_heading: text('Not sure what to pick?', locale),
      contact_text: text(
        "Tell us your dates and what you enjoy. We'll help you plan.",
        locale,
      ),
    },
    locales,
    contacts: {
      whatsapp_primary: '+201069012881',
      whatsapp_secondary: '+201008605904',
      phone: null,
      email: null,
    },
    address: text(catalog.business.address, locale),
    hours: null,
    legal_entity: text('Stella Sharm Tours', locale),
    hero_slides: cs.map((c) => ({
      id: c.slug,
      title: c.headline,
      kicker: c.name,
      subline: c.subline,
      cta_label: text('See trips', locale),
      href: '/c/' + c.slug,
      cover: c.cover,
      duration_s: 6,
      device: 'all',
      starts_at: null,
      ends_at: null,
    })),
    featured_trips: [
      'ras-mohammed-white-island-boat',
      'quad-bike-safari',
      'cairo-plane-1-day',
      'glass-bottom-boat',
    ].map((s) => trip(s, locale)),
    private_trips: sourceTrips
      .filter((t) => t.format === 'private')
      .map((t) => trip(t.slug, locale)),
    private_perks: catalog.collections[0].perks.map((p) => ({
      title: text(p[0], locale),
      sub: text(p[1], locale),
    })),
    how_steps: [
      {
        title: text('Pick your days', locale),
        text: text('One trip, a collection, or your own mix.', locale),
      },
      {
        title: text('Send one request', locale),
        text: text('Dates, guests and your hotel.', locale),
      },
      {
        title: text('We confirm', locale),
        text: text('Availability, pickup time and price on WhatsApp.', locale),
      },
    ],
    pickup_areas: [
      'Naama Bay',
      'Nabq Bay',
      'Sharks Bay',
      'Hadaba',
      'Old Market',
      'Other',
    ],
    social: [],
  };
}
