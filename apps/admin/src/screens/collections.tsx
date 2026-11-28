'use client';
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { can } from '@stella/shared/admin';
import { locales, type Locale } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { loc, locOut, markReviewed, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { languageName } from '../lib/format';
import { useMediaMap, usePreview } from '../lib/catalog';
import { useDebouncedReorder } from '../lib/trip-actions';
import { useGuard } from '../lib/guard';
import { PageHeader } from '../components/ui/page-header';
import { DataTable, type Column } from '../components/ui/data-table';
import {
  StatusBadge,
  StatusMenu,
  contentStatus,
} from '../components/ui/status';
import { EditorLayout } from '../components/ui/editor';
import { FormField, I18nField } from '../components/ui/field';
import { SortableList } from '../components/ui/sortable';
import { MediaSlot, MediaThumb } from '../components/ui/media-picker';
import { Callout, LoadError } from '../components/ui/states';
import { AppLink } from '../components/ui/link';
import { useConfirm } from '../components/ui/dialog';
import type { MenuItem } from '../components/ui/menu';
import { CreateDialog } from '../components/create-dialog';
import { HistorySection } from '../components/history';
import type { SearchKeywords } from '@stella/shared/search';
import {
  SearchKeywordsField,
  keywordsFrom,
  keywordsOut,
} from '../components/search-keywords';

const typeKey = (kind: unknown) =>
  kind === 'private_virtual'
    ? 'colVirtual'
    : kind === 'packages'
      ? 'colPackages'
      : 'colNormal';

function usePrivateSlugs() {
  const homepage = useData<Row>('/v1/admin/homepage');
  return useMemo(() => {
    const value = obj(homepage.data?.draft ?? homepage.data);
    const slugs = obj(value.home).private_trip_slugs;
    return Array.isArray(slugs) ? (slugs as string[]) : [];
  }, [homepage.data]);
}

export function CollectionsList() {
  const { t, tp, locale, me, save } = useAdmin(),
    [archived, setArchived] = useState(false),
    list = useData<Row[]>(
      '/v1/admin/collections' + (archived ? '?archived=1' : ''),
    ),
    trips = useData<Row[]>('/v1/admin/trips'),
    packages = useData<Row[]>('/v1/admin/packages'),
    privateSlugs = usePrivateSlugs(),
    media = useMediaMap(),
    confirm = useConfirm(),
    { navigate } = useGuard(),
    reorder = useDebouncedReorder('/v1/admin/collections/reorder'),
    [order, setOrder] = useState<string[] | null>(null),
    [creating, setCreating] = useState(false),
    canPublish = can(me!.role, 'publish');
  const all = useMemo(() => {
    const base = list.data ?? [];
    if (!order) return base;
    const byId = new Map(base.map((r) => [r.id, r]));
    return order.map((id) => byId.get(id)!).filter(Boolean);
  }, [list.data, order]);
  const count = (row: Row) =>
    row.kind === 'private_virtual'
      ? privateSlugs.length
      : row.kind === 'packages'
        ? (packages.data ?? []).length
        : (trips.data ?? []).filter(
            (r) => r.kind === 'trip' && r.collectionId === row.id,
          ).length;
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('name'),
      cell: (row) => (
        <span className="strong">{content(row.name, locale)}</span>
      ),
    },
    { key: 'type', header: t('type'), cell: (row) => t(typeKey(row.kind)) },
    {
      key: 'count',
      header: t('trips'),
      cell: (row) =>
        tp(
          row.kind === 'packages' ? 'packagesCount' : 'tripsCount',
          count(row),
        ),
    },
    {
      key: 'status',
      header: t('status'),
      cell: (row) => <StatusBadge status={contentStatus(row)} />,
    },
  ];
  const menu = (row: Row): MenuItem[] => {
    const name = content(row.name, locale),
      items: MenuItem[] = [
        {
          label: t('open'),
          onSelect: () => void navigate('/collections/' + row.id),
        },
      ];
    if (!canPublish) return items;
    if (archived)
      return [
        ...items,
        {
          label: t('unarchive'),
          onSelect: () =>
            void save(
              '/v1/admin/collections/' + row.id + '/unarchive',
              'POST',
              {},
              { success: t('restoredItem') },
            ).catch(() => {}),
        },
      ];
    if (row.kind === 'normal') {
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
                  await save(
                    '/v1/admin/collections/' + row.id + '/unpublish',
                    'POST',
                    {},
                    { success: t('collectionUnpublished') },
                  ).catch(() => {});
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
                  await save(
                    '/v1/admin/collections/' + row.id + '/publish',
                    'POST',
                    {},
                    { success: t('collectionPublished') },
                  ).catch(() => {});
              },
            },
        'separator',
        {
          label: t('archive'),
          tone: 'danger',
          disabled: count(row) > 0,
          onSelect: async () => {
            if (
              await confirm({
                title: t('archiveTitle', { name }),
                body: t('archiveBody'),
                confirmLabel: t('archive'),
                tone: 'danger',
              })
            )
              await save(
                '/v1/admin/collections/' + row.id + '/archive',
                'POST',
                {},
                { success: t('collectionArchived') },
              ).catch(() => {});
          },
        },
      );
    }
    return items;
  };
  return (
    <div className="page">
      <PageHeader
        title={t('collections')}
        description={t('collectionsDesc')}
        primary={{
          label: t('newCollection'),
          onClick: () => setCreating(true),
        }}
        menu={[
          {
            label: archived ? t('showActive') : t('showArchived'),
            onSelect: () => setArchived((v) => !v),
          },
        ]}
      />
      <DataTable
        caption={t('collections')}
        columns={columns}
        rows={all}
        getKey={(row) => row.id}
        href={(row) => '/collections/' + row.id}
        thumb={(row) => (
          <MediaThumb media={media.get(String(row.coverMediaId))} />
        )}
        mobile={{
          title: (row) => content(row.name, locale),
          meta: (row) =>
            t(typeKey(row.kind)) +
            ' · ' +
            tp(
              row.kind === 'packages' ? 'packagesCount' : 'tripsCount',
              count(row),
            ),
          badge: (row) => <StatusBadge status={contentStatus(row)} />,
        }}
        menu={menu}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={{ title: archived ? t('noArchived') : t('noCollectionsYet') }}
        count={tp('collectionsCount', all.length)}
        reorder={{
          enabled: canPublish && !archived,
          itemName: (row) => content(row.name, locale),
          onReorder: (_, ids) => {
            setOrder(ids);
            reorder(ids);
          },
        }}
      />
      {creating && (
        <CreateDialog
          title={t('newCollection')}
          nameLabel={t('nameEn')}
          createLabel={t('createCollection')}
          slugPrefix={'…/en/c/'}
          success={t('collectionCreated')}
          onClose={() => setCreating(false)}
          hrefFor={(id) => '/collections/' + id}
          onCreate={async ({ name, slug }) =>
            (
              await save<{ id: string }>(
                '/v1/admin/collections',
                'POST',
                { name: { en: name }, slug },
                { success: false },
              )
            ).id
          }
        />
      )}
    </div>
  );
}

type Perk = { key: string; title: Loc; sub: Loc };
type CollectionState = {
  basics: {
    name: Loc;
    shortName: Loc;
    headline: Loc;
    subline: Loc;
    color: string;
  };
  media: { coverMediaId: string | null; heroVideoId: string | null };
  perks: { items: Perk[] };
  search: { keywords: SearchKeywords };
};

export function CollectionEditor({ id }: { id: string }) {
  const { t, locale, me, write, save } = useAdmin(),
    list = useData<Row[]>('/v1/admin/collections'),
    archivedList = useData<Row[]>('/v1/admin/collections?archived=1'),
    translations = useData<Row[]>(
      `/v1/admin/i18n/values?entity=collection&id=${id}`,
    ),
    trips = useData<Row[]>('/v1/admin/trips'),
    privateSlugs = usePrivateSlugs(),
    preview = usePreview(),
    { navigate } = useGuard(),
    canPublish = can(me!.role, 'publish');
  const row =
    list.data?.find((r) => r.id === id) ??
    archivedList.data?.find((r) => r.id === id);
  const initial = useMemo<CollectionState | null>(() => {
    if (!row || !translations.data) return null;
    const tl = (key: string, field: string) =>
      loc(row[key], translations.data!, field);
    return {
      basics: {
        name: tl('name', 'name'),
        shortName: tl('shortName', 'short_name'),
        headline: tl('headline', 'headline'),
        subline: tl('subline', 'subline'),
        color: String(row.color ?? '#d8b85a'),
      },
      media: {
        coverMediaId: (row.coverMediaId as string) ?? null,
        heroVideoId: (row.heroVideoId as string) ?? null,
      },
      perks: {
        items: rows(row.perks).map((p, i) => ({
          key: 'perk' + i,
          title: loc(p.title, translations.data!, `perks[${i}].title`),
          sub: loc(p.sub, translations.data!, `perks[${i}].sub`),
        })),
      },
      search: { keywords: keywordsFrom(row.searchKeywords) },
    };
  }, [row?.updatedAt, translations.dataUpdatedAt, !!row]);
  const labels = {
    basics: t('basics'),
    media: t('media'),
    perks: t('perks'),
    search: t('searchKeywords'),
  };
  const isVirtual = row?.kind === 'private_virtual';
  const patch = async (body: unknown) =>
    (await write('/v1/admin/collections/' + id, 'PATCH', body)).revisions;
  const editor = useEditor<CollectionState>({
    id: 'collection-' + id,
    initial,
    sourceKey: String(row?.updatedAt) + translations.dataUpdatedAt,
    order: ['basics', 'media', 'perks', 'search'],
    labels,
    success: t('collectionSaved'),
    afterSave: () => Promise.all([list.refetch(), translations.refetch()]),
    validate: {
      basics: (v) => (!(v.name.raw.en ?? '').trim() ? t('nameRequired') : null),
      perks: (v) => (v.items.length > 4 ? t('perksMax') : null),
    },
    savers: {
      basics: (v) =>
        patch({
          name: locOut(v.name),
          shortName: locOut(v.shortName),
          headline: locOut(v.headline),
          subline: locOut(v.subline),
          color: v.color,
        }),
      media: (v) =>
        patch({ coverMediaId: v.coverMediaId, heroVideoId: v.heroVideoId }),
      perks: (v) =>
        patch({
          perks: v.items.map((p) => ({
            title: locOut(p.title),
            sub: locOut(p.sub),
          })),
        }),
      search: (v) => patch({ searchKeywords: keywordsOut(v.keywords) }),
    },
  });
  if (list.isError)
    return (
      <div className="page">
        <LoadError retry={() => void list.refetch()} />
      </div>
    );
  const v = editor.values,
    name = content(row?.name, locale) || t('untitled'),
    status = row ? contentStatus(row) : 'draft';
  const members = (trips.data ?? []).filter((r) =>
    isVirtual ? privateSlugs.includes(String(r.slug)) : r.collectionId === id,
  );
  const missing = v
    ? locales.filter((c) => !(v.basics.name.raw[c] || v.basics.name.fb[c]))
    : [];
  return (
    <EditorLayout
      back={{ href: '/collections', label: t('collections') }}
      title={name}
      loading={!v}
      editor={editor as never}
      onMarkReviewed={(code: Locale) =>
        v && editor.replaceAll(markReviewed(v, code))
      }
      banner={
        <>
          {isVirtual && (
            <Callout tone="info">
              {t('virtualCollectionNote')}{' '}
              <AppLink href="/homepage" className="text-link">
                {t('openHomepage')}
              </AppLink>
            </Callout>
          )}
          {status === 'archived' && (
            <Callout tone="warning">{t('archivedBanner')}</Callout>
          )}
        </>
      }
      actions={
        row && !isVirtual ? (
          <button
            type="button"
            className="btn"
            onClick={() => void preview('c', String(row.slug))}
          >
            {t('preview')}
          </button>
        ) : undefined
      }
      status={
        row?.kind === 'normal' ? (
          <StatusMenu
            status={status}
            name={name}
            canPublish={canPublish}
            missingLocales={missing.map((c) => languageName(c, locale))}
            onPublish={() =>
              save(
                '/v1/admin/collections/' + id + '/publish',
                'POST',
                {},
                { success: t('collectionPublished') },
              )
            }
            onUnpublish={() =>
              save(
                '/v1/admin/collections/' + id + '/unpublish',
                'POST',
                {},
                { success: t('collectionUnpublished') },
              )
            }
            onArchive={
              canPublish && !members.length
                ? async () => {
                    await save(
                      '/v1/admin/collections/' + id + '/archive',
                      'POST',
                      {},
                      { success: t('collectionArchived') },
                    );
                    await navigate('/collections');
                  }
                : undefined
            }
            onUnarchive={
              canPublish
                ? () =>
                    save(
                      '/v1/admin/collections/' + id + '/unarchive',
                      'POST',
                      {},
                      { success: t('restoredItem') },
                    )
                : undefined
            }
          />
        ) : (
          <StatusBadge status={status} />
        )
      }
      sections={
        v
          ? [
              {
                id: 'basics',
                label: labels.basics,
                content: (
                  <>
                    <I18nField
                      label={t('name')}
                      value={v.basics.name}
                      required
                      showErrors={editor.showErrors}
                      onChange={(name) =>
                        editor.set('basics', { ...v.basics, name })
                      }
                    />
                    <I18nField
                      label={t('shortName')}
                      hint={t('shortNameHint')}
                      value={v.basics.shortName}
                      onChange={(shortName) =>
                        editor.set('basics', { ...v.basics, shortName })
                      }
                    />
                    <I18nField
                      label={t('headline')}
                      value={v.basics.headline}
                      onChange={(headline) =>
                        editor.set('basics', { ...v.basics, headline })
                      }
                    />
                    <I18nField
                      label={t('supportingText')}
                      multiline
                      value={v.basics.subline}
                      onChange={(subline) =>
                        editor.set('basics', { ...v.basics, subline })
                      }
                    />
                    <FormField label={t('colour')}>
                      {(p) => (
                        <div className="color-field">
                          <input
                            type="color"
                            aria-label={t('colour')}
                            value={v.basics.color}
                            onChange={(e) =>
                              editor.set('basics', {
                                ...v.basics,
                                color: e.target.value,
                              })
                            }
                          />
                          <input
                            {...p}
                            value={v.basics.color}
                            maxLength={7}
                            spellCheck={false}
                            onChange={(e) =>
                              editor.set('basics', {
                                ...v.basics,
                                color: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </FormField>
                  </>
                ),
              },
              {
                id: 'media',
                label: labels.media,
                content: (
                  <>
                    <MediaSlot
                      label={t('coverImage')}
                      kind="image"
                      mediaId={v.media.coverMediaId}
                      onChange={(coverMediaId) =>
                        editor.set('media', { ...v.media, coverMediaId })
                      }
                    />
                    <MediaSlot
                      label={t('video')}
                      kind="video"
                      mediaId={v.media.heroVideoId}
                      onChange={(heroVideoId) =>
                        editor.set('media', { ...v.media, heroVideoId })
                      }
                    />
                  </>
                ),
              },
              {
                id: 'perks',
                label: labels.perks,
                hidden: isVirtual,
                description: t('perksHint'),
                content: (
                  <PerksList
                    items={v.perks.items}
                    max={4}
                    onChange={(items) => editor.set('perks', { items })}
                    showErrors={editor.showErrors}
                  />
                ),
              },
              {
                id: 'search',
                label: labels.search,
                content: (
                  <SearchKeywordsField
                    value={v.search.keywords}
                    onChange={(keywords) => editor.set('search', { keywords })}
                  />
                ),
              },
              {
                id: 'trips',
                label: t('tripsInCollection'),
                content: (
                  <>
                    <p className="muted">
                      {isVirtual
                        ? t('virtualTripsHint')
                        : t('changeCollectionHint')}
                    </p>
                    {!members.length ? (
                      <p className="muted">{t('noTripsInCollection')}</p>
                    ) : (
                      <ul className="simple-list">
                        {members.map((r) => (
                          <li key={r.id}>
                            <AppLink
                              href={'/trips/' + r.id}
                              className="simple-row"
                            >
                              <span className="simple-main">
                                {content(r.title, locale)}
                              </span>
                              <StatusBadge status={contentStatus(r)} />
                            </AppLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ),
              },
              {
                id: 'history',
                label: t('history'),
                content: <HistorySection entities={['collection']} id={id} />,
              },
            ]
          : []
      }
    />
  );
}

export function PerksList({
  items,
  onChange,
  max,
  fixed = false,
  showErrors,
}: {
  items: Perk[];
  onChange: (items: Perk[]) => void;
  max: number;
  fixed?: boolean;
  showErrors: boolean;
}) {
  const { t, locale } = useAdmin();
  return (
    <>
      <SortableList
        items={items}
        getKey={(p) => p.key}
        itemName={(p, i) =>
          content(p.title.raw, locale) || t('perkN', { n: i + 1 })
        }
        onChange={onChange}
        {...(fixed
          ? {}
          : {
              onRemove: (index: number) =>
                onChange(items.filter((_, i) => i !== index)),
            })}
        render={(p, index) => (
          <div className="perk-row">
            <I18nField
              label={t('perkTitle')}
              value={p.title}
              required
              showErrors={showErrors}
              onChange={(title) =>
                onChange(
                  items.map((x, i) => (i === index ? { ...x, title } : x)),
                )
              }
            />
            <I18nField
              label={t('supportingText')}
              value={p.sub}
              required
              showErrors={showErrors}
              onChange={(sub) =>
                onChange(items.map((x, i) => (i === index ? { ...x, sub } : x)))
              }
            />
          </div>
        )}
      />
      {!fixed && items.length < max && (
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange([
              ...items,
              { key: 'n' + Date.now(), title: loc(null), sub: loc(null) },
            ])
          }
        >
          <Plus size={18} aria-hidden />
          {t('addPerk')}
        </button>
      )}
    </>
  );
}
export type { Perk };
