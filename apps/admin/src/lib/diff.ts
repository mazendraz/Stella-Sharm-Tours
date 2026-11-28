import { locales, type Locale } from '@stella/shared';
import { content, obj, rows, type Row } from './content';
import { money } from './format';

type T = (key: string, vars?: Record<string, string | number>) => string;

const fieldKeys: Record<string, string> = {
  title: 'title',
  summary: 'summary',
  description: 'description',
  collectionId: 'collection',
  slug: 'pageAddress',
  format: 'format',
  privateSurchargePct: 'privateSupplement',
  privateOnRequest: 'privateOnRequestShort',
  familyFriendly: 'familyFriendly',
  minAge: 'minAge',
  featuredOrder: 'featuredOrderShort',
  daysLabel: 'runsOn',
  runDays: 'runsOn',
  departureLabel: 'departureTime',
  returnLabel: 'returnTime',
  durationLabel: 'duration',
  durationMinutes: 'duration',
  daysCount: 'numberOfDays',
  transport: 'transport',
  flight: 'includesFlight',
  overnight: 'overnight',
  onRequest: 'onRequest',
  seoTitle: 'seoTitle',
  seoDescription: 'seoDescription',
  searchKeywords: 'searchKeywords',
  name: 'name',
  shortName: 'shortName',
  headline: 'headline',
  subline: 'supportingText',
  kicker: 'kicker',
  color: 'colour',
  coverMediaId: 'coverImage',
  heroVideoId: 'video',
  perks: 'perks',
  alt: 'description',
  credit: 'credit',
  license: 'licenseRecord',
  rightsStatus: 'rights',
  autoEnhance: 'warmEnhancement',
  focalX: 'focalPoint',
  focalY: 'focalPoint',
  ctaLabel: 'buttonText',
  ctaType: 'buttonGoesTo',
  ctaTarget: 'buttonGoesTo',
  durationS: 'displayTime',
  showOn: 'showsOn',
  startsAt: 'schedule',
  endsAt: 'schedule',
  videoMediaId: 'video',
  imageMediaId: 'fallbackImage',
  status: 'status',
  q: 'question',
  a: 'answer',
};

const isLocalized = (v: unknown) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  typeof (v as Row).en === 'string';

const numeric = (v: unknown) =>
  typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v));
function value(v: unknown, t: T, locale: Locale): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return t(v ? 'yes' : 'no');
  if (isLocalized(v)) return content(v, locale);
  if (Array.isArray(v)) return v.join(', ');
  if (numeric(v))
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      Number(v),
    );
  return String(v);
}
const pct = (v: unknown) =>
  v === null || v === undefined ? '—' : Math.round(Number(v) * 100) + '%';

/** Human sentences for one audit entry ("Price €40 → €35", "Title (FR) changed"). */
export function describeChange(entry: Row, t: T, locale: Locale): string[] {
  const action = String(entry.action),
    entity = String(entity_(entry));
  if (action === 'publish') return [t('diffPublished')];
  if (action === 'unpublish' || action === 'hide')
    return [t('diffUnpublished')];
  if (action === 'archive') return [t('diffArchived')];
  if (action === 'unarchive') return [t('diffUnarchived')];
  if (action === 'restore')
    return [
      obj(entry.after).section === 'archive' &&
      obj(obj(entry.after).values).archivedAt
        ? t('diffUndoCreate')
        : t('diffRestored'),
    ];
  if (action === 'duplicate') return [t('diffDuplicated')];
  if (action === 'create') return [t('diffCreated')];
  if (action === 'reorder') return [t('diffReordered')];
  if (action === 'invite') return [t('diffInvited')];
  if (action === 'bulk_prices') return [t('diffBulkPrices')];
  if (entity === 'trip_prices' || action === 'prices') {
    const before = rows(entry.before).find((p) => p.isPrimary),
      after = rows(entry.after).find((p) => p.isPrimary);
    const from = before
        ? (money(before.amountEur as string, locale) ?? t('onRequest'))
        : null,
      to = after
        ? (money(after.amountEur as string, locale) ?? t('onRequest'))
        : null;
    if (from && to && from !== to) return [t('diffPrice', { from, to })];
    return [t('diffPricesEdited')];
  }
  if (entity === 'trip_itinerary') return [t('diffDayPlan')];
  if (entity === 'trip_items') return [t('diffIncluded')];
  if (entity === 'trip_media') return [t('diffMedia')];
  if (entity === 'page_blocks') return [t('diffPage')];
  const before = obj(obj(entry.before).values ?? entry.before),
    after = obj(entry.after),
    lines: string[] = [];
  // Focal point: one line "50%, 50% → 19%, 62%".
  if ('focalX' in after || 'focalY' in after) {
    const from = pct(before.focalX ?? 0.5) + ', ' + pct(before.focalY ?? 0.5),
      to =
        pct(after.focalX ?? before.focalX) +
        ', ' +
        pct(after.focalY ?? before.focalY);
    if (from !== to)
      lines.push(t('diffFromTo', { field: t('focalPoint'), from, to }));
  }
  for (const key of Object.keys(after)) {
    if (key === 'focalX' || key === 'focalY') continue;
    if (!(key in before) && !fieldKeys[key]) continue;
    const a = before[key],
      b = after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    if (numeric(a) && numeric(b) && Number(a) === Number(b)) continue;
    const label = t(fieldKeys[key] ?? key);
    if (isLocalized(a) || isLocalized(b)) {
      const changed = locales.filter(
        (code) => (obj(a)[code] ?? '') !== (obj(b)[code] ?? ''),
      );
      if (!changed.length) continue;
      lines.push(
        changed.includes('en')
          ? t('diffFieldChanged', { field: label })
          : t('diffFieldLangs', {
              field: label,
              langs: changed.map((c) => c.toUpperCase()).join(', '),
            }),
      );
    } else if (
      (b !== null && typeof b === 'object') ||
      (a !== null && typeof a === 'object') ||
      String(value(a, t, locale)).length > 40 ||
      String(value(b, t, locale)).length > 40
    )
      lines.push(t('diffFieldChanged', { field: label }));
    else
      lines.push(
        t('diffFromTo', {
          field: label,
          // Status codes ("contacted", "published") have their own labels.
          from:
            key === 'status' && typeof a === 'string'
              ? t(a)
              : value(a, t, locale),
          to:
            key === 'status' && typeof b === 'string'
              ? t(b)
              : value(b, t, locale),
        }),
      );
  }
  if (!lines.length && action === 'update') lines.push(t('diffUpdated'));
  return [...new Set(lines)];
}
const entity_ = (entry: Row) => entry.entity;

export const entityKeys: Record<string, string> = {
  trip: 'ent_trip',
  trip_prices: 'ent_trip_prices',
  trip_itinerary: 'ent_trip',
  trip_items: 'ent_trip',
  trip_media: 'ent_trip',
  trip_order: 'ent_trip_order',
  package: 'ent_package',
  collection: 'ent_collection',
  collection_order: 'ent_collection_order',
  hero_slide: 'ent_hero_slide',
  hero_order: 'ent_hero_order',
  media: 'ent_media',
  request: 'ent_request',
  settings: 'ent_settings',
  faq: 'ent_faq',
  page_blocks: 'ent_page',
  user: 'ent_user',
  translation: 'ent_translation',
  translation_draft: 'ent_translation',
  auth: 'ent_account',
  privacy: 'ent_privacy',
};

/** Where an audit entry's item lives in the admin. */
export function entityHref(entry: Row): string | null {
  const id = String(entry.entityId ?? ''),
    entity = String(entry.entity);
  if (
    [
      'trip',
      'trip_prices',
      'trip_itinerary',
      'trip_items',
      'trip_media',
    ].includes(entity)
  )
    return '/trips/' + id;
  if (entity === 'package') return '/packages/' + id;
  if (entity === 'trip_order') return '/trips';
  if (entity === 'collection') return '/collections/' + id;
  if (entity === 'collection_order') return '/collections';
  if (entity === 'hero_slide') return '/hero/' + id;
  if (entity === 'hero_order') return '/hero';
  if (entity === 'media') return '/media/' + id;
  if (entity === 'request') return '/requests/' + id;
  if (entity === 'faq') return '/pages/faq';
  if (entity === 'page_blocks') {
    const key = obj(entry.after).key;
    return key ? '/pages/' + String(key) : '/pages';
  }
  if (entity === 'user') return '/team/' + id;
  if (entity === 'settings') {
    const key = String(obj(entry.after).key ?? '');
    if (key.startsWith('i18n')) return '/settings/languages';
    if (['home', 'how_steps', 'homepage_draft'].includes(key))
      return '/homepage';
    return '/settings';
  }
  if (entity.startsWith('translation')) return '/translations';
  return null;
}
