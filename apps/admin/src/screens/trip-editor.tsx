'use client';
import { useMemo, useState } from 'react';
import { TripStoryEditor } from './trip-story-editor';
import { storyPatch, type Story } from '@stella/shared/story';
import { Plus, X } from 'lucide-react';
import { can } from '@stella/shared/admin';
import { locales, type Locale } from '@stella/shared';
import { useAdmin, useData, ApiError } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { loc, locOut, markReviewed, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { amountString, money, weekday, languageName } from '../lib/format';
import { priceUnits, usePreview, usePriceText } from '../lib/catalog';
import { useTripActions } from '../lib/trip-actions';
import { useGuard } from '../lib/guard';
import { EditorLayout } from '../components/ui/editor';
import {
  FormField,
  FieldGroup,
  I18nField,
  Segmented,
  Toggle,
  useEditLang,
} from '../components/ui/field';
import { StatusMenu, contentStatus } from '../components/ui/status';
import { SortableList } from '../components/ui/sortable';
import {
  MediaPicker,
  MediaSlot,
  MediaThumb,
} from '../components/ui/media-picker';
import { useConfirm } from '../components/ui/dialog';
import { LoadError, Callout } from '../components/ui/states';
import { HistorySection } from '../components/history';
import { useMediaMap } from '../lib/catalog';

let keySeq = 0;
const newKey = () => 'k' + ++keySeq;

const transports = [
  'bus',
  'AC minibus',
  'private car',
  'jeep',
  'plane',
  'boat',
  'yacht',
  'speed boat',
  'bus + ferry',
  'quad',
  'buggy',
  'mixed',
  'transfer',
] as const;
const transportKey = (value: string) =>
  'tr_' + value.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

type PriceRow = {
  key: string;
  id?: string;
  label: Loc;
  amount: string;
  onRequest: boolean;
  unit: string;
  minQty: string;
  maxQty: string;
  validFrom: string;
  validTo: string;
  isPrimary: boolean;
};
type PlanRow = { key: string; id?: string; timeLabel: string; text: Loc };
type ItemRow = {
  key: string;
  id?: string;
  type: string;
  text: Loc;
  extra: string;
};
export type TripState = {
  story: { story: Story | null };
  basics: {
    title: Loc;
    summary: Loc;
    description: Loc;
    collectionId: string;
    slug: string;
  };
  format: {
    format: string;
    privateMode: 'request' | 'supplement';
    surcharge: string;
    showOnHome: boolean;
    familyFriendly: boolean;
    minAge: string;
    featuredOrder: string;
  };
  schedule: {
    runDays: number[];
    onRequest: boolean;
    customDays: boolean;
    daysLabel: Loc;
    departure: string;
    returnTime: string;
    daysCount: string;
    hours: string;
    minutes: string;
    customDuration: boolean;
    durationLabel: Loc;
    transport: string;
    transportOther: string;
    flight: boolean;
    overnight: boolean;
  };
  prices: { rows: PriceRow[] };
  plan: { rows: PlanRow[] };
  included: { rows: ItemRow[] };
  media: { cover: string | null; gallery: string[]; videos: string[] };
  seo: { seoTitle: Loc; seoDescription: Loc };
};

/** Generated per-locale labels (runs on / duration) from structured data. */
export function daysLabelFor(days: number[], every: string) {
  return Object.fromEntries(
    locales.map((code) => [
      code,
      days.length === 7
        ? every
        : [...days]
            .sort()
            .map((d) => weekday(d, code, 'long'))
            .join(' · '),
    ]),
  );
}
function durationLabelFor(daysCount: number, minutes: number | null) {
  return Object.fromEntries(
    locales.map((code) => {
      if (daysCount > 1)
        return [
          code,
          new Intl.NumberFormat(code, {
            style: 'unit',
            unit: 'day',
            unitDisplay: 'long',
          }).format(daysCount),
        ];
      if (!minutes) return [code, ''];
      const h = Math.floor(minutes / 60),
        m = minutes % 60;
      const fmt = (n: number, unit: 'hour' | 'minute') =>
        new Intl.NumberFormat(code, {
          style: 'unit',
          unit,
          unitDisplay: 'narrow',
        }).format(n);
      return [
        code,
        '~' +
          [h ? fmt(h, 'hour') : '', m ? fmt(m, 'minute') : '']
            .filter(Boolean)
            .join(' '),
      ];
    }),
  );
}

function build(
  data: Row,
  translations: Row[],
  privateSlugs: string[],
): TripState {
  const trip = obj(data.trip),
    tl = (key: string, field: string) => loc(trip[key], translations, field);
  const daysCount = Number(trip.daysCount ?? 1),
    minutes =
      trip.durationMinutes == null ? null : Number(trip.durationMinutes),
    runDays = Array.isArray(trip.runDays) ? (trip.runDays as number[]) : [];
  const generatedDuration = durationLabelFor(daysCount, minutes).en,
    durationEn = obj(trip.durationLabel).en;
  const transport = String(trip.transport ?? '');
  const media = rows(data.media).sort(
    (a, b) => Number(a.sort) - Number(b.sort),
  );
  const draft = rows(data.drafts).find((d) => d.section === 'story');
  const story = storyPatch.parse(draft?.data ?? { story: trip.story ?? null });
  return {
    story,
    basics: {
      title: tl('title', 'title'),
      summary: tl('summary', 'summary'),
      description: tl('description', 'description'),
      collectionId: String(trip.collectionId ?? ''),
      slug: String(trip.slug ?? ''),
    },
    format: {
      format: String(trip.format ?? 'group'),
      privateMode:
        trip.privateSurchargePct != null && !trip.privateOnRequest
          ? 'supplement'
          : 'request',
      surcharge:
        trip.privateSurchargePct == null
          ? ''
          : String(Number(trip.privateSurchargePct)),
      showOnHome: privateSlugs.includes(String(trip.slug)),
      familyFriendly: !!trip.familyFriendly,
      minAge: trip.minAge == null ? '' : String(trip.minAge),
      featuredOrder:
        trip.featuredOrder == null ? '' : String(trip.featuredOrder),
    },
    schedule: {
      runDays,
      onRequest: !!trip.onRequest,
      customDays: !runDays.length && !!obj(trip.daysLabel).en,
      daysLabel: tl('daysLabel', 'days_label'),
      departure: String(trip.departureLabel ?? ''),
      returnTime: String(trip.returnLabel ?? ''),
      daysCount: String(daysCount),
      hours: minutes == null ? '' : String(Math.floor(minutes / 60)),
      minutes: minutes == null ? '' : String(minutes % 60),
      customDuration: !!durationEn && durationEn !== generatedDuration,
      durationLabel: tl('durationLabel', 'duration_label'),
      transport: !transport
        ? ''
        : (transports as readonly string[]).includes(transport)
          ? transport
          : 'other',
      transportOther: (transports as readonly string[]).includes(transport)
        ? ''
        : transport,
      flight: !!trip.flight,
      overnight: !!trip.overnight,
    },
    prices: {
      rows: rows(data.prices)
        .sort((a, b) => Number(a.sort) - Number(b.sort))
        .map((p) => ({
          key: String(p.id),
          id: String(p.id),
          label: loc(p.label),
          amount: p.amountEur == null ? '' : String(Number(p.amountEur)),
          onRequest: p.amountEur == null,
          unit: String(p.unit),
          minQty: p.minQty == null ? '' : String(p.minQty),
          maxQty: p.maxQty == null ? '' : String(p.maxQty),
          validFrom: String(p.validFrom ?? ''),
          validTo: String(p.validTo ?? ''),
          isPrimary: !!p.isPrimary,
        })),
    },
    plan: {
      rows: rows(data.itinerary)
        .sort((a, b) => Number(a.sort) - Number(b.sort))
        .map((r) => ({
          key: String(r.id),
          id: String(r.id),
          timeLabel: String(r.timeLabel ?? ''),
          text: loc(r.text),
        })),
    },
    included: {
      rows: rows(data.items)
        .sort((a, b) => Number(a.sort) - Number(b.sort))
        .map((r) => ({
          key: String(r.id),
          id: String(r.id),
          type: String(r.type),
          text: loc(r.text),
          extra: r.extraPriceEur == null ? '' : String(Number(r.extraPriceEur)),
        })),
    },
    media: {
      cover:
        String(media.find((m) => m.role === 'cover')?.mediaId ?? '') || null,
      gallery: media
        .filter((m) => m.role === 'gallery')
        .map((m) => String(m.mediaId)),
      videos: media
        .filter((m) => m.role === 'video')
        .map((m) => String(m.mediaId)),
    },
    seo: {
      seoTitle: tl('seoTitle', 'seo_title'),
      seoDescription: tl('seoDescription', 'seo_description'),
    },
  };
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function TripEditor({ id }: { id: string }) {
  const { t, locale, me, write } = useAdmin(),
    query = useData<Row>('/v1/admin/trips/' + id),
    translations = useData<Row[]>(`/v1/admin/i18n/values?entity=trip&id=${id}`),
    homepage = useData<Row>('/v1/admin/homepage'),
    collections = useData<Row[]>('/v1/admin/collections'),
    preview = usePreview(),
    actions = useTripActions('trip'),
    confirm = useConfirm(),
    { navigate } = useGuard(),
    role = me!.role,
    canPrices = can(role, 'prices');
  const home = obj(homepage.data?.draft ?? homepage.data);
  const privateSlugs = useMemo(() => {
    const slugs = obj(home.home).private_trip_slugs;
    return Array.isArray(slugs) ? (slugs as string[]) : [];
  }, [home]);
  const ready = query.data && translations.data && homepage.data;
  const initial = useMemo(
    () => (ready ? build(query.data!, translations.data!, privateSlugs) : null),
    [
      ready,
      query.dataUpdatedAt,
      translations.dataUpdatedAt,
      homepage.dataUpdatedAt,
    ],
  );
  const trip = obj(query.data?.trip);
  const labels = {
    story: t('tripStory'),
    basics: t('basics'),
    format: t('formatAudience'),
    schedule: t('schedule'),
    prices: t('prices'),
    plan: t('dayPlan'),
    included: t('whatsIncluded'),
    media: t('media'),
    seo: t('searchAppearance'),
  };
  const patch = async (section: string, body: unknown) =>
    (await write('/v1/admin/trips/' + id + '/' + section, 'PATCH', body))
      .revisions;
  const editor = useEditor<TripState>({
    id: 'trip-' + id,
    initial,
    sourceKey:
      String(query.dataUpdatedAt) +
      ':' +
      translations.dataUpdatedAt +
      ':' +
      homepage.dataUpdatedAt,
    order: [
      'basics',
      'format',
      'schedule',
      'prices',
      'plan',
      'story',
      'included',
      'media',
      'seo',
    ],
    labels,
    success: t('tripSaved'),
    afterSave: () =>
      Promise.all([
        query.refetch(),
        translations.refetch(),
        homepage.refetch(),
      ]),
    validate: {
      basics: (v) =>
        !(v.title.raw.en ?? '').trim()
          ? t('titleRequired')
          : !/^[a-z0-9-]{1,120}$/.test(v.slug)
            ? t('slugInvalid')
            : null,
      format: (v) =>
        v.format === 'both' &&
        v.privateMode === 'supplement' &&
        (v.surcharge === '' || Number(v.surcharge) < 0)
          ? t('supplementRequired')
          : null,
      schedule: (v) =>
        !(Number(v.daysCount) >= 1)
          ? t('daysCountInvalid')
          : v.customDays && !(v.daysLabel.raw.en ?? '').trim()
            ? t('customLabelRequired')
            : null,
      prices: (v) =>
        !v.rows.length
          ? t('pricesNeedRow')
          : v.rows.filter((r) => r.isPrimary).length !== 1
            ? t('pricesNeedMain')
            : v.rows.some(
                  (r) =>
                    !r.onRequest && !(Number(r.amount) >= 0 && r.amount !== ''),
                )
              ? t('pricesInvalidAmount')
              : null,
    },
    savers: {
      story: (value) => patch('story', value),
      basics: (v) =>
        patch('basics', {
          title: locOut(v.title),
          summary: locOut(v.summary),
          description: locOut(v.description),
          collectionId: v.collectionId,
          slug: v.slug,
        }),
      format: async (v, all) => {
        const ids = await patch('basics', {
          format: v.format,
          privateOnRequest: v.format === 'both' && v.privateMode === 'request',
          ...(canPrices
            ? {
                privateSurchargePct:
                  v.format === 'both' && v.privateMode === 'supplement'
                    ? Number(v.surcharge)
                    : null,
              }
            : {}),
          familyFriendly: v.familyFriendly,
          minAge: num(v.minAge),
          featuredOrder: num(v.featuredOrder),
        });
        if (v.showOnHome !== initial?.format.showOnHome) {
          const slug = all.basics.slug,
            current = privateSlugs.filter((s) => s !== String(trip.slug));
          const next = v.showOnHome ? [...current, slug] : current;
          const result = await write('/v1/admin/homepage', 'PUT', {
            home: { ...obj(home.home), private_trip_slugs: next },
            how_steps: home.how_steps,
            private_perks: home.private_perks,
            publish: can(role, 'publish'),
          });
          ids.push(...result.revisions);
        }
        return ids;
      },
      schedule: (v) => {
        const daysCount = Number(v.daysCount),
          minutes =
            daysCount === 1 && (v.hours !== '' || v.minutes !== '')
              ? Number(v.hours || 0) * 60 + Number(v.minutes || 0) || null
              : null;
        return patch('schedule', {
          runDays: v.onRequest
            ? null
            : v.runDays.length
              ? [...v.runDays].sort()
              : null,
          onRequest: v.onRequest,
          daysLabel:
            v.customDays || v.onRequest || !v.runDays.length
              ? locOut(v.daysLabel)
              : daysLabelFor(v.runDays, t('everyDay')),
          departureLabel: v.departure.trim() || null,
          returnLabel: v.returnTime.trim() || null,
          daysCount,
          durationMinutes: minutes,
          durationLabel: v.customDuration
            ? locOut(v.durationLabel)
            : (() => {
                const generated = durationLabelFor(daysCount, minutes);
                return generated.en ? generated : null;
              })(),
          transport:
            v.transport === 'other'
              ? v.transportOther.trim() || null
              : v.transport || null,
          flight: v.flight,
          overnight: v.overnight,
        });
      },
      prices: async (v) => {
        const body = {
          rows: v.rows.map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            label: locOut(r.label),
            amountEur: r.onRequest ? null : Number(amountString(r.amount)),
            unit: r.unit,
            minQty: num(r.minQty),
            maxQty: num(r.maxQty),
            isPrimary: r.isPrimary,
            validFrom: r.validFrom || null,
            validTo: r.validTo || null,
          })),
        };
        try {
          return (await write('/v1/admin/trips/' + id + '/prices', 'PUT', body))
            .revisions;
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.code === 'PRICE_CONFIRMATION_REQUIRED'
          ) {
            const ok = await confirm({
              title: t('largePriceTitle'),
              body: t('confirmLarge'),
              confirmLabel: t('savePrices'),
            });
            if (!ok) throw error;
            return (
              await write('/v1/admin/trips/' + id + '/prices', 'PUT', {
                ...body,
                confirmLargeChange: true,
              })
            ).revisions;
          }
          throw error;
        }
      },
      plan: async (v) =>
        (
          await write('/v1/admin/trips/' + id + '/itinerary', 'PUT', {
            rows: v.rows.map((r) => ({
              ...(r.id ? { id: r.id } : {}),
              timeLabel: r.timeLabel.trim() || null,
              text: locOut(r.text),
            })),
          })
        ).revisions,
      included: async (v) =>
        (
          await write('/v1/admin/trips/' + id + '/items', 'PUT', {
            rows: itemTypes.flatMap((type) =>
              v.rows
                .filter((r) => r.type === type)
                .map((r) => ({
                  ...(r.id ? { id: r.id } : {}),
                  type: r.type,
                  text: locOut(r.text),
                  extraPriceEur:
                    r.type === 'optional' && r.extra !== ''
                      ? Number(r.extra)
                      : null,
                })),
            ),
          })
        ).revisions,
      media: async (v) =>
        (
          await write('/v1/admin/trips/' + id + '/media', 'PUT', {
            rows: [
              ...(v.cover ? [{ mediaId: v.cover, role: 'cover' }] : []),
              ...v.gallery
                .filter((m) => m !== v.cover)
                .map((mediaId) => ({ mediaId, role: 'gallery' })),
              ...v.videos.map((mediaId) => ({ mediaId, role: 'video' })),
            ],
          })
        ).revisions,
      seo: (v) =>
        patch('seo', {
          seoTitle: locOut(v.seoTitle),
          seoDescription: locOut(v.seoDescription),
        }),
    },
  });
  if (query.isError)
    return (
      <div className="page">
        <LoadError retry={() => void query.refetch()} />
      </div>
    );
  const v = editor.values,
    name = content(trip.title, locale) || t('untitled'),
    status = contentStatus(trip),
    missing = v
      ? locales.filter(
          (code) =>
            !(code === 'en'
              ? v.basics.title.raw.en
              : v.basics.title.raw[code] || v.basics.title.fb[code]),
        )
      : [];
  const normalCollections = (collections.data ?? []).filter(
    (c) => c.kind === 'normal',
  );
  const sections = v
    ? [
        {
          id: 'basics',
          label: labels.basics,
          content: (
            <BasicsSection
              v={v.basics}
              set={(next) => editor.set('basics', next)}
              collections={normalCollections}
              originalSlug={String(trip.slug ?? '')}
              showErrors={editor.showErrors}
            />
          ),
        },
        {
          id: 'format',
          label: labels.format,
          content: (
            <FormatSection
              v={v.format}
              set={(next) => editor.set('format', next)}
              canPrices={canPrices}
              published={status === 'published'}
              loadedShowOnHome={!!editor.base?.format.showOnHome}
            />
          ),
        },
        {
          id: 'schedule',
          label: labels.schedule,
          content: (
            <ScheduleSection
              v={v.schedule}
              set={(next) => editor.set('schedule', next)}
              showErrors={editor.showErrors}
            />
          ),
        },
        {
          id: 'prices',
          label: labels.prices,
          hidden: !canPrices,
          content: (
            <PricesSection
              v={v.prices}
              set={(next) => editor.set('prices', next)}
              onRequestTrip={v.schedule.onRequest}
            />
          ),
        },
        {
          id: 'plan',
          label: labels.plan,
          content: (
            <PlanSection
              v={v.plan}
              set={(next) => editor.set('plan', next)}
              showErrors={editor.showErrors}
            />
          ),
        },
        {
          id: 'included',
          label: labels.included,
          content: (
            <IncludedSection
              v={v.included}
              set={(next) => editor.set('included', next)}
              showErrors={editor.showErrors}
            />
          ),
        },
        {
          id: 'story',
          label: labels.story,
          content: (
            <TripStoryEditor
              value={v.story.story}
              onChange={(story) => editor.set('story', { story })}
            />
          ),
        },
        {
          id: 'media',
          label: labels.media,
          content: (
            <TripMediaSection
              v={v.media}
              set={(next) => editor.set('media', next)}
            />
          ),
        },
        {
          id: 'seo',
          label: labels.seo,
          content: (
            <SeoSection
              v={v.seo}
              set={(next) => editor.set('seo', next)}
              title={v.basics.title}
              summary={v.basics.summary}
              slug={v.basics.slug}
              kind="t"
            />
          ),
        },
        {
          id: 'history',
          label: t('history'),
          content: (
            <HistorySection
              entities={[
                'trip',
                ...(canPrices ? ['trip_prices'] : []),
                'trip_itinerary',
                'trip_items',
                'trip_media',
              ]}
              id={id}
              auditEntity="trip"
            />
          ),
        },
      ]
    : [];
  const drafts = rows(query.data?.drafts);
  return (
    <EditorLayout
      back={{ href: '/trips', label: t('trips') }}
      title={v ? content(v.basics.title.raw, locale) || name : t('loading')}
      loading={!v}
      editor={editor as never}
      sections={sections}
      onMarkReviewed={(code: Locale) =>
        v && editor.replaceAll(markReviewed(v, code))
      }
      banner={
        <>
          {status === 'archived' && (
            <Callout tone="warning">{t('archivedBanner')}</Callout>
          )}
          {drafts.length > 0 && (
            <Callout tone="info">{t('pendingDrafts')}</Callout>
          )}
          {role === 'editor' && status === 'published' && (
            <Callout tone="info">{t('editorDraftNote')}</Callout>
          )}
        </>
      }
      actions={
        <button
          type="button"
          className="btn"
          onClick={() => void preview('t', String(trip.slug))}
        >
          {t('preview')}
        </button>
      }
      status={
        <StatusMenu
          status={status}
          name={name}
          canPublish={can(role, 'publish')}
          missingLocales={missing.map((code) => languageName(code, locale))}
          onPublish={async () => {
            if (editor.dirty.length && !(await editor.save())) return;
            await actions.publish(id);
          }}
          onUnpublish={() => actions.unpublish(id)}
          onArchive={
            can(role, 'publish')
              ? () => actions.archive(id, () => void navigate('/trips'))
              : undefined
          }
          onUnarchive={
            can(role, 'publish') ? () => actions.unarchive(id) : undefined
          }
        />
      }
      menu={[
        { label: t('duplicate'), onSelect: () => void actions.duplicate(id) },
        {
          label: t('viewHistory'),
          onSelect: () =>
            document
              .getElementById('section-history')
              ?.scrollIntoView({ behavior: 'smooth' }),
        },
        {
          label: t('copyPageAddress'),
          onSelect: () =>
            void navigator.clipboard?.writeText(
              '/' + locale + '/t/' + String(trip.slug),
            ),
        },
        ...(can(role, 'publish')
          ? actions.archiveMenu(id, name, status === 'archived')
          : []),
      ]}
    />
  );
}

/* ---------- sections ---------- */

export function BasicsSection({
  v,
  set,
  collections,
  originalSlug,
  showErrors,
  slugPrefix = '…/en/t/',
}: {
  v: TripState['basics'];
  set: (v: TripState['basics']) => void;
  collections?: Row[];
  originalSlug: string;
  showErrors: boolean;
  slugPrefix?: string;
}) {
  const { t, locale } = useAdmin();
  return (
    <>
      <I18nField
        label={t('title')}
        value={v.title}
        onChange={(title) => set({ ...v, title })}
        required
        showErrors={showErrors}
      />
      <I18nField
        label={t('summary')}
        value={v.summary}
        onChange={(summary) => set({ ...v, summary })}
        multiline
        showErrors={showErrors}
      />
      <I18nField
        label={t('description')}
        value={v.description}
        onChange={(description) => set({ ...v, description })}
        multiline
        showErrors={showErrors}
      />
      {collections && (
        <FormField label={t('collection')}>
          {(p) => (
            <select
              {...p}
              value={v.collectionId}
              onChange={(e) => set({ ...v, collectionId: e.target.value })}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {content(c.name, locale)}
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}
      <FormField
        label={t('pageAddress')}
        hint={v.slug !== originalSlug ? undefined : t('slugHint')}
        error={v.slug !== originalSlug ? t('slugWarning') : undefined}
      >
        {(p) => (
          <div className="prefixed">
            <span className="prefix" aria-hidden>
              {slugPrefix}
            </span>
            <input
              {...p}
              value={v.slug}
              spellCheck={false}
              maxLength={120}
              onChange={(e) =>
                set({
                  ...v,
                  slug: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-'),
                })
              }
            />
          </div>
        )}
      </FormField>
    </>
  );
}

function FormatSection({
  v,
  set,
  canPrices,
  published,
  loadedShowOnHome,
}: {
  v: TripState['format'];
  set: (v: TripState['format']) => void;
  canPrices: boolean;
  published: boolean;
  loadedShowOnHome: boolean;
}) {
  const { t } = useAdmin();
  return (
    <>
      <FieldGroup legend={t('format')} hint={t('formatHint')}>
        <Segmented
          label={t('format')}
          value={v.format}
          onChange={(format) =>
            set({
              ...v,
              format,
              // Group-only trips can't be in the Private section; switching back restores it.
              showOnHome: format === 'group' ? false : loadedShowOnHome,
            })
          }
          options={[
            { value: 'group', label: t('fmtGroup') },
            { value: 'private', label: t('fmtPrivate') },
            { value: 'both', label: t('fmtBoth') },
          ]}
        />
      </FieldGroup>
      {v.format === 'both' && (
        <FieldGroup legend={t('privatePrice')}>
          <Segmented
            label={t('privatePrice')}
            value={v.privateMode}
            onChange={(privateMode) => set({ ...v, privateMode })}
            disabled={!canPrices}
            options={[
              { value: 'request', label: t('privateOnRequestOpt') },
              { value: 'supplement', label: t('privateSupplementOpt') },
            ]}
          />
          {v.privateMode === 'supplement' && (
            <FormField
              label={t('privateSupplement')}
              hint={t('privateSupplementHint')}
            >
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={999}
                  disabled={!canPrices}
                  value={v.surcharge}
                  onChange={(e) => set({ ...v, surcharge: e.target.value })}
                />
              )}
            </FormField>
          )}
        </FieldGroup>
      )}
      {v.format !== 'group' && (
        <Toggle
          checked={v.showOnHome}
          onChange={(showOnHome) => set({ ...v, showOnHome })}
          label={t('showPrivate')}
          hint={published ? t('showPrivateHint') : t('showPrivateNeedsPublish')}
          disabled={!published && !v.showOnHome}
        />
      )}
      <Toggle
        checked={v.familyFriendly}
        onChange={(familyFriendly) => set({ ...v, familyFriendly })}
        label={t('familyFriendly')}
      />
      <div className="field-row-2">
        <FormField label={t('minAge')} hint={t('optional')}>
          {(p) => (
            <input
              {...p}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={v.minAge}
              onChange={(e) => set({ ...v, minAge: e.target.value })}
            />
          )}
        </FormField>
        <FormField label={t('featuredOrder')} hint={t('featuredOrderHint')}>
          {(p) => (
            <input
              {...p}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              value={v.featuredOrder}
              onChange={(e) => set({ ...v, featuredOrder: e.target.value })}
            />
          )}
        </FormField>
      </div>
    </>
  );
}

function ScheduleSection({
  v,
  set,
  showErrors,
}: {
  v: TripState['schedule'];
  set: (v: TripState['schedule']) => void;
  showErrors: boolean;
}) {
  const { t, locale } = useAdmin(),
    every = v.runDays.length === 7;
  const toggleDay = (day: number) =>
    set({
      ...v,
      runDays: v.runDays.includes(day)
        ? v.runDays.filter((d) => d !== day)
        : [...v.runDays, day].sort(),
    });
  return (
    <>
      <FieldGroup
        legend={t('runsOn')}
        hint={v.onRequest ? t('onRequestDaysHint') : t('runsOnHint')}
      >
        <div className="chip-row">
          {Array.from({ length: 7 }, (_, day) => (
            <button
              key={day}
              type="button"
              className="chip-toggle"
              aria-pressed={v.runDays.includes(day) && !v.onRequest}
              disabled={v.onRequest}
              onClick={() => toggleDay(day)}
              title={weekday(day, locale, 'long')}
            >
              {weekday(day, locale, 'short')}
            </button>
          ))}
          <button
            type="button"
            className="chip-toggle"
            aria-pressed={every && !v.onRequest}
            disabled={v.onRequest}
            onClick={() =>
              set({ ...v, runDays: every ? [] : [0, 1, 2, 3, 4, 5, 6] })
            }
          >
            {t('everyDay')}
          </button>
          <button
            type="button"
            className="chip-toggle"
            aria-pressed={v.onRequest}
            onClick={() => set({ ...v, onRequest: !v.onRequest })}
          >
            {t('onRequest')}
          </button>
        </div>
      </FieldGroup>
      <details className="advanced" open={v.customDays}>
        <summary>{t('customDaysLabel')}</summary>
        <Toggle
          checked={v.customDays}
          onChange={(customDays) => set({ ...v, customDays })}
          label={t('useCustomLabel')}
          hint={t('customDaysHint')}
        />
        {v.customDays && (
          <I18nField
            label={t('runsOnLabel')}
            value={v.daysLabel}
            onChange={(daysLabel) => set({ ...v, daysLabel })}
            showErrors={showErrors}
          />
        )}
      </details>
      <div className="field-row-2">
        <FormField label={t('departureTime')} hint={t('timeHint')}>
          {(p) => (
            <input
              {...p}
              value={v.departure}
              maxLength={100}
              placeholder="07:30"
              onChange={(e) => set({ ...v, departure: e.target.value })}
            />
          )}
        </FormField>
        <FormField label={t('returnTime')} hint={t('timeHint')}>
          {(p) => (
            <input
              {...p}
              value={v.returnTime}
              maxLength={100}
              placeholder="17:00"
              onChange={(e) => set({ ...v, returnTime: e.target.value })}
            />
          )}
        </FormField>
      </div>
      <div className="field-row-3">
        <FormField label={t('numberOfDays')}>
          {(p) => (
            <input
              {...p}
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={v.daysCount}
              onChange={(e) => set({ ...v, daysCount: e.target.value })}
            />
          )}
        </FormField>
        {Number(v.daysCount) === 1 && (
          <>
            <FormField label={t('hours')}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={24}
                  value={v.hours}
                  onChange={(e) => set({ ...v, hours: e.target.value })}
                />
              )}
            </FormField>
            <FormField label={t('minutes')}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  step={5}
                  value={v.minutes}
                  onChange={(e) => set({ ...v, minutes: e.target.value })}
                />
              )}
            </FormField>
          </>
        )}
      </div>
      <details className="advanced" open={v.customDuration}>
        <summary>{t('customDurationLabel')}</summary>
        <Toggle
          checked={v.customDuration}
          onChange={(customDuration) => set({ ...v, customDuration })}
          label={t('useCustomLabel')}
          hint={t('customDurationHint')}
        />
        {v.customDuration && (
          <I18nField
            label={t('duration')}
            value={v.durationLabel}
            onChange={(durationLabel) => set({ ...v, durationLabel })}
            showErrors={showErrors}
          />
        )}
      </details>
      <FormField label={t('transport')}>
        {(p) => (
          <select
            {...p}
            value={v.transport}
            onChange={(e) => set({ ...v, transport: e.target.value })}
          >
            <option value="">{t('notSet')}</option>
            {transports.map((value) => (
              <option key={value} value={value}>
                {t(transportKey(value))}
              </option>
            ))}
            <option value="other">{t('otherEllipsis')}</option>
          </select>
        )}
      </FormField>
      {v.transport === 'other' && (
        <FormField label={t('transportOther')}>
          {(p) => (
            <input
              {...p}
              value={v.transportOther}
              maxLength={80}
              onChange={(e) => set({ ...v, transportOther: e.target.value })}
            />
          )}
        </FormField>
      )}
      <Toggle
        checked={v.flight}
        onChange={(flight) => set({ ...v, flight })}
        label={t('includesFlight')}
      />
      <Toggle
        checked={v.overnight}
        onChange={(overnight) => set({ ...v, overnight })}
        label={t('overnight')}
      />
    </>
  );
}

export function PricesSection({
  v,
  set,
  onRequestTrip,
}: {
  v: TripState['prices'];
  set: (v: TripState['prices']) => void;
  onRequestTrip: boolean;
}) {
  const { t, locale } = useAdmin(),
    priceText = usePriceText(),
    primary = v.rows.find((r) => r.isPrimary);
  const update = (index: number, patch: Partial<PriceRow>) =>
    set({ rows: v.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  return (
    <>
      <p className="preview-line">
        {t('shownAs')}{' '}
        <strong>
          {primary
            ? t('fromPrice', {
                price: priceText(
                  {
                    amountEur: primary.onRequest
                      ? null
                      : primary.amount || null,
                    unit: primary.unit,
                  },
                  onRequestTrip || primary.onRequest,
                ),
              })
            : t('onRequest')}
        </strong>
      </p>
      <SortableList
        items={v.rows}
        getKey={(r) => r.key}
        itemName={(r, i) =>
          content(r.label.raw, locale) || t('priceRowN', { n: i + 1 })
        }
        onChange={(next) => set({ rows: next })}
        onRemove={(index) => {
          const next = v.rows.filter((_, i) => i !== index);
          if (v.rows[index]?.isPrimary && next[0])
            next[0] = { ...next[0], isPrimary: true };
          set({ rows: next });
        }}
        render={(r, index) => (
          <div className="price-row">
            <div className="price-main">
              <label className="radio-main">
                <input
                  type="radio"
                  name="main-price"
                  checked={r.isPrimary}
                  onChange={() =>
                    set({
                      rows: v.rows.map((x, i) => ({
                        ...x,
                        isPrimary: i === index,
                      })),
                    })
                  }
                />
                <span>{t('mainPriceShort')}</span>
              </label>
              <FormField label={t('amountEur')} className="price-amount">
                {(p) =>
                  r.onRequest ? (
                    <span className="pill-onrequest" id={p.id}>
                      {t('onRequest')}
                    </span>
                  ) : (
                    <input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={r.amount}
                      onChange={(e) =>
                        update(index, { amount: e.target.value })
                      }
                      onBlur={() =>
                        r.amount !== '' &&
                        update(index, {
                          amount: String(Number(amountString(r.amount))),
                        })
                      }
                    />
                  )
                }
              </FormField>
              <FormField label={t('per')}>
                {(p) => (
                  <select
                    {...p}
                    value={r.unit}
                    onChange={(e) => update(index, { unit: e.target.value })}
                  >
                    {priceUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        {t('unitName_' + unit)}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <Toggle
                checked={r.onRequest}
                onChange={(onRequest) =>
                  update(index, {
                    onRequest,
                    ...(onRequest ? { amount: '' } : {}),
                  })
                }
                label={t('onRequest')}
              />
            </div>
            <I18nField
              label={t('priceLabel')}
              placeholder={t('priceLabelPlaceholder')}
              value={r.label}
              onChange={(label) => update(index, { label })}
            />
            <details className="advanced">
              <summary>{t('capacitySeasonal')}</summary>
              <div className="field-row-2">
                <FormField label={t('minQty')}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      min={1}
                      max={100}
                      value={r.minQty}
                      onChange={(e) =>
                        update(index, { minQty: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField label={t('maxQty')}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      min={1}
                      max={100}
                      value={r.maxQty}
                      onChange={(e) =>
                        update(index, { maxQty: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField label={t('validFrom')}>
                  {(p) => (
                    <input
                      {...p}
                      type="date"
                      value={r.validFrom}
                      onChange={(e) =>
                        update(index, { validFrom: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField label={t('validTo')}>
                  {(p) => (
                    <input
                      {...p}
                      type="date"
                      value={r.validTo}
                      onChange={(e) =>
                        update(index, { validTo: e.target.value })
                      }
                    />
                  )}
                </FormField>
              </div>
            </details>
            {r.amount !== '' && !r.onRequest && (
              <p className="muted small">{money(r.amount, locale)}</p>
            )}
          </div>
        )}
      />
      <button
        type="button"
        className="btn"
        onClick={() =>
          set({
            rows: [
              ...v.rows,
              {
                key: newKey(),
                label: loc(null),
                amount: '',
                onRequest: false,
                unit: 'person',
                minQty: '',
                maxQty: '',
                validFrom: '',
                validTo: '',
                isPrimary: !v.rows.length,
              },
            ],
          })
        }
      >
        <Plus size={18} aria-hidden />
        {t('addPriceRow')}
      </button>
    </>
  );
}

function PlanSection({
  v,
  set,
  showErrors,
}: {
  v: TripState['plan'];
  set: (v: TripState['plan']) => void;
  showErrors: boolean;
}) {
  const { t, locale } = useAdmin();
  return (
    <>
      {!v.rows.length && <p className="muted">{t('noStepsYet')}</p>}
      <SortableList
        items={v.rows}
        getKey={(r) => r.key}
        itemName={(r, i) =>
          r.timeLabel || content(r.text.raw, locale) || t('stepN', { n: i + 1 })
        }
        onChange={(rows) => set({ rows })}
        onRemove={(index) =>
          set({ rows: v.rows.filter((_, i) => i !== index) })
        }
        render={(r, index) => (
          <div className="plan-row">
            <FormField label={t('time')} className="plan-time">
              {(p) => (
                <input
                  {...p}
                  value={r.timeLabel}
                  placeholder="07:30"
                  maxLength={100}
                  onChange={(e) =>
                    set({
                      rows: v.rows.map((x, i) =>
                        i === index ? { ...x, timeLabel: e.target.value } : x,
                      ),
                    })
                  }
                />
              )}
            </FormField>
            <I18nField
              label={t('whatHappens')}
              value={r.text}
              multiline
              required
              showErrors={showErrors}
              onChange={(text) =>
                set({
                  rows: v.rows.map((x, i) =>
                    i === index ? { ...x, text } : x,
                  ),
                })
              }
            />
          </div>
        )}
      />
      <button
        type="button"
        className="btn"
        onClick={() =>
          set({
            rows: [
              ...v.rows,
              { key: newKey(), timeLabel: '', text: loc(null) },
            ],
          })
        }
      >
        <Plus size={18} aria-hidden />
        {t('addStep')}
      </button>
    </>
  );
}

const itemTypes = [
  'include',
  'exclude',
  'optional',
  'bring',
  'highlight',
] as const;
function IncludedSection({
  v,
  set,
  showErrors,
}: {
  v: TripState['included'];
  set: (v: TripState['included']) => void;
  showErrors: boolean;
}) {
  const { t, locale } = useAdmin();
  return (
    <>
      {itemTypes.map((type) => {
        const list = v.rows.filter((r) => r.type === type);
        const replace = (next: ItemRow[]) =>
          set({ rows: [...v.rows.filter((r) => r.type !== type), ...next] });
        return (
          <div key={type} className="sublist">
            <h3>{t('itemType_' + type)}</h3>
            <SortableList
              items={list}
              getKey={(r) => r.key}
              itemName={(r) =>
                content(r.text.raw, locale) || t('itemType_' + type)
              }
              onChange={replace}
              onRemove={(index) => replace(list.filter((_, i) => i !== index))}
              render={(r, index) => (
                <div
                  className={
                    type === 'optional' ? 'item-row with-price' : 'item-row'
                  }
                >
                  <I18nField
                    label={t('text')}
                    value={r.text}
                    required
                    showErrors={showErrors}
                    onChange={(text) =>
                      replace(
                        list.map((x, i) => (i === index ? { ...x, text } : x)),
                      )
                    }
                  />
                  {type === 'optional' && (
                    <FormField label={t('extraPrice')} hint={t('optional')}>
                      {(p) => (
                        <input
                          {...p}
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.extra}
                          onChange={(e) =>
                            replace(
                              list.map((x, i) =>
                                i === index
                                  ? { ...x, extra: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      )}
                    </FormField>
                  )}
                </div>
              )}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                replace([
                  ...list,
                  { key: newKey(), type, text: loc(null), extra: '' },
                ])
              }
            >
              <Plus size={16} aria-hidden />
              {t('addTo_' + type)}
            </button>
          </div>
        );
      })}
    </>
  );
}

export function TripMediaSection({
  v,
  set,
}: {
  v: TripState['media'];
  set: (v: TripState['media']) => void;
}) {
  const { t, locale } = useAdmin(),
    media = useMediaMap(),
    [picking, setPicking] = useState(false);
  return (
    <>
      <MediaSlot
        label={t('coverImage')}
        kind="image"
        mediaId={v.cover}
        hint={t('coverHint')}
        onChange={(cover) =>
          set({ ...v, cover, gallery: v.gallery.filter((g) => g !== cover) })
        }
      />
      <div className="field">
        <div className="field-label">
          <span className="label-text">{t('gallery')}</span>
        </div>
        {!v.gallery.length && <p className="muted">{t('galleryEmpty')}</p>}
        <SortableList
          items={v.gallery}
          getKey={(mid) => mid}
          itemName={(mid) =>
            content(media.get(mid)?.alt, locale) || t('untitledMedia')
          }
          onChange={(gallery) => set({ ...v, gallery })}
          onRemove={(index) =>
            set({ ...v, gallery: v.gallery.filter((_, i) => i !== index) })
          }
          extraMenu={(mid) => [
            {
              label: t('makeCover'),
              onSelect: () =>
                set({
                  ...v,
                  cover: mid,
                  gallery: v.gallery
                    .filter((g) => g !== mid)
                    .concat(v.cover ? [v.cover] : []),
                }),
            },
          ]}
          render={(mid) => (
            <div className="gallery-row">
              <MediaThumb media={media.get(mid)} size={56} />
              <span className="truncate">
                {content(media.get(mid)?.alt, locale) || t('untitledMedia')}
              </span>
              <span className="chip">{t('gallery')}</span>
            </div>
          )}
        />
        <button type="button" className="btn" onClick={() => setPicking(true)}>
          <Plus size={18} aria-hidden />
          {t('addToGallery')}
        </button>
      </div>
      {v.videos.length > 0 && (
        <div className="field">
          <div className="field-label">
            <span className="label-text">{t('videos')}</span>
          </div>
          <ul className="inline-media">
            {v.videos.map((mid) => (
              <li key={mid}>
                <MediaThumb media={media.get(mid)} size={56} />
                <span className="truncate">
                  {content(media.get(mid)?.alt, locale)}
                </span>
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label={t('removeNamed', {
                    name: content(media.get(mid)?.alt, locale),
                  })}
                  onClick={() =>
                    set({ ...v, videos: v.videos.filter((x) => x !== mid) })
                  }
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {picking && (
        <MediaPicker
          kind="image"
          multiple
          title={t('addToGallery')}
          selected={v.gallery}
          onClose={() => setPicking(false)}
          onDone={(ids) => {
            set({ ...v, gallery: ids.filter((id) => id !== v.cover) });
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

export function SeoSection({
  v,
  set,
  title,
  summary,
  slug,
  kind,
}: {
  v: { seoTitle: Loc; seoDescription: Loc };
  set: (v: { seoTitle: Loc; seoDescription: Loc }) => void;
  title: Loc;
  summary: Loc;
  slug: string;
  kind: 't' | 'c';
}) {
  const { t, webOrigin } = useAdmin();
  return (
    <>
      <p className="muted">{t('seoFallback')}</p>
      <I18nField
        label={t('seoTitle')}
        value={v.seoTitle}
        limit={60}
        onChange={(seoTitle) => set({ ...v, seoTitle })}
      />
      <I18nField
        label={t('seoDescription')}
        value={v.seoDescription}
        limit={160}
        multiline
        onChange={(seoDescription) => set({ ...v, seoDescription })}
      />
      <SerpPreview
        v={v}
        title={title}
        summary={summary}
        slug={slug}
        kind={kind}
        origin={webOrigin}
      />
    </>
  );
}

function SerpPreview({
  v,
  title,
  summary,
  slug,
  kind,
  origin,
}: {
  v: { seoTitle: Loc; seoDescription: Loc };
  title: Loc;
  summary: Loc;
  slug: string;
  kind: string;
  origin: string;
}) {
  const { t } = useAdmin(),
    lang = useLangSafe(),
    pick = (l: Loc) => l.raw[lang] ?? l.fb[lang] ?? '';
  const heading = pick(v.seoTitle) || pick(title),
    body = pick(v.seoDescription) || pick(summary);
  return (
    <figure className="serp" aria-label={t('googlePreview')}>
      <figcaption className="muted small">{t('googlePreview')}</figcaption>
      <p className="serp-url">
        {origin.replace(/^https?:\/\//, '')} › {lang} › {kind} › {slug}
      </p>
      <p className="serp-title">{heading.slice(0, 60) || t('untitled')}</p>
      <p className="serp-desc">{body.slice(0, 160)}</p>
    </figure>
  );
}
const useLangSafe = useEditLang;
