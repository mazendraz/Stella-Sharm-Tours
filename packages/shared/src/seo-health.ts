/**
 * SEO and content health for the admin, computed from the same database
 * fields the public site renders. Diagnostics only: there is no "ranking
 * score", just facts an editor can fix.
 */
import {
  defaultSeoDescription,
  defaultSeoTitle,
  descriptionMax,
  descriptionMin,
  inTownCollections,
  leadPrice,
  seoLocales,
  titleMax,
  type SeoLocale,
} from './seo-defaults';

export type Loc = { en: string } & Partial<Record<SeoLocale, string>>;
export type SeoTripSource = {
  id: string;
  slug: string;
  kind: 'trip' | 'package';
  status: 'draft' | 'published' | 'hidden';
  collection: string | null;
  title: Loc;
  summary: Loc | null;
  description: Loc | null;
  seoTitle: Loc | null;
  seoDescription: Loc | null;
  durationLabel: Loc | null;
  departureLabel: string | null;
  prices: { amountEur: number | null; unit: string; isPrimary: boolean }[];
  items: { type: string; text: Loc }[];
  itineraryCount: number;
  images: { role: string; alt: Loc | null }[];
};

export type Severity = 'error' | 'warning' | 'info';
export type IssueCode =
  | 'translationMissing'
  | 'titleLong'
  | 'titleDuplicate'
  | 'descriptionShort'
  | 'descriptionDuplicate'
  | 'noOverride'
  | 'noDescription'
  | 'noIncludes'
  | 'noExcludes'
  | 'noBring'
  | 'noItinerary'
  | 'noDuration'
  | 'noDeparture'
  | 'onRequest'
  | 'noCover'
  | 'fewPhotos'
  | 'altMissing';
export type Issue = {
  code: IssueCode;
  severity: Severity;
  locale?: SeoLocale;
};
export const severityOf: Record<IssueCode, Severity> = {
  translationMissing: 'error',
  titleDuplicate: 'error',
  descriptionDuplicate: 'error',
  noCover: 'error',
  titleLong: 'warning',
  descriptionShort: 'warning',
  noDescription: 'warning',
  noIncludes: 'warning',
  noExcludes: 'warning',
  noBring: 'warning',
  noItinerary: 'warning',
  altMissing: 'warning',
  noDuration: 'warning',
  noDeparture: 'info',
  onRequest: 'info',
  fewPhotos: 'info',
  noOverride: 'info',
};

const has = (l: Loc | null | undefined, locale: SeoLocale) =>
  Boolean(l?.[locale]?.trim());
const pick = (l: Loc | null | undefined, locale: SeoLocale) =>
  l?.[locale]?.trim() || null;

/** The title and description the public page will carry, per language. */
export function effectiveSeo(trip: SeoTripSource, locale: SeoLocale) {
  const highlights = trip.items
    .filter((i) => i.type === 'highlight')
    .flatMap((i) => pick(i.text, locale) ?? []);
  const summary = pick(trip.summary, locale);
  const input = {
    locale,
    title: pick(trip.title, locale) ?? trip.title.en,
    highlights: highlights.length
      ? highlights
      : summary
        ? summary.split(' · ')
        : [],
    duration: pick(trip.durationLabel, locale),
    departure: trip.departureLabel,
    price: leadPrice(
      trip.prices.map((p) => ({
        amount_eur: p.amountEur,
        unit: p.unit,
        is_primary: p.isPrimary,
      })),
    ),
    place: inTownCollections.has(trip.collection ?? '')
      ? ('in' as const)
      : ('from' as const),
  };
  const ownTitle = pick(trip.seoTitle, locale),
    ownDescription = pick(trip.seoDescription, locale);
  return {
    title: ownTitle ?? defaultSeoTitle(input),
    description: ownDescription ?? defaultSeoDescription(input),
    titleSource: ownTitle ? ('override' as const) : ('default' as const),
    descriptionSource: ownDescription
      ? ('override' as const)
      : ('default' as const),
    suggestion: {
      title: defaultSeoTitle(input),
      description: defaultSeoDescription(input),
    },
  };
}

/** Facts a complete tour page needs; the order is the editor's to-do list. */
export const completenessChecks = [
  'description',
  'includes',
  'excludes',
  'bring',
  'itinerary',
  'duration',
  'departure',
  'price',
  'cover',
  'photos',
  'alt',
  'seoTitle',
  'seoDescription',
  'translations',
] as const;
export type CompletenessCheck = (typeof completenessChecks)[number];

export type TripHealth = {
  id: string;
  slug: string;
  kind: SeoTripSource['kind'];
  status: SeoTripSource['status'];
  issues: Issue[];
  done: CompletenessCheck[];
  missing: CompletenessCheck[];
  seo: Record<SeoLocale, ReturnType<typeof effectiveSeo>>;
};

export function tripHealth(trips: SeoTripSource[]): TripHealth[] {
  const live = trips.filter((t) => t.status === 'published');
  const seoBy = new Map(
    trips.map((t) => [
      t.id,
      Object.fromEntries(
        seoLocales.map((l) => [l, effectiveSeo(t, l)]),
      ) as TripHealth['seo'],
    ]),
  );
  // Duplicates only matter among pages that are actually published.
  const count = (field: 'title' | 'description', locale: SeoLocale) => {
    const seen = new Map<string, number>();
    for (const t of live) {
      const v = seoBy.get(t.id)![locale][field].toLowerCase();
      seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    return seen;
  };
  const dupes = Object.fromEntries(
    seoLocales.map((l) => [
      l,
      { title: count('title', l), description: count('description', l) },
    ]),
  ) as Record<SeoLocale, Record<'title' | 'description', Map<string, number>>>;

  return trips.map((t) => {
    const issues: Issue[] = [],
      add = (code: IssueCode, locale?: SeoLocale) =>
        issues.push({
          code,
          severity: severityOf[code],
          ...(locale ? { locale } : {}),
        }),
      seo = seoBy.get(t.id)!,
      itemsOf = (type: string) => t.items.filter((i) => i.type === type),
      published = t.status === 'published';

    for (const locale of seoLocales) {
      const s = seo[locale];
      const texts: (Loc | null)[] = [
        t.title,
        t.summary,
        t.description,
        t.durationLabel,
        ...t.items.map((i) => i.text),
      ];
      if (texts.some((x) => x && x.en.trim() && !has(x, locale)))
        add('translationMissing', locale);
      if (s.title.length > titleMax) add('titleLong', locale);
      if (s.description.length < descriptionMin)
        add('descriptionShort', locale);
      if (published) {
        if ((dupes[locale].title.get(s.title.toLowerCase()) ?? 0) > 1)
          add('titleDuplicate', locale);
        if (
          (dupes[locale].description.get(s.description.toLowerCase()) ?? 0) > 1
        )
          add('descriptionDuplicate', locale);
      }
    }
    const photos = t.images.filter((i) => i.role !== 'video');
    const altOk = photos.every((i) => seoLocales.every((l) => has(i.alt, l)));
    const checks: Record<CompletenessCheck, boolean> = {
      description: has(t.description, 'en'),
      includes: itemsOf('include').length > 0,
      excludes: itemsOf('exclude').length > 0,
      bring: itemsOf('bring').length > 0,
      itinerary: t.itineraryCount > 0 || t.kind === 'package',
      duration: has(t.durationLabel, 'en'),
      departure: Boolean(t.departureLabel?.trim()),
      price: t.prices.some((p) => p.amountEur !== null),
      cover: t.images.some((i) => i.role === 'cover'),
      photos: photos.length >= 3,
      alt: photos.length > 0 && altOk,
      seoTitle: seoLocales.every((l) => has(t.seoTitle, l)),
      seoDescription: seoLocales.every((l) => has(t.seoDescription, l)),
      translations: !issues.some((i) => i.code === 'translationMissing'),
    };
    const map: Partial<Record<CompletenessCheck, IssueCode>> = {
      description: 'noDescription',
      includes: 'noIncludes',
      excludes: 'noExcludes',
      bring: 'noBring',
      itinerary: 'noItinerary',
      duration: 'noDuration',
      departure: 'noDeparture',
      price: 'onRequest',
      cover: 'noCover',
      photos: 'fewPhotos',
      alt: 'altMissing',
    };
    for (const [check, code] of Object.entries(map))
      if (!checks[check as CompletenessCheck]) add(code!);
    if (!checks.seoTitle || !checks.seoDescription) add('noOverride');
    return {
      id: t.id,
      slug: t.slug,
      kind: t.kind,
      status: t.status,
      issues,
      done: completenessChecks.filter((c) => checks[c]),
      missing: completenessChecks.filter((c) => !checks[c]),
      seo,
    };
  });
}

export type SeoSummary = {
  publishedTrips: number;
  indexableTripPages: number;
  issues: Record<IssueCode, number>;
  /** Published trips with every completeness check passed. */
  completeTrips: number;
  /** Average share of completeness checks passed, 0–1. */
  completeness: number;
};

export function summarize(health: TripHealth[]): SeoSummary {
  const live = health.filter((h) => h.status === 'published');
  const issues = Object.fromEntries(
    (Object.keys(severityOf) as IssueCode[]).map((c) => [c, 0]),
  ) as Record<IssueCode, number>;
  for (const h of live) for (const i of h.issues) issues[i.code]++;
  return {
    publishedTrips: live.length,
    indexableTripPages: live.length * seoLocales.length,
    issues,
    completeTrips: live.filter((h) => h.missing.length === 0).length,
    completeness: live.length
      ? live.reduce(
          (s, h) => s + h.done.length / completenessChecks.length,
          0,
        ) / live.length
      : 0,
  };
}

export { descriptionMax, titleMax };
