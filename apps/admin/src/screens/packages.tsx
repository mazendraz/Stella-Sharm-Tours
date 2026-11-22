'use client';
import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { can } from '@stella/shared/admin';
import { locales, type Locale } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { loc, locOut, markReviewed, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { languageName, money, relative } from '../lib/format';
import { useMediaMap, usePreview, usePriceText } from '../lib/catalog';
import { useTripActions, useDebouncedReorder } from '../lib/trip-actions';
import { useGuard } from '../lib/guard';
import { PageHeader } from '../components/ui/page-header';
import { DataTable, SearchBox, type Column } from '../components/ui/data-table';
import { FilterBar } from '../components/ui/filter-bar';
import {
  StatusBadge,
  StatusMenu,
  contentStatus,
} from '../components/ui/status';
import { EditorLayout } from '../components/ui/editor';
import { FieldGroup, FormField, Segmented } from '../components/ui/field';
import { SortableList } from '../components/ui/sortable';
import { Modal, useConfirm } from '../components/ui/dialog';
import { MediaThumb } from '../components/ui/media-picker';
import { Callout, EmptyState, LoadError } from '../components/ui/states';
import type { MenuItem } from '../components/ui/menu';
import { CreateDialog } from '../components/create-dialog';
import { HistorySection } from '../components/history';
import {
  BasicsSection,
  SeoSection,
  TripMediaSection,
  type TripState,
} from './trip-editor';
import { TranslationMeter } from './trips';

const packagePriceText = (
  row: Row,
  t: (k: string, v?: Record<string, string | number>) => string,
  locale: Locale,
) =>
  row.primaryUnit
    ? row.primaryAmountEur == null
      ? t('onRequest')
      : t('fromPrice', {
          price: money(row.primaryAmountEur as string, locale) ?? '',
        })
    : row.partsOnRequest || row.partsSum == null
      ? t('onRequest')
      : t('fromPrice', { price: money(row.partsSum as string, locale) ?? '' });

export function PackagesList() {
  const { t, tp, locale, save, me } = useAdmin(),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [creating, setCreating] = useState(false),
    archivedView = status === 'archived',
    list = useData<Row[]>(
      '/v1/admin/packages' + (archivedView ? '?archived=1' : ''),
    ),
    trips = useData<Row[]>('/v1/admin/trips'),
    media = useMediaMap(),
    actions = useTripActions('package'),
    preview = usePreview(),
    confirm = useConfirm(),
    { navigate } = useGuard(),
    reorder = useDebouncedReorder('/v1/admin/trips/reorder'),
    [localOrder, setLocalOrder] = useState<string[] | null>(null),
    canPublish = can(me!.role, 'publish');
  const all = useMemo(() => {
    const base = list.data ?? [];
    if (!localOrder) return base;
    const byId = new Map(base.map((r) => [r.id, r]));
    return localOrder.map((id) => byId.get(id)!).filter(Boolean);
  }, [list.data, localOrder]);
  const needle = q.trim().toLocaleLowerCase(locale);
  const filtered = all.filter(
    (row) =>
      (!needle ||
        content(row.title, locale)
          .toLocaleLowerCase(locale)
          .includes(needle)) &&
      (!status || archivedView || contentStatus(row) === status),
  );
  const filtering = !!needle || (!!status && !archivedView);
  const columns: Column<Row>[] = [
    {
      key: 'title',
      header: t('title'),
      cell: (row) => (
        <span className="cell-title">
          <span className="strong">
            {content(row.title, locale) || t('untitled')}
          </span>
          <span className="muted small mono">{String(row.slug)}</span>
        </span>
      ),
    },
    {
      key: 'days',
      header: t('days'),
      cell: (row) => tp('daysCount', Number(row.daysCount ?? 1)),
    },
    {
      key: 'trips',
      header: t('trips'),
      cell: (row) => tp('tripsCount', Number(row.partsCount ?? 0)),
    },
    {
      key: 'price',
      header: t('price'),
      cell: (row) => packagePriceText(row, t, locale),
    },
    {
      key: 'i18n',
      header: t('translationsShort'),
      className: 'hide-lg',
      cell: (row) => <TranslationMeter row={row} />,
    },
    {
      key: 'status',
      header: t('status'),
      cell: (row) => <StatusBadge status={contentStatus(row)} />,
    },
    {
      key: 'updated',
      header: t('updated'),
      className: 'hide-lg nowrap muted',
      cell: (row) => relative(String(row.updatedAt), locale),
    },
  ];
  const menu = (row: Row): MenuItem[] => {
    const name = content(row.title, locale);
    const items: MenuItem[] = [
      {
        label: t('open'),
        onSelect: () => void navigate('/packages/' + row.id),
      },
      {
        label: t('preview'),
        onSelect: () => void preview('t', String(row.slug)),
      },
    ];
    if (archivedView) {
      if (canPublish)
        items.push({
          label: t('unarchive'),
          onSelect: () => void actions.unarchive(row.id),
        });
      return items;
    }
    items.push({
      label: t('duplicate'),
      onSelect: () => void actions.duplicate(row.id),
    });
    if (canPublish) {
      items.push(
        row.status === 'published'
          ? {
              label: t('unpublish'),
              onSelect: async () => {
                if (
                  await confirm({
                    title: t('unpublishTitle', { name }),
                    body: t('unpublishBody'),
                    confirmLabel: t('unpublish'),
                  })
                )
                  await actions.unpublish(row.id).catch(() => {});
              },
            }
          : {
              label: t('publish'),
              onSelect: async () => {
                if (
                  await confirm({
                    title: t('publishTitle', { name }),
                    body: t('publishBody'),
                    confirmLabel: t('publish'),
                  })
                )
                  await actions.publish(row.id).catch(() => {});
              },
            },
        'separator',
        {
          label: t('archive'),
          tone: 'danger',
          onSelect: async () => {
            if (
              await confirm({
                title: t('archiveTitle', { name }),
                body: t('archiveBody'),
                confirmLabel: t('archive'),
                tone: 'danger',
              })
            )
              await actions.archive(row.id).catch(() => {});
          },
        },
      );
    }
    return items;
  };
  const tripChoices = (trips.data ?? []).filter((r) => r.kind === 'trip');
  return (
    <div className="page">
      <PageHeader
        title={t('packages')}
        description={t('packagesDesc')}
        primary={{ label: t('newPackage'), onClick: () => setCreating(true) }}
      />
      <DataTable
        caption={t('packages')}
        columns={columns}
        rows={filtered}
        getKey={(row) => row.id}
        href={(row) => '/packages/' + row.id}
        thumb={(row) => (
          <MediaThumb media={media.get(String(row.coverMediaId))} />
        )}
        mobile={{
          title: (row) => content(row.title, locale) || t('untitled'),
          meta: (row) =>
            tp('daysCount', Number(row.daysCount ?? 1)) +
            ' · ' +
            packagePriceText(row, t, locale),
          badge: (row) => <StatusBadge status={contentStatus(row)} />,
        }}
        menu={menu}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={{
          title: archivedView ? t('noArchived') : t('noPackagesYet'),
          body: archivedView ? undefined : t('noPackagesYetBody'),
        }}
        filtered={{
          active: filtering,
          title: needle ? t('noPackagesMatch', { q }) : t('noPackagesFiltered'),
          onClear: () => {
            setQ('');
            setStatus('');
          },
        }}
        count={tp('packagesCount', filtered.length)}
        reorder={{
          enabled: !filtering && !archivedView,
          itemName: (row) => content(row.title, locale),
          onReorder: (_, ids) => {
            setLocalOrder(ids);
            reorder(ids);
          },
        }}
        toolbar={
          <FilterBar
            search={
              <SearchBox
                value={q}
                onChange={setQ}
                placeholder={t('searchPackages')}
              />
            }
            active={status ? 1 : 0}
          >
            <select
              aria-label={t('status')}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="published">{t('published')}</option>
              <option value="draft">{t('draft')}</option>
              <option value="archived">{t('archived')}</option>
            </select>
          </FilterBar>
        }
      />
      {creating && (
        <CreateDialog
          title={t('newPackage')}
          nameLabel={t('titleEn')}
          createLabel={t('createPackage')}
          slugPrefix={'…/en/t/'}
          selectLabel={t('firstTrip')}
          collections={tripChoices.map((r) => ({
            id: r.id,
            name: content(r.title, locale),
          }))}
          success={t('packageCreated')}
          onClose={() => setCreating(false)}
          hrefFor={(id) => '/packages/' + id}
          onCreate={async ({ name, slug, collectionId }) =>
            (
              await save<{ id: string }>(
                '/v1/admin/packages',
                'POST',
                {
                  title: { en: name },
                  slug,
                  parts: [{ tripId: collectionId, dayIndex: 1 }],
                },
                { success: false },
              )
            ).id
          }
        />
      )}
    </div>
  );
}

type Part = { key: string; tripId: string; dayIndex: number };
type PackageState = {
  basics: TripState['basics'];
  parts: { days: number; items: Part[] };
  price: {
    mode: 'sum' | 'custom';
    amount: string;
    onRequest: boolean;
    unit: string;
  };
  media: TripState['media'];
  seo: TripState['seo'];
};

export function PackageEditor({ id }: { id: string }) {
  const { t, locale, me, write } = useAdmin(),
    query = useData<Row>('/v1/admin/trips/' + id),
    parts = useData<Row[]>('/v1/admin/package-parts?id=' + id),
    translations = useData<Row[]>(`/v1/admin/i18n/values?entity=trip&id=${id}`),
    trips = useData<Row[]>('/v1/admin/trips'),
    preview = usePreview(),
    actions = useTripActions('package'),
    { navigate } = useGuard(),
    role = me!.role,
    canPrices = can(role, 'prices');
  const ready = query.data && parts.data && translations.data;
  const initial = useMemo<PackageState | null>(() => {
    if (!ready) return null;
    const trip = obj(query.data!.trip),
      tl = (key: string, field: string) =>
        loc(trip[key], translations.data!, field),
      own = rows(query.data!.prices),
      primary = own.find((p) => p.isPrimary),
      media = rows(query.data!.media).sort(
        (a, b) => Number(a.sort) - Number(b.sort),
      );
    const items = parts.data!.map((p, i) => ({
      key: 'p' + i + String(p.tripId),
      tripId: String(p.tripId),
      dayIndex: Number(p.dayIndex),
    }));
    return {
      basics: {
        title: tl('title', 'title'),
        summary: tl('summary', 'summary'),
        description: tl('description', 'description'),
        collectionId: String(trip.collectionId),
        slug: String(trip.slug),
      },
      parts: {
        days: Math.max(
          1,
          Number(trip.daysCount ?? 1),
          ...items.map((p) => p.dayIndex),
        ),
        items,
      },
      price: {
        mode: own.length ? 'custom' : 'sum',
        amount:
          primary?.amountEur == null ? '' : String(Number(primary.amountEur)),
        onRequest: !!primary && primary.amountEur == null,
        unit: String(primary?.unit ?? 'person'),
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
  }, [
    ready,
    query.dataUpdatedAt,
    parts.dataUpdatedAt,
    translations.dataUpdatedAt,
  ]);
  const trip = obj(query.data?.trip),
    status = contentStatus(trip),
    published = trip.status === 'published';
  const labels = {
    basics: t('basics'),
    parts: t('daysTrips'),
    price: t('price'),
    media: t('media'),
    seo: t('searchAppearance'),
  };
  const editor = useEditor<PackageState>({
    id: 'package-' + id,
    initial,
    sourceKey: [
      query.dataUpdatedAt,
      parts.dataUpdatedAt,
      translations.dataUpdatedAt,
    ].join(':'),
    order: ['basics', 'parts', 'price', 'media', 'seo'],
    labels,
    success: t('packageSaved'),
    afterSave: () =>
      Promise.all([query.refetch(), parts.refetch(), translations.refetch()]),
    validate: {
      basics: (v) =>
        !(v.title.raw.en ?? '').trim()
          ? t('titleRequired')
          : !/^[a-z0-9-]{1,120}$/.test(v.slug)
            ? t('slugInvalid')
            : null,
      parts: (v) =>
        !v.items.length
          ? t('packageNeedsTrip')
          : published
            ? t('unpublishToEditTrips')
            : null,
      price: (v) =>
        v.mode === 'custom' &&
        !v.onRequest &&
        !(v.amount !== '' && Number(v.amount) >= 0)
          ? t('pricesInvalidAmount')
          : null,
    },
    savers: {
      basics: async (v) =>
        (
          await write('/v1/admin/trips/' + id + '/basics', 'PATCH', {
            title: locOut(v.title),
            summary: locOut(v.summary),
            description: locOut(v.description),
            slug: v.slug,
          })
        ).revisions,
      parts: async (v) =>
        (
          await write('/v1/admin/packages/' + id, 'PATCH', {
            parts: [...v.items]
              .sort((a, b) => a.dayIndex - b.dayIndex)
              .map((p) => ({ tripId: p.tripId, dayIndex: p.dayIndex })),
          })
        ).revisions,
      price: async (v) =>
        v.mode === 'sum'
          ? (await write('/v1/admin/packages/' + id + '/prices', 'DELETE', {}))
              .revisions
          : (
              await write('/v1/admin/trips/' + id + '/prices', 'PUT', {
                rows: [
                  {
                    label: null,
                    amountEur: v.onRequest
                      ? null
                      : Number(Number(v.amount).toFixed(2)),
                    unit: v.unit,
                    isPrimary: true,
                  },
                ],
                confirmLargeChange: true,
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
      seo: async (v) =>
        (
          await write('/v1/admin/trips/' + id + '/seo', 'PATCH', {
            seoTitle: locOut(v.seoTitle),
            seoDescription: locOut(v.seoDescription),
          })
        ).revisions,
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
    tripRows = (trips.data ?? []).filter((r) => r.kind === 'trip');
  const missing = v
    ? locales.filter(
        (code) => !(v.basics.title.raw[code] || v.basics.title.fb[code]),
      )
    : [];
  return (
    <EditorLayout
      back={{ href: '/packages', label: t('packages') }}
      title={v ? content(v.basics.title.raw, locale) || name : t('loading')}
      loading={!v}
      editor={editor as never}
      onMarkReviewed={(code: Locale) =>
        v && editor.replaceAll(markReviewed(v, code))
      }
      banner={
        status === 'archived' ? (
          <Callout tone="warning">{t('archivedBanner')}</Callout>
        ) : undefined
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
              ? () => actions.archive(id, () => void navigate('/packages'))
              : undefined
          }
          onUnarchive={
            can(role, 'publish') ? () => actions.unarchive(id) : undefined
          }
        />
      }
      menu={[
        { label: t('duplicate'), onSelect: () => void actions.duplicate(id) },
        ...(can(role, 'publish')
          ? actions.archiveMenu(id, name, status === 'archived')
          : []),
      ]}
      sections={
        v
          ? [
              {
                id: 'basics',
                label: labels.basics,
                content: (
                  <BasicsSection
                    v={v.basics}
                    set={(next) => editor.set('basics', next)}
                    originalSlug={String(trip.slug ?? '')}
                    showErrors={editor.showErrors}
                  />
                ),
              },
              {
                id: 'parts',
                label: labels.parts,
                content: (
                  <DaysBuilder
                    v={v.parts}
                    set={(next) => editor.set('parts', next)}
                    trips={tripRows}
                    locked={published}
                  />
                ),
              },
              {
                id: 'price',
                label: labels.price,
                hidden: !canPrices,
                content: (
                  <PackagePrice
                    v={v.price}
                    set={(next) => editor.set('price', next)}
                    parts={v.parts.items}
                    trips={tripRows}
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
                      'package',
                      ...(canPrices ? ['trip_prices'] : []),
                      'trip_media',
                    ]}
                    id={id}
                    auditEntity="trip"
                  />
                ),
              },
            ]
          : []
      }
    />
  );
}

function DaysBuilder({
  v,
  set,
  trips,
  locked,
}: {
  v: PackageState['parts'];
  set: (v: PackageState['parts']) => void;
  trips: Row[];
  locked: boolean;
}) {
  const { t, tp, locale } = useAdmin(),
    priceText = usePriceText(),
    media = useMediaMap(),
    [adding, setAdding] = useState<number | null>(null);
  const byId = new Map(trips.map((r) => [r.id, r]));
  const priceOf = (tripId: string) => {
    const r = byId.get(tripId);
    return r?.primaryUnit
      ? priceText({ amountEur: r.primaryAmountEur, unit: r.primaryUnit })
      : t('onRequest');
  };
  const total = v.items.reduce(
      (sum, p) => sum + Number(byId.get(p.tripId)?.primaryAmountEur ?? 0),
      0,
    ),
    anyOnRequest = v.items.some(
      (p) => byId.get(p.tripId)?.primaryAmountEur == null,
    );
  const replaceDay = (day: number, list: Part[]) =>
    set({
      ...v,
      items: [...v.items.filter((p) => p.dayIndex !== day), ...list],
    });
  return (
    <>
      {locked && <Callout tone="info">{t('unpublishToEditTrips')}</Callout>}
      <div className="days-stepper">
        <span className="strong">{tp('daysCount', v.days)}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('removeDay')}
          disabled={
            locked || v.days <= 1 || v.items.some((p) => p.dayIndex === v.days)
          }
          onClick={() => set({ ...v, days: v.days - 1 })}
        >
          <Minus size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('addDay')}
          disabled={locked || v.days >= 38}
          onClick={() => set({ ...v, days: v.days + 1 })}
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>
      <ol className="day-list">
        {Array.from({ length: v.days }, (_, i) => i + 1).map((day) => {
          const list = v.items.filter((p) => p.dayIndex === day);
          return (
            <li key={day} className="day-card">
              <h3>{t('dayN', { n: day })}</h3>
              {!list.length && <p className="muted small">{t('freeDay')}</p>}
              <SortableList
                items={list}
                getKey={(p) => p.key}
                disabled={locked}
                itemName={(p) => content(byId.get(p.tripId)?.title, locale)}
                onChange={(next) => replaceDay(day, next)}
                onRemove={(index) =>
                  replaceDay(
                    day,
                    list.filter((_, i) => i !== index),
                  )
                }
                extraMenu={(p) =>
                  Array.from({ length: v.days }, (_, i) => i + 1)
                    .filter((d) => d !== day)
                    .map((d) => ({
                      label: t('moveToDay', { n: d }),
                      onSelect: () =>
                        set({
                          ...v,
                          items: v.items.map((x) =>
                            x.key === p.key ? { ...x, dayIndex: d } : x,
                          ),
                        }),
                    }))
                }
                render={(p) => (
                  <div className="gallery-row">
                    <MediaThumb
                      media={media.get(
                        String(byId.get(p.tripId)?.coverMediaId),
                      )}
                      size={44}
                    />
                    <span className="truncate">
                      {content(byId.get(p.tripId)?.title, locale) ||
                        t('untitled')}
                    </span>
                    <span className="muted nowrap">{priceOf(p.tripId)}</span>
                  </div>
                )}
              />
              {!locked && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setAdding(day)}
                >
                  <Plus size={16} aria-hidden />
                  {t('addTrip')}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="total-line">
        {t('runningTotal')}: <strong>{money(total, locale) ?? '—'}</strong>
        {anyOnRequest && (
          <span className="muted"> + {t('onRequest').toLocaleLowerCase()}</span>
        )}
      </p>
      {adding !== null && (
        <TripPickDialog
          trips={trips}
          onClose={() => setAdding(null)}
          onPick={(tripId) => {
            set({
              ...v,
              items: [
                ...v.items,
                { key: 'n' + Date.now(), tripId, dayIndex: adding },
              ],
            });
            setAdding(null);
          }}
        />
      )}
    </>
  );
}

export function TripPickDialog({
  trips,
  onPick,
  onClose,
  exclude = [],
}: {
  trips: Row[];
  onPick: (id: string) => void;
  onClose: () => void;
  exclude?: string[];
}) {
  const { t, locale } = useAdmin(),
    [q, setQ] = useState(''),
    media = useMediaMap(),
    priceText = usePriceText();
  const list = trips.filter(
    (r) =>
      !exclude.includes(r.id) &&
      content(r.title, locale)
        .toLocaleLowerCase(locale)
        .includes(q.toLocaleLowerCase(locale)),
  );
  return (
    <Modal title={t('chooseTrip')} onClose={onClose} size="md">
      <SearchBox value={q} onChange={setQ} placeholder={t('searchTrips')} />
      {!list.length ? (
        <EmptyState variant="filtered" title={t('noTripsMatch', { q })} />
      ) : (
        <ul className="pick-list">
          {list.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="pick-row"
                onClick={() => onPick(r.id)}
              >
                <MediaThumb
                  media={media.get(String(r.coverMediaId))}
                  size={44}
                />
                <span className="truncate strong">
                  {content(r.title, locale)}
                </span>
                <span className="muted nowrap">
                  {r.primaryUnit
                    ? priceText({
                        amountEur: r.primaryAmountEur,
                        unit: r.primaryUnit,
                      })
                    : t('onRequest')}
                </span>
                <StatusBadge status={contentStatus(r)} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function PackagePrice({
  v,
  set,
  parts,
  trips,
}: {
  v: PackageState['price'];
  set: (v: PackageState['price']) => void;
  parts: Part[];
  trips: Row[];
}) {
  const { t, locale } = useAdmin();
  const byId = new Map(trips.map((r) => [r.id, r]));
  const sum = parts.reduce(
      (s, p) => s + Number(byId.get(p.tripId)?.primaryAmountEur ?? 0),
      0,
    ),
    anyOnRequest = parts.some(
      (p) => byId.get(p.tripId)?.primaryAmountEur == null,
    );
  const shown =
    v.mode === 'sum'
      ? anyOnRequest || !parts.length
        ? t('onRequest')
        : t('fromPrice', { price: money(sum, locale) ?? '' })
      : v.onRequest
        ? t('onRequest')
        : t('fromPrice', { price: money(v.amount || 0, locale) ?? '' });
  return (
    <>
      <FieldGroup legend={t('howPriced')}>
        <Segmented
          label={t('howPriced')}
          value={v.onRequest && v.mode === 'custom' ? 'request' : v.mode}
          onChange={(mode) =>
            set(
              mode === 'request'
                ? { ...v, mode: 'custom', onRequest: true }
                : { ...v, mode: mode as 'sum' | 'custom', onRequest: false },
            )
          }
          options={[
            { value: 'sum', label: t('useSum') },
            { value: 'custom', label: t('customPrice') },
            { value: 'request', label: t('onRequest') },
          ]}
        />
      </FieldGroup>
      {v.mode === 'sum' && (
        <p className="muted">
          {t('sumOfTrips')}: {money(sum, locale) ?? '—'}
          {anyOnRequest && ' + ' + t('onRequest').toLocaleLowerCase()}
        </p>
      )}
      {v.mode === 'custom' && !v.onRequest && (
        <div className="field-row-2">
          <FormField label={t('amountEur')}>
            {(p) => (
              <input
                {...p}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={v.amount}
                onChange={(e) => set({ ...v, amount: e.target.value })}
              />
            )}
          </FormField>
          <FormField label={t('per')}>
            {(p) => (
              <select
                {...p}
                value={v.unit}
                onChange={(e) => set({ ...v, unit: e.target.value })}
              >
                {['person', 'group'].map((u) => (
                  <option key={u} value={u}>
                    {t('unitName_' + u)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
      )}
      <p className="preview-line">
        {t('shownAs')} <strong>{shown}</strong>
      </p>
    </>
  );
}
export type { Loc };
