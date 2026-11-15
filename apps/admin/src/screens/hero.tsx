'use client';
import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { can } from '@stella/shared/admin';
import type { Locale } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { content, type Row } from '../lib/content';
import { loc, locOut, markReviewed, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { cairoInputToUtc, dateOnly, utcToCairoInput } from '../lib/format';
import { useMediaMap } from '../lib/catalog';
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
import {
  FieldGroup,
  FormField,
  I18nField,
  Segmented,
} from '../components/ui/field';
import { MediaSlot, MediaThumb, mediaSrc } from '../components/ui/media-picker';
import { Modal, useConfirm } from '../components/ui/dialog';
import { Callout, EmptyState, LoadError } from '../components/ui/states';
import type { MenuItem } from '../components/ui/menu';
import { HistorySection } from '../components/history';

const pages = [
  { value: '/contact', key: 'page_contact' },
  { value: '/legal/terms', key: 'page_terms' },
  { value: '/legal/privacy', key: 'page_privacy' },
  { value: '/legal/cancellation', key: 'page_cancellation' },
  { value: '/faq', key: 'faq' },
];

function slideName(
  row: Row,
  collections: Row[],
  locale: Locale,
  fallback: string,
) {
  return (
    content(row.headline, locale) ||
    content(collections.find((c) => c.id === row.collectionId)?.name, locale) ||
    fallback
  );
}
const scheduleState = (row: Row) =>
  row.status !== 'published'
    ? contentStatus(row)
    : row.startsAt && Date.parse(String(row.startsAt)) > Date.now()
      ? 'scheduled'
      : row.endsAt && Date.parse(String(row.endsAt)) <= Date.now()
        ? 'ended'
        : 'published';

export function HeroList() {
  const { t, tp, locale, me, save } = useAdmin(),
    list = useData<Row[]>('/v1/admin/hero-slides'),
    collections = useData<Row[]>('/v1/admin/collections'),
    media = useMediaMap(),
    confirm = useConfirm(),
    { navigate } = useGuard(),
    reorder = useDebouncedReorder('/v1/admin/hero-slides/reorder'),
    [order, setOrder] = useState<string[] | null>(null),
    [previewing, setPreviewing] = useState(false),
    canLive = can(me!.role, 'heroLive');
  useEffect(() => setOrder(null), [list.data]);
  const all = useMemo(() => {
    const base = list.data ?? [];
    if (!order) return base;
    const byId = new Map(base.map((r) => [r.id, r]));
    return order.map((id) => byId.get(id)!).filter(Boolean);
  }, [list.data, order]);
  const cols = collections.data ?? [];
  const name = (row: Row) => slideName(row, cols, locale, t('untitledSlide'));
  const live = all.filter((r) => scheduleState(r) === 'published');
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('name'),
      cell: (row) => <span className="strong">{name(row)}</span>,
    },
    {
      key: 'target',
      header: t('buttonGoesTo'),
      className: 'hide-md',
      cell: (row) => <Target row={row} collections={cols} />,
    },
    {
      key: 'duration',
      header: t('displayTime'),
      className: 'hide-lg',
      cell: (row) => t('seconds', { n: Number(row.durationS ?? 6) }),
    },
    {
      key: 'show',
      header: t('showsOn'),
      className: 'hide-md',
      cell: (row) => t('show_' + String(row.showOn ?? 'all')),
    },
    {
      key: 'schedule',
      header: t('schedule'),
      className: 'hide-lg',
      cell: (row) =>
        row.startsAt || row.endsAt
          ? [row.startsAt, row.endsAt]
              .map((d) => (d ? dateOnly(String(d), locale) : '…'))
              .join(' → ')
          : t('always'),
    },
    {
      key: 'status',
      header: t('status'),
      cell: (row) => <StatusBadge status={scheduleState(row)} />,
    },
  ];
  const menu = (row: Row): MenuItem[] => {
    const n = name(row),
      items: MenuItem[] = [
        { label: t('open'), onSelect: () => void navigate('/hero/' + row.id) },
      ];
    if (!canLive) return items;
    items.push(
      row.status === 'published'
        ? {
            label: t('unpublish'),
            onSelect: async () => {
              if (
                await confirm({
                  title: t('unpublishTitle', { name: n }),
                  body: t('unpublishBody'),
                  confirmLabel: t('unpublish'),
                })
              )
                await save(
                  '/v1/admin/hero-slides/' + row.id + '/unpublish',
                  'POST',
                  {},
                  { success: t('slideUnpublished') },
                ).catch(() => {});
            },
          }
        : {
            label: t('publish'),
            onSelect: async () => {
              if (
                await confirm({
                  title: t('publishTitle', { name: n }),
                  body: t('publishBody'),
                  confirmLabel: t('publish'),
                })
              )
                await save(
                  '/v1/admin/hero-slides/' + row.id + '/publish',
                  'POST',
                  {},
                  { success: t('slidePublished') },
                ).catch(() => {});
            },
          },
      'separator',
      {
        label: t('archive'),
        tone: 'danger',
        onSelect: async () => {
          if (
            await confirm({
              title: t('archiveTitle', { name: n }),
              body: t('archiveBody'),
              confirmLabel: t('archive'),
              tone: 'danger',
            })
          )
            await save(
              '/v1/admin/hero-slides/' + row.id + '/archive',
              'POST',
              {},
              { success: t('slideArchived') },
            ).catch(() => {});
        },
      },
    );
    return items;
  };
  return (
    <div className="page">
      <PageHeader
        title={t('hero')}
        description={t('heroDesc')}
        secondary={
          <button
            type="button"
            className="btn"
            onClick={() => setPreviewing(true)}
          >
            <Play size={16} aria-hidden />
            {t('preview')}
          </button>
        }
        primary={{
          label: t('newSlide'),
          onClick: async () => {
            try {
              const result = await save<{ id: string }>(
                '/v1/admin/hero-slides',
                'POST',
                { durationS: 6, showOn: 'all', ctaType: 'my_trip' },
                { success: t('slideCreated') },
              );
              await navigate('/hero/' + result.id);
            } catch {
              /* reported */
            }
          },
        }}
      />
      {!list.isPending && !live.length && (
        <Callout tone="warning">{t('noSlides')}</Callout>
      )}
      {live.length > 10 && <Callout tone="warning">{t('limitSlides')}</Callout>}
      <DataTable
        caption={t('hero')}
        columns={columns}
        rows={all}
        getKey={(row) => row.id}
        href={(row) => '/hero/' + row.id}
        thumb={(row) => (
          <MediaThumb
            media={media.get(String(row.videoMediaId ?? row.imageMediaId))}
          />
        )}
        mobile={{
          title: name,
          meta: (row) =>
            t('seconds', { n: Number(row.durationS ?? 6) }) +
            ' · ' +
            t('show_' + String(row.showOn ?? 'all')),
          badge: (row) => <StatusBadge status={scheduleState(row)} />,
        }}
        menu={menu}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={{ title: t('noSlidesYet'), body: t('noSlidesYetBody') }}
        count={tp('slidesCount', all.length)}
        reorder={{
          enabled: canLive,
          itemName: name,
          onReorder: (_, ids) => {
            setOrder(ids);
            reorder(ids);
          },
        }}
      />
      {previewing && (
        <HeroPreview
          slides={live}
          collections={cols}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}

function Target({ row, collections }: { row: Row; collections: Row[] }) {
  const { t, locale } = useAdmin(),
    trips = useData<Row[]>('/v1/admin/trips');
  const type = String(row.ctaType ?? ''),
    target = String(row.ctaTarget ?? '');
  const label =
    type === 'collection'
      ? content(collections.find((c) => c.slug === target)?.name, locale)
      : type === 'trip' || type === 'package'
        ? content(trips.data?.find((r) => r.slug === target)?.title, locale)
        : type === 'page'
          ? t(pages.find((p) => p.value === target)?.key ?? 'page')
          : '';
  return (
    <span>
      {t('cta_' + (type || 'none'))}
      {label ? ' · ' + label : ''}
    </span>
  );
}

function HeroPreview({
  slides,
  collections,
  onClose,
}: {
  slides: Row[];
  collections: Row[];
  onClose: () => void;
}) {
  const { t, locale, apiOrigin } = useAdmin(),
    media = useMediaMap(),
    [device, setDevice] = useState<'mobile' | 'desktop'>('mobile'),
    [index, setIndex] = useState(0);
  const shown = slides.filter((s) => s.showOn === 'all' || s.showOn === device);
  const slide = shown[index % Math.max(1, shown.length)];
  useEffect(() => {
    if (!slide) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduce) return;
    const timer = setTimeout(
      () => setIndex((v) => v + 1),
      Number(slide.durationS ?? 6) * 1000,
    );
    return () => clearTimeout(timer);
  }, [slide, index]);
  const videoRow = slide?.videoMediaId
    ? media.get(String(slide.videoMediaId))
    : undefined;
  return (
    <Modal title={t('heroPreview')} onClose={onClose} size="lg">
      <Segmented
        label={t('device')}
        value={device}
        onChange={(v) => {
          setDevice(v);
          setIndex(0);
        }}
        options={[
          { value: 'mobile', label: t('deviceMobile') },
          { value: 'desktop', label: t('deviceDesktop') },
        ]}
      />
      {!slide ? (
        <EmptyState
          title={t('noLiveSlidesFor', {
            device: t(device === 'mobile' ? 'deviceMobile' : 'deviceDesktop'),
          })}
        />
      ) : (
        <div className={'hero-preview ' + device}>
          {videoRow?.status === 'ready' ? (
            <video
              key={slide.id}
              src={mediaSrc(
                apiOrigin,
                videoRow.id,
                device === 'mobile' ? 'video' : 'video_h',
              )}
              crossOrigin="use-credentials"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : slide.imageMediaId ? (
            <img
              src={mediaSrc(apiOrigin, String(slide.imageMediaId), 'full')}
              crossOrigin="use-credentials"
              alt=""
            />
          ) : null}
          <div className="hero-preview-copy">
            {Boolean(content(slide.kicker, locale)) && (
              <p className="kicker">{content(slide.kicker, locale)}</p>
            )}
            <h2>{slideName(slide, collections, locale, '')}</h2>
            <p>{content(slide.subline, locale)}</p>
            {Boolean(content(slide.ctaLabel, locale)) && (
              <span className="hero-preview-cta">
                {content(slide.ctaLabel, locale)}
              </span>
            )}
          </div>
          <p className="hero-preview-count">
            {(index % shown.length) + 1} / {shown.length}
          </p>
        </div>
      )}
    </Modal>
  );
}

type HeroState = {
  media: {
    videoMediaId: string | null;
    imageMediaId: string | null;
    collectionId: string;
  };
  text: { kicker: Loc; headline: Loc; subline: Loc; ctaLabel: Loc };
  button: { ctaType: string; ctaTarget: string };
  display: {
    durationS: number;
    showOn: string;
    startsAt: string;
    endsAt: string;
  };
};

export function HeroEditor({ id }: { id: string }) {
  const { t, locale, me, write, save } = useAdmin(),
    list = useData<Row[]>('/v1/admin/hero-slides'),
    collections = useData<Row[]>('/v1/admin/collections'),
    trips = useData<Row[]>('/v1/admin/trips'),
    packages = useData<Row[]>('/v1/admin/packages'),
    translations = useData<Row[]>(
      `/v1/admin/i18n/values?entity=hero_slide&id=${id}`,
    ),
    { navigate } = useGuard(),
    canLive = can(me!.role, 'heroLive');
  const row = list.data?.find((r) => r.id === id);
  const initial = useMemo<HeroState | null>(() => {
    if (!row || !translations.data) return null;
    const tl = (key: string, field: string) =>
      loc(row[key], translations.data!, field);
    return {
      media: {
        videoMediaId: (row.videoMediaId as string) ?? null,
        imageMediaId: (row.imageMediaId as string) ?? null,
        collectionId: String(row.collectionId ?? ''),
      },
      text: {
        kicker: tl('kicker', 'kicker'),
        headline: tl('headline', 'headline'),
        subline: tl('subline', 'subline'),
        ctaLabel: tl('ctaLabel', 'cta_label'),
      },
      button: {
        ctaType: String(row.ctaType ?? 'my_trip'),
        ctaTarget: String(row.ctaTarget ?? ''),
      },
      display: {
        durationS: Number(row.durationS ?? 6),
        showOn: String(row.showOn ?? 'all'),
        startsAt: utcToCairoInput(row.startsAt as string | null),
        endsAt: utcToCairoInput(row.endsAt as string | null),
      },
    };
  }, [row?.updatedAt, translations.dataUpdatedAt, !!row]);
  const labels = {
    media: t('media'),
    text: t('text'),
    button: t('button'),
    display: t('display'),
  };
  const patch = async (body: unknown) =>
    (await write('/v1/admin/hero-slides/' + id, 'PATCH', body)).revisions;
  const editor = useEditor<HeroState>({
    id: 'hero-' + id,
    initial,
    sourceKey: String(row?.updatedAt) + translations.dataUpdatedAt,
    order: ['media', 'text', 'button', 'display'],
    labels,
    success: t('slideSaved'),
    afterSave: () => Promise.all([list.refetch(), translations.refetch()]),
    validate: {
      button: (v) =>
        ['collection', 'trip', 'package', 'page'].includes(v.ctaType) &&
        !v.ctaTarget
          ? t('chooseDestination')
          : null,
      display: (v) =>
        v.startsAt && v.endsAt && v.endsAt <= v.startsAt
          ? t('endAfterStart')
          : v.durationS < 3 || v.durationS > 20
            ? t('durationRange')
            : null,
    },
    savers: {
      media: (v) =>
        patch({
          videoMediaId: v.videoMediaId,
          imageMediaId: v.imageMediaId,
          collectionId: v.collectionId || null,
        }),
      text: (v) =>
        patch({
          kicker: locOut(v.kicker),
          headline: locOut(v.headline),
          subline: locOut(v.subline),
          ctaLabel: locOut(v.ctaLabel),
        }),
      button: (v) =>
        patch({
          ctaType: v.ctaType,
          ctaTarget: ['collection', 'trip', 'package', 'page'].includes(
            v.ctaType,
          )
            ? v.ctaTarget
            : null,
        }),
      display: (v) =>
        patch({
          durationS: v.durationS,
          showOn: v.showOn,
          startsAt: v.startsAt ? cairoInputToUtc(v.startsAt) : null,
          endsAt: v.endsAt ? cairoInputToUtc(v.endsAt) : null,
        }),
    },
  });
  if (list.isError)
    return (
      <div className="page">
        <LoadError retry={() => void list.refetch()} />
      </div>
    );
  if (list.data && !row)
    return (
      <div className="page">
        <EmptyState title={t('notFoundTitle')} body={t('slideMissing')} />
      </div>
    );
  const v = editor.values,
    cols = collections.data ?? [],
    name = row ? slideName(row, cols, locale, t('untitledSlide')) : '';
  const targetOptions =
    v?.button.ctaType === 'collection'
      ? cols
          .filter((c) => !c.archivedAt)
          .map((c) => ({
            value: String(c.slug),
            label: content(c.name, locale),
          }))
      : v?.button.ctaType === 'trip'
        ? (trips.data ?? [])
            .filter((r) => r.kind === 'trip')
            .map((r) => ({
              value: String(r.slug),
              label: content(r.title, locale),
            }))
        : v?.button.ctaType === 'package'
          ? (packages.data ?? []).map((r) => ({
              value: String(r.slug),
              label: content(r.title, locale),
            }))
          : v?.button.ctaType === 'page'
            ? pages.map((p) => ({ value: p.value, label: t(p.key) }))
            : [];
  return (
    <EditorLayout
      back={{ href: '/hero', label: t('hero') }}
      title={name || t('untitledSlide')}
      loading={!v}
      editor={editor as never}
      onMarkReviewed={(code) => v && editor.replaceAll(markReviewed(v, code))}
      status={
        row ? (
          <StatusMenu
            status={contentStatus(row)}
            name={name}
            canPublish={canLive}
            onPublish={async () => {
              if (editor.dirty.length && !(await editor.save())) return;
              await save(
                '/v1/admin/hero-slides/' + id + '/publish',
                'POST',
                {},
                { success: t('slidePublished') },
              );
            }}
            onUnpublish={() =>
              save(
                '/v1/admin/hero-slides/' + id + '/unpublish',
                'POST',
                {},
                { success: t('slideUnpublished') },
              )
            }
            onArchive={
              canLive
                ? async () => {
                    await save(
                      '/v1/admin/hero-slides/' + id + '/archive',
                      'POST',
                      {},
                      { success: t('slideArchived') },
                    );
                    await navigate('/hero');
                  }
                : undefined
            }
          />
        ) : undefined
      }
      sections={
        v
          ? [
              {
                id: 'media',
                label: labels.media,
                content: (
                  <>
                    <MediaSlot
                      label={t('video')}
                      kind="video"
                      mediaId={v.media.videoMediaId}
                      onChange={(videoMediaId) =>
                        editor.set('media', { ...v.media, videoMediaId })
                      }
                    />
                    <MediaSlot
                      label={t('fallbackImage')}
                      kind="image"
                      hint={t('fallbackImageHint')}
                      mediaId={v.media.imageMediaId}
                      onChange={(imageMediaId) =>
                        editor.set('media', { ...v.media, imageMediaId })
                      }
                    />
                    <FormField
                      label={t('linkedCollection')}
                      hint={t('linkedCollectionHint')}
                    >
                      {(p) => (
                        <select
                          {...p}
                          value={v.media.collectionId}
                          onChange={(e) =>
                            editor.set('media', {
                              ...v.media,
                              collectionId: e.target.value,
                            })
                          }
                        >
                          <option value="">{t('none')}</option>
                          {cols.map((c) => (
                            <option key={c.id} value={c.id}>
                              {content(c.name, locale)}
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>
                  </>
                ),
              },
              {
                id: 'text',
                label: labels.text,
                content: (
                  <>
                    <I18nField
                      label={t('kicker')}
                      value={v.text.kicker}
                      onChange={(kicker) =>
                        editor.set('text', { ...v.text, kicker })
                      }
                    />
                    <I18nField
                      label={t('headline')}
                      hint={
                        v.media.collectionId
                          ? t('headlineFallbackHint')
                          : undefined
                      }
                      value={v.text.headline}
                      onChange={(headline) =>
                        editor.set('text', { ...v.text, headline })
                      }
                    />
                    <I18nField
                      label={t('supportingText')}
                      multiline
                      value={v.text.subline}
                      onChange={(subline) =>
                        editor.set('text', { ...v.text, subline })
                      }
                    />
                    <I18nField
                      label={t('buttonText')}
                      value={v.text.ctaLabel}
                      onChange={(ctaLabel) =>
                        editor.set('text', { ...v.text, ctaLabel })
                      }
                    />
                  </>
                ),
              },
              {
                id: 'button',
                label: labels.button,
                content: (
                  <>
                    <FormField label={t('buttonGoesTo')}>
                      {(p) => (
                        <select
                          {...p}
                          value={v.button.ctaType}
                          onChange={(e) => {
                            const ctaType = e.target.value,
                              loaded = editor.base?.button;
                            // Switching back restores the saved destination (so it's not "unsaved").
                            editor.set('button', {
                              ctaType,
                              ctaTarget:
                                loaded && loaded.ctaType === ctaType
                                  ? loaded.ctaTarget
                                  : '',
                            });
                          }}
                        >
                          {[
                            'collection',
                            'trip',
                            'package',
                            'my_trip',
                            'whatsapp',
                            'page',
                          ].map((type) => (
                            <option key={type} value={type}>
                              {t('cta_' + type)}
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>
                    {targetOptions.length > 0 ||
                    ['collection', 'trip', 'package', 'page'].includes(
                      v.button.ctaType,
                    ) ? (
                      <FormField label={t('cta_' + v.button.ctaType)}>
                        {(p) => (
                          <select
                            {...p}
                            value={v.button.ctaTarget}
                            onChange={(e) =>
                              editor.set('button', {
                                ...v.button,
                                ctaTarget: e.target.value,
                              })
                            }
                          >
                            <option value="">{t('choose')}</option>
                            {targetOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </FormField>
                    ) : (
                      <p className="field-hint">
                        {t(
                          v.button.ctaType === 'whatsapp'
                            ? 'whatsappHint'
                            : 'myTripHint',
                        )}
                      </p>
                    )}
                  </>
                ),
              },
              {
                id: 'display',
                label: labels.display,
                content: (
                  <>
                    <FormField
                      label={t('displayTime')}
                      hint={t('displayTimeHint')}
                    >
                      {(p) => (
                        <div className="range-row">
                          <input
                            type="range"
                            min={3}
                            max={20}
                            value={v.display.durationS}
                            aria-label={t('displayTime')}
                            onChange={(e) =>
                              editor.set('display', {
                                ...v.display,
                                durationS: Number(e.target.value),
                              })
                            }
                          />
                          <input
                            {...p}
                            type="number"
                            min={3}
                            max={20}
                            value={v.display.durationS}
                            onChange={(e) =>
                              editor.set('display', {
                                ...v.display,
                                durationS: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      )}
                    </FormField>
                    <FieldGroup legend={t('showsOn')}>
                      <Segmented
                        label={t('showsOn')}
                        value={v.display.showOn}
                        onChange={(showOn) =>
                          editor.set('display', { ...v.display, showOn })
                        }
                        options={[
                          { value: 'all', label: t('show_all') },
                          { value: 'mobile', label: t('show_mobile') },
                          { value: 'desktop', label: t('show_desktop') },
                        ]}
                      />
                    </FieldGroup>
                    <div className="field-row-2">
                      <FormField label={t('startsAt')} hint={t('cairoTime')}>
                        {(p) => (
                          <input
                            {...p}
                            type="datetime-local"
                            value={v.display.startsAt}
                            onChange={(e) =>
                              editor.set('display', {
                                ...v.display,
                                startsAt: e.target.value,
                              })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label={t('endsAt')} hint={t('cairoTime')}>
                        {(p) => (
                          <input
                            {...p}
                            type="datetime-local"
                            value={v.display.endsAt}
                            onChange={(e) =>
                              editor.set('display', {
                                ...v.display,
                                endsAt: e.target.value,
                              })
                            }
                          />
                        )}
                      </FormField>
                    </div>
                    <p className="field-hint">{t('scheduleEmptyHint')}</p>
                  </>
                ),
              },
              {
                id: 'history',
                label: t('history'),
                content: <HistorySection entities={['hero_slide']} id={id} />,
              },
            ]
          : []
      }
    />
  );
}
