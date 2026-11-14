'use client';
import { useEffect, useMemo, useState } from 'react';
import { can } from '@stella/shared/admin';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, type Row } from '../lib/content';
import { relative } from '../lib/format';
import {
  formatLabelKey,
  translationProgress,
  usePriceText,
  usePreview,
} from '../lib/catalog';
import { useTripActions, useDebouncedReorder } from '../lib/trip-actions';
import { useGuard } from '../lib/guard';
import { useMediaMap } from '../lib/catalog';
import { PageHeader } from '../components/ui/page-header';
import { DataTable, SearchBox, type Column } from '../components/ui/data-table';
import { StatusBadge, contentStatus } from '../components/ui/status';
import { MediaThumb } from '../components/ui/media-picker';
import { Toggle } from '../components/ui/field';
import { useConfirm } from '../components/ui/dialog';
import type { MenuItem } from '../components/ui/menu';
import { CreateDialog } from '../components/create-dialog';

export function TranslationMeter({ value }: { value: number }) {
  const { t } = useAdmin();
  return (
    <span className="meter" title={t('langsReady', { n: value })}>
      <span className="meter-bar" aria-hidden>
        <span style={{ width: (value / 7) * 100 + '%' }} />
      </span>
      <span className="meter-text">{value}/7</span>
      <span className="sr-only">{t('langsReady', { n: value })}</span>
    </span>
  );
}

export function TripsList() {
  const { t, tp, locale, me, save } = useAdmin(),
    [q, setQ] = useState(''),
    [collection, setCollection] = useState(''),
    [status, setStatus] = useState(''),
    [format, setFormat] = useState(''),
    [grouped, setGrouped] = useState(true),
    [creating, setCreating] = useState(false),
    [localOrder, setLocalOrder] = useState<string[] | null>(null),
    archivedView = status === 'archived',
    trips = useData<Row[]>(
      '/v1/admin/trips' + (archivedView ? '?archived=1' : ''),
    ),
    collections = useData<Row[]>('/v1/admin/collections'),
    homepage = useData<Row>('/v1/admin/homepage'),
    media = useMediaMap(),
    priceText = usePriceText(),
    preview = usePreview(),
    actions = useTripActions('trip'),
    confirm = useConfirm(),
    { navigate } = useGuard(),
    reorder = useDebouncedReorder('/v1/admin/trips/reorder'),
    canPublish = can(me!.role, 'publish');
  useEffect(() => setLocalOrder(null), [trips.data]);
  const privateSlugs = useMemo(() => {
    const value = obj(homepage.data?.draft ?? homepage.data);
    const slugs = obj(value.home).private_trip_slugs;
    return new Set(Array.isArray(slugs) ? (slugs as string[]) : []);
  }, [homepage.data]);
  const normal = (collections.data ?? []).filter((c) => c.kind === 'normal');
  const all = useMemo(() => {
    const list = (trips.data ?? []).filter((row) => row.kind === 'trip');
    if (!localOrder) return list;
    const byId = new Map(list.map((row) => [row.id, row]));
    return localOrder.map((id) => byId.get(id)!).filter(Boolean);
  }, [trips.data, localOrder]);
  const needle = q.trim().toLocaleLowerCase(locale);
  const filtered = all.filter(
    (row) =>
      (!needle ||
        content(row.title, locale).toLocaleLowerCase(locale).includes(needle) ||
        String(row.slug).includes(needle)) &&
      (!collection ||
        (collection === 'private-home'
          ? privateSlugs.has(String(row.slug))
          : row.collectionId === collection)) &&
      (!status || archivedView || contentStatus(row) === status) &&
      (!format || row.format === format),
  );
  const filtering = !!(
    needle ||
    collection ||
    (status && !archivedView) ||
    format
  );
  const canReorder = grouped && !filtering && !archivedView;
  const collectionName = (id: unknown) =>
    content(collections.data?.find((c) => c.id === id)?.name, locale);
  const groups = grouped
    ? normal
        .map((c) => {
          const groupRows = filtered.filter((row) => row.collectionId === c.id);
          return {
            key: c.id,
            label: (
              <>
                {content(c.name, locale)}
                <span className="group-count"> · {groupRows.length}</span>
              </>
            ),
            rows: groupRows,
          };
        })
        .concat([
          {
            key: 'other',
            label: <>{t('otherCollections')}</>,
            rows: filtered.filter(
              (row) => !normal.some((c) => c.id === row.collectionId),
            ),
          },
        ])
    : undefined;
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
      key: 'collection',
      header: t('collection'),
      className: 'hide-md',
      cell: (row) => collectionName(row.collectionId),
    },
    {
      key: 'format',
      header: t('format'),
      className: 'hide-md',
      cell: (row) => t(formatLabelKey(row.format)),
    },
    {
      key: 'price',
      header: t('mainPrice'),
      cell: (row) =>
        priceText(
          row.primaryUnit
            ? { amountEur: row.primaryAmountEur, unit: row.primaryUnit }
            : null,
          !!row.onRequest,
        ),
    },
    {
      key: 'i18n',
      header: t('translationsShort'),
      className: 'hide-lg',
      cell: (row) => <TranslationMeter value={translationProgress(row)} />,
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
      { label: t('open'), onSelect: () => void navigate('/trips/' + row.id) },
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
    if (canPublish)
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
    return items;
  };
  return (
    <div className="page">
      <PageHeader
        title={t('trips')}
        description={t('tripsDesc')}
        primary={{ label: t('newTrip'), onClick: () => setCreating(true) }}
      />
      <DataTable
        caption={t('trips')}
        columns={columns}
        groups={groups}
        rows={grouped ? undefined : filtered}
        getKey={(row) => row.id}
        href={(row) => '/trips/' + row.id}
        thumb={(row) => (
          <MediaThumb media={media.get(String(row.coverMediaId))} />
        )}
        mobile={{
          title: (row) => content(row.title, locale) || t('untitled'),
          meta: (row) =>
            (grouped ? '' : collectionName(row.collectionId) + ' · ') +
            priceText(
              row.primaryUnit
                ? { amountEur: row.primaryAmountEur, unit: row.primaryUnit }
                : null,
              !!row.onRequest,
            ),
          badge: (row) => <StatusBadge status={contentStatus(row)} />,
        }}
        menu={menu}
        loading={trips.isPending || collections.isPending}
        error={trips.isError}
        onRetry={() => void trips.refetch()}
        empty={{
          title: archivedView ? t('noArchived') : t('noTripsYet'),
          body: archivedView ? undefined : t('noTripsYetBody'),
        }}
        filtered={{
          active: filtering,
          title: needle ? t('noTripsMatch', { q }) : t('noTripsFiltered'),
          onClear: () => {
            setQ('');
            setCollection('');
            setStatus('');
            setFormat('');
          },
        }}
        count={tp('tripsCount', filtered.length)}
        reorder={{
          enabled: canReorder,
          itemName: (row) => content(row.title, locale),
          onReorder: (groupKey, ids) => {
            if (!groupKey || groupKey === 'other') return;
            // Rebuild the full order: only this collection's slots change.
            let index = 0;
            const next = all.map((row) =>
              row.collectionId === groupKey ? ids[index++]! : row.id,
            );
            setLocalOrder(next);
            reorder(next);
          },
        }}
        toolbar={
          <div className="filters">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder={t('searchTrips')}
            />
            <select
              aria-label={t('collection')}
              value={collection}
              onChange={(event) => setCollection(event.target.value)}
            >
              <option value="">{t('allCollections')}</option>
              <option value="private-home">{t('onHomePrivate')}</option>
              {normal.map((c) => (
                <option key={c.id} value={c.id}>
                  {content(c.name, locale)}
                </option>
              ))}
            </select>
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
            <select
              aria-label={t('format')}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="">{t('allFormats')}</option>
              <option value="group">{t('fmtGroup')}</option>
              <option value="private">{t('fmtPrivate')}</option>
              <option value="both">{t('fmtBoth')}</option>
            </select>
            <Toggle
              checked={grouped}
              onChange={setGrouped}
              label={t('groupByCollection')}
            />
          </div>
        }
      />
      {creating && (
        <CreateDialog
          title={t('newTrip')}
          nameLabel={t('titleEn')}
          createLabel={t('createTrip')}
          slugPrefix={'…/en/t/'}
          collections={normal.map((c) => ({
            id: c.id,
            name: content(c.name, locale),
          }))}
          success={t('tripCreated')}
          onClose={() => setCreating(false)}
          hrefFor={(id) => '/trips/' + id}
          onCreate={async ({ name, slug, collectionId }) =>
            (
              await save<{ id: string }>(
                '/v1/admin/trips',
                'POST',
                { title: { en: name }, slug, collectionId },
                { success: false },
              )
            ).id
          }
        />
      )}
    </div>
  );
}
