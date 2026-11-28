/**
 * Deterministic search titles and descriptions for trips that have no
 * hand-written SEO override. Built only from published fields (title,
 * highlights, duration, departure time, database price), so they never add a
 * fact the trip page does not already show. Used by the public site (as the
 * fallback) and the admin SEO screen (as the preview and the suggestion).
 */
export const seoLocales = ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr'] as const;
export type SeoLocale = (typeof seoLocales)[number];

export const titleMax = 60;
export const descriptionMax = 158;
export const descriptionMin = 70;

type Unit = 'person' | 'car' | 'boat' | 'hour' | 'quad' | 'buggy' | 'group';
const words: Record<
  SeoLocale,
  {
    from: string;
    in: string;
    departs: string;
    price: (amount: string, unit: Unit) => string;
  }
> = {
  en: {
    from: 'from Sharm El Sheikh',
    in: 'in Sharm El Sheikh',
    departs: 'departs',
    price: (n, u) =>
      `From €${n} ${{ person: 'per person', car: 'per car', boat: 'per boat', hour: 'per hour', quad: 'per quad', buggy: 'per buggy', group: 'per group' }[u]}`,
  },
  it: {
    from: 'da Sharm El Sheikh',
    in: 'a Sharm El Sheikh',
    departs: 'partenza',
    price: (n, u) =>
      `Da €${n} ${{ person: 'a persona', car: 'per auto', boat: 'per barca', hour: "all'ora", quad: 'per quad', buggy: 'per buggy', group: 'per gruppo' }[u]}`,
  },
  es: {
    from: 'desde Sharm El Sheikh',
    in: 'en Sharm El Sheikh',
    departs: 'salida',
    price: (n, u) =>
      `Desde ${n} € ${{ person: 'por persona', car: 'por coche', boat: 'por barco', hour: 'por hora', quad: 'por quad', buggy: 'por buggy', group: 'por grupo' }[u]}`,
  },
  fr: {
    from: 'au départ de Sharm El Sheikh',
    in: 'à Sharm El Sheikh',
    departs: 'départ',
    price: (n, u) =>
      `À partir de ${n} € ${{ person: 'par personne', car: 'par voiture', boat: 'par bateau', hour: "de l'heure", quad: 'par quad', buggy: 'par buggy', group: 'par groupe' }[u]}`,
  },
  de: {
    from: 'ab Sharm El Sheikh',
    in: 'in Sharm El Sheikh',
    departs: 'Abfahrt',
    price: (n, u) =>
      `Ab ${n} € ${{ person: 'pro Person', car: 'pro Auto', boat: 'pro Boot', hour: 'pro Stunde', quad: 'pro Quad', buggy: 'pro Buggy', group: 'pro Gruppe' }[u]}`,
  },
  ru: {
    from: 'из Шарм-эль-Шейха',
    in: 'в Шарм-эль-Шейхе',
    departs: 'отправление',
    price: (n, u) =>
      `От ${n} € ${{ person: 'с человека', car: 'за машину', boat: 'за лодку', hour: 'в час', quad: 'за квадроцикл', buggy: 'за багги', group: 'за группу' }[u]}`,
  },
  tr: {
    from: 'Şarm El-Şeyh’ten',
    in: 'Şarm El-Şeyh’te',
    departs: 'hareket',
    price: (n, u) =>
      `${{ person: 'Kişi başı', car: 'Araç başı', boat: 'Tekne başı', hour: 'Saatlik', quad: 'ATV başı', buggy: 'Buggy başı', group: 'Grup başı' }[u]} ${n} €’dan başlayan fiyatlar`,
  },
};

export type SeoInput = {
  locale: string;
  title: string;
  /** Published highlights in this language, in display order. */
  highlights: string[];
  /** Localized duration label; omit when only a fallback language exists. */
  duration?: string | null;
  /** Departure label as stored (times only are used). */
  departure?: string | null;
  /** Lowest regular (non-child) DB price; null = on request. */
  price?: { amount: number; unit: string } | null;
  /** Activities in town ("in Sharm") vs. excursions leaving it ("from"). */
  place: 'from' | 'in';
};

const space = (s: string) => s.replace(/\s+/g, ' ').trim();
const mentionsSharm = (s: string) => /sharm|шарм|şarm/i.test(s);
const timeOnly = /^~?\d{1,2}:\d{2}(\s*[–-]\s*\d{1,2}:\d{2})?$/;
const isUnit = (u: string): u is Unit =>
  ['person', 'car', 'boat', 'hour', 'quad', 'buggy', 'group'].includes(u);
const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : s + '.');

function wordsFor(locale: string) {
  return (seoLocales as readonly string[]).includes(locale)
    ? words[locale as SeoLocale]
    : null;
}

/** Title without the brand; the site adds " | Stella Sharm Tours" if it fits. */
export function defaultSeoTitle(input: SeoInput): string {
  const title = space(input.title),
    w = wordsFor(input.locale);
  if (!w || mentionsSharm(title)) return title;
  const withPlace = `${title} ${input.place === 'in' ? w.in : w.from}`;
  return withPlace.length <= titleMax ? withPlace : title;
}

export function defaultSeoDescription(input: SeoInput): string {
  const w = wordsFor(input.locale),
    highlights = input.highlights.map(space).filter(Boolean);
  if (!w) return clipWords(highlights.join(' · '), descriptionMax);
  // Mid-sentence list items read better in lower case ("yacht cruise"), but
  // names must keep theirs ("White Island visit", "Giza Pyramids") and German
  // nouns are always capitalized.
  const inline = (item: string) => {
    const [first, second] = item.split(' ');
    return input.locale !== 'de' &&
      second &&
      /^\p{Lu}\p{Ll}+$/u.test(first!) &&
      /^[\p{Ll}\d&]/u.test(second)
      ? item.charAt(0).toLocaleLowerCase(input.locale) + item.slice(1)
      : item;
  };
  const title = space(input.title),
    lead = mentionsSharm(title)
      ? title
      : `${title} ${input.place === 'in' ? w.in : w.from}`,
    list = highlights.map(inline).join(', '),
    departure = input.departure?.trim(),
    facts = [
      input.duration ? space(input.duration) : '',
      departure && timeOnly.test(departure) ? `${w.departs} ${departure}` : '',
    ]
      .filter(Boolean)
      .join(', '),
    price =
      input.price && isUnit(input.price.unit)
        ? w.price(
            Number.isInteger(input.price.amount)
              ? String(input.price.amount)
              : input.price.amount.toFixed(2),
            input.price.unit,
          )
        : '';
  const body = (parts: string[]) =>
    parts
      .filter(Boolean)
      .map((p) =>
        sentence(p.charAt(0).toLocaleUpperCase(input.locale) + p.slice(1)),
      )
      .join(' ');
  const withLead = (rest: string) => (list ? `${lead}: ${rest}` : lead);
  const candidates = [
    body([withLead(list), facts, price]),
    body([withLead(list), price]),
    body([list, facts, price]),
    body([list, price]),
    body([withLead(list)]),
    body([lead, facts, price]),
    body([list || lead]),
  ];
  return (
    candidates.find((c) => c.length <= descriptionMax) ??
    clipWords(candidates.at(-1)!, descriptionMax)
  );
}

export function clipWords(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1),
    at = cut.lastIndexOf(' ');
  return (
    (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:·–-]+$/, '') + '…'
  );
}

/** Lowest bookable regular price, or null when the trip is on request. */
export function leadPrice(
  prices: { amount_eur: number | null; unit: string; is_primary?: boolean }[],
) {
  const priced = prices.filter(
    (p) => p.amount_eur !== null && p.unit !== 'child',
  ) as { amount_eur: number; unit: string; is_primary?: boolean }[];
  const primary = priced.find((p) => p.is_primary);
  const pick = primary ?? priced.sort((a, b) => a.amount_eur - b.amount_eur)[0];
  return pick ? { amount: pick.amount_eur, unit: pick.unit } : null;
}

/** Collections whose trips happen in town rather than leaving Sharm. */
export const inTownCollections = new Set(['relax']);
