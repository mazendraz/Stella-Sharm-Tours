'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUrlState } from '../lib/url-state';
import { Upload } from 'lucide-react';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { loc, locOut, markReviewed, type Loc } from '../lib/loc';
import { useEditor } from '../lib/editor';
import { useMediaOptions } from '../lib/media-options';
import { useGuard } from '../lib/guard';
import { PageHeader } from '../components/ui/page-header';
import { SearchBox } from '../components/ui/data-table';
import { FilterBar } from '../components/ui/filter-bar';
import { EditorLayout } from '../components/ui/editor';
import {
  FormField,
  I18nField,
  Toggle,
  AutoTextarea,
} from '../components/ui/field';
import { useConfirm } from '../components/ui/dialog';
import {
  EmptyState,
  LoadError,
  Skeleton,
  Callout,
} from '../components/ui/states';
import { AppLink } from '../components/ui/link';
import {
  MediaThumb,
  UploadButton,
  UploadProgress,
  durationLabel,
  mediaSrc,
  useUploader,
} from '../components/ui/media-picker';
import { HistorySection } from '../components/history';

const rightsOptions = ['owned', 'licensed', 'permission', 'unknown'] as const;

export function MediaLibrary() {
  const { t, tp, locale } = useAdmin(),
    media = useMediaOptions(),
    collections = useData<Row[]>('/v1/admin/collections'),
    [filters, setFilters] = useUrlState({
      q: '',
      type: '',
      rights: '',
      usage: '',
      collection: '',
    }),
    { q, type, rights, usage, collection } = filters,
    setQ = (v: string) => setFilters({ q: v }),
    setType = (v: string) => setFilters({ type: v }),
    setRights = (v: string) => setFilters({ rights: v }),
    setUsage = (v: string) => setFilters({ usage: v }),
    setCollection = (v: string) => setFilters({ collection: v }),
    [dragging, setDragging] = useState(false),
    upload = useUploader(),
    depth = useRef(0),
    byCollection = useData<Row[]>(
      '/v1/admin/media?page=1&collection=' + collection,
      !!collection,
    );
  // Keep polling while something is still processing.
  useEffect(() => {
    if (!media.data?.some((row) => row.status === 'processing')) return;
    const timer = setInterval(() => void media.refetch(), 5000);
    return () => clearInterval(timer);
  }, [media]);
  // Full-page drag-and-drop.
  useEffect(() => {
    const has = (e: DragEvent) =>
      [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => has(e) && e.preventDefault();
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void upload.run(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [upload]);
  const inCollection = useMemo(
    () => new Set((byCollection.data ?? []).map((r) => r.id)),
    [byCollection.data],
  );
  const needle = q.trim().toLocaleLowerCase(locale);
  const list = (media.data ?? []).filter(
    (row) =>
      (!needle ||
        content(row.alt, locale).toLocaleLowerCase(locale).includes(needle)) &&
      (!type || row.kind === type) &&
      (!rights || row.rightsStatus === rights) &&
      (!usage || (usage === 'used') === !!row.used) &&
      (!collection || inCollection.has(row.id)),
  );
  const filtering = !!(needle || type || rights || usage || collection);
  return (
    <div className="page">
      <PageHeader
        title={t('media')}
        description={t('mediaDesc')}
        secondary={
          <UploadButton
            className="btn btn-primary page-primary"
            label={t('upload')}
          />
        }
      />
      <div className="table-toolbar">
        <FilterBar
          search={
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder={t('searchMedia')}
            />
          }
          active={[type, rights, usage, collection].filter(Boolean).length}
        >
          <label className="mini-field">
            <span>{t('type')}</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t('allTypes')}</option>
              <option value="image">{t('images')}</option>
              <option value="video">{t('videos')}</option>
            </select>
          </label>
          <label className="mini-field">
            <span>{t('rights')}</span>
            <select value={rights} onChange={(e) => setRights(e.target.value)}>
              <option value="">{t('allRights')}</option>
              {rightsOptions.map((r) => (
                <option key={r} value={r}>
                  {t('rights_' + r)}
                </option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            <span>{t('usage')}</span>
            <select value={usage} onChange={(e) => setUsage(e.target.value)}>
              <option value="">{t('allUsage')}</option>
              <option value="used">{t('used')}</option>
              <option value="unused">{t('unused')}</option>
            </select>
          </label>
          <label className="mini-field">
            <span>{t('collection')}</span>
            <select
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            >
              <option value="">{t('allCollections')}</option>
              {(collections.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {content(c.name, locale)}
                </option>
              ))}
            </select>
          </label>
        </FilterBar>
        {!media.isPending && (
          <span className="result-count" role="status">
            {tp('mediaCount', list.length)}
          </span>
        )}
      </div>
      {upload.progress.length > 0 && <UploadProgress items={upload.progress} />}
      {media.isPending ? (
        <Skeleton variant="grid" rows={12} />
      ) : media.isError ? (
        <LoadError retry={() => void media.refetch()} />
      ) : !list.length ? (
        filtering ? (
          <EmptyState
            variant="filtered"
            title={needle ? t('noMediaMatch', { q }) : t('noMediaFiltered')}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilters({
                    q: '',
                    type: '',
                    rights: '',
                    usage: '',
                    collection: '',
                  });
                }}
              >
                {t('clearFilters')}
              </button>
            }
          />
        ) : (
          <EmptyState
            title={t('noMediaYet')}
            body={t('noMediaYetBody')}
            action={<UploadButton label={t('upload')} />}
          />
        )
      ) : (
        <ul className="media-grid" aria-label={t('media')}>
          {list.map((row) => {
            const name = content(row.alt, locale) || t('untitledMedia');
            return (
              <li key={row.id}>
                <AppLink href={'/media/' + row.id} className="media-tile">
                  <span className="media-tile-img">
                    <MediaThumb media={row} size={320} className="tile-img" />
                    {row.kind === 'video' && (
                      <span className="tile-duration">
                        ▶ {durationLabel(row.durationS)}
                      </span>
                    )}
                    {row.status === 'processing' && (
                      <span className="tile-processing">{t('processing')}</span>
                    )}
                  </span>
                  <span className="media-tile-name truncate" title={name}>
                    {name}
                  </span>
                  <span className="media-tile-chips">
                    <span className={'chip rights-' + String(row.rightsStatus)}>
                      {t('rights_' + String(row.rightsStatus))}
                    </span>
                    {!row.used && <span className="chip">{t('unused')}</span>}
                  </span>
                </AppLink>
              </li>
            );
          })}
        </ul>
      )}
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <Upload size={40} />
          <p>{t('dropToUpload')}</p>
        </div>
      )}
    </div>
  );
}

type MediaState = {
  details: {
    alt: Loc;
    credit: string;
    license: string;
    rightsStatus: string;
    autoEnhance: boolean;
  };
  preview: { x: number; y: number };
};

export function MediaDetail({ id }: { id: string }) {
  const { t, locale, write, save, apiOrigin, report } = useAdmin(),
    query = useData<Row>('/v1/admin/media/' + id),
    translations = useData<Row[]>(
      `/v1/admin/i18n/values?entity=media&id=${id}`,
    ),
    collections = useData<Row[]>('/v1/admin/collections'),
    confirm = useConfirm(),
    { navigate } = useGuard();
  const row = query.data;
  useEffect(() => {
    if (row?.status !== 'processing') return;
    const timer = setInterval(() => void query.refetch(), 5000);
    return () => clearInterval(timer);
  }, [row?.status, query]);
  const initial = useMemo<MediaState | null>(() => {
    if (!row || !translations.data) return null;
    return {
      details: {
        alt: loc(row.alt, translations.data, 'alt'),
        credit: String(row.credit ?? ''),
        license: String(row.license ?? ''),
        rightsStatus: String(row.rightsStatus ?? 'unknown'),
        autoEnhance: !!row.autoEnhance,
      },
      preview: { x: Number(row.focalX ?? 0.5), y: Number(row.focalY ?? 0.5) },
    };
  }, [query.dataUpdatedAt, translations.dataUpdatedAt]);
  const isVideo = row?.kind === 'video';
  const labels = { details: t('details'), preview: t('focalPoint') };
  const editor = useEditor<MediaState>({
    id: 'media-' + id,
    initial,
    sourceKey: String(query.dataUpdatedAt) + translations.dataUpdatedAt,
    order: ['preview', 'details'],
    labels,
    success: t(isVideo ? 'videoSaved' : 'imageSaved'),
    afterSave: () => Promise.all([query.refetch(), translations.refetch()]),
    savers: {
      details: async (v) =>
        (
          await write('/v1/admin/media/' + id, 'PATCH', {
            ...(locOut(v.alt) ? { alt: locOut(v.alt) } : {}),
            credit: v.credit.trim() || null,
            license: v.license.trim() || null,
            rightsStatus: v.rightsStatus,
            autoEnhance: v.autoEnhance,
          })
        ).revisions,
      preview: async (v) =>
        (
          await write('/v1/admin/media/' + id, 'PATCH', {
            focalX: Number(v.x.toFixed(3)),
            focalY: Number(v.y.toFixed(3)),
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
    name = content(row?.alt, locale) || t('untitledMedia');
  const used = obj(row?.where_used);
  const whereUsed = [
    ...rows(used.trips).map((r) => ({
      key: 't' + r.id,
      label: t('entCap_trip') + ' · ' + content(r.title, locale),
      href: '/trips/' + r.id,
    })),
    ...rows(used.collections).map((r) => ({
      key: 'c' + r.id,
      label: t('entCap_collection') + ' · ' + content(r.name, locale),
      href: '/collections/' + r.id,
    })),
    ...rows(used.slides).map((r) => ({
      key: 's' + r.id,
      label:
        t('entCap_hero_slide') +
        ' · ' +
        (content(r.name ?? r.headline, locale) || t('untitled')),
      href: '/hero/' + r.id,
    })),
  ];
  void collections;
  return (
    <EditorLayout
      back={{ href: '/media', label: t('media') }}
      title={name}
      loading={!v || !row}
      editor={editor as never}
      onMarkReviewed={(code) => v && editor.replaceAll(markReviewed(v, code))}
      banner={
        <>
          {row?.status === 'processing' && (
            <Callout tone="info">{t('processingNote')}</Callout>
          )}
          {row?.rightsStatus === 'unknown' && (
            <Callout tone="warning">{t('rightsWarning')}</Callout>
          )}
        </>
      }
      menu={[
        {
          label: t('archive'),
          tone: 'danger',
          onSelect: async () => {
            if (whereUsed.length) {
              await confirm({
                title: t('cannotArchiveTitle'),
                body: t('cannotArchiveBody'),
                details: whereUsed.map((w) => w.label),
                confirmLabel: t('ok'),
              });
              return;
            }
            if (
              await confirm({
                title: t('archiveTitle', { name }),
                body: t('archiveMediaBody'),
                confirmLabel: t('archive'),
                tone: 'danger',
              })
            ) {
              try {
                await save(
                  '/v1/admin/media/' + id,
                  'DELETE',
                  {},
                  { success: t('mediaArchived') },
                );
                await navigate('/media');
              } catch (error) {
                report(error);
              }
            }
          },
        },
      ]}
      sections={
        v && row
          ? [
              {
                id: 'preview',
                label: isVideo ? t('videoAndTrim') : t('preview'),
                content: isVideo ? (
                  <VideoTrim row={row} />
                ) : (
                  <FocalEditor
                    src={mediaSrc(apiOrigin, id, 'full')}
                    ready={row.status === 'ready'}
                    value={v.preview}
                    onChange={(focal) => editor.set('preview', focal)}
                    alt={name}
                  />
                ),
              },
              {
                id: 'details',
                label: labels.details,
                content: (
                  <>
                    <I18nField
                      label={t(
                        isVideo ? 'videoDescription' : 'imageDescription',
                      )}
                      hint={t('altHint')}
                      value={v.details.alt}
                      multiline
                      showErrors={editor.showErrors}
                      onChange={(alt) =>
                        editor.set('details', { ...v.details, alt })
                      }
                    />
                    <FormField label={t('credit')}>
                      {(p) => (
                        <input
                          {...p}
                          value={v.details.credit}
                          maxLength={500}
                          onChange={(e) =>
                            editor.set('details', {
                              ...v.details,
                              credit: e.target.value,
                            })
                          }
                        />
                      )}
                    </FormField>
                    <FormField label={t('rights')}>
                      {(p) => (
                        <select
                          {...p}
                          value={v.details.rightsStatus}
                          onChange={(e) =>
                            editor.set('details', {
                              ...v.details,
                              rightsStatus: e.target.value,
                            })
                          }
                        >
                          {rightsOptions.map((r) => (
                            <option key={r} value={r}>
                              {t('rights_' + r)}
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>
                    <FormField
                      label={t('licenseRecord')}
                      hint={t('licenseHint')}
                    >
                      {(p) => (
                        <AutoTextarea
                          {...p}
                          value={v.details.license}
                          maxLength={1000}
                          onChange={(e) =>
                            editor.set('details', {
                              ...v.details,
                              license: e.target.value,
                            })
                          }
                        />
                      )}
                    </FormField>
                    <Toggle
                      checked={v.details.autoEnhance}
                      onChange={(autoEnhance) =>
                        editor.set('details', { ...v.details, autoEnhance })
                      }
                      label={t('warmEnhancement')}
                      hint={t('warmEnhancementHint')}
                    />
                  </>
                ),
              },
              {
                id: 'used',
                label: t('whereUsed'),
                content: !whereUsed.length ? (
                  <p className="muted">{t('notUsedAnywhere')}</p>
                ) : (
                  <ul className="simple-list">
                    {whereUsed.map((w) => (
                      <li key={w.key}>
                        <AppLink href={w.href} className="simple-row">
                          <span className="simple-main">{w.label}</span>
                        </AppLink>
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                id: 'history',
                label: t('history'),
                content: <HistorySection entities={['media']} id={id} />,
              },
            ]
          : []
      }
    />
  );
}

/** Click/drag a crosshair. Changes form state only — saved with Save. */
function FocalEditor({
  src,
  ready,
  value,
  onChange,
  alt,
}: {
  src: string;
  ready: boolean;
  value: { x: number; y: number };
  onChange: (v: { x: number; y: number }) => void;
  alt: string;
}) {
  const { t } = useAdmin(),
    box = useRef<HTMLDivElement>(null),
    dragging = useRef(false);
  if (!ready) return <Skeleton rows={1} />;
  const place = (clientX: number, clientY: number) => {
    const rect = box.current!.getBoundingClientRect();
    onChange({
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    });
  };
  const nudge = (dx: number, dy: number) => {
    const snap = (v: number) =>
      Math.min(1, Math.max(0, Math.round(v * 100) / 100));
    onChange({ x: snap(value.x + dx), y: snap(value.y + dy) });
  };
  return (
    <div className="focal">
      <p className="muted">{t('focalHint')}</p>
      <div
        ref={box}
        className="focal-box"
        role="slider"
        tabIndex={0}
        aria-label={t('focalPoint')}
        aria-valuetext={t('focalValue', {
          x: Math.round(value.x * 100),
          y: Math.round(value.y * 100),
        })}
        aria-valuenow={Math.round(value.x * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          place(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && place(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          const map: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          if (map[e.key]) {
            e.preventDefault();
            nudge(...map[e.key]!);
          }
        }}
      >
        <img
          src={src}
          crossOrigin="use-credentials"
          alt={alt}
          draggable={false}
        />
        <span
          className="focal-cross"
          style={{ left: value.x * 100 + '%', top: value.y * 100 + '%' }}
          aria-hidden
        />
      </div>
      <p className="focal-readout">
        X {Math.round(value.x * 100)}% · Y {Math.round(value.y * 100)}%
      </p>
    </div>
  );
}

function VideoTrim({ row }: { row: Row }) {
  const { t, apiOrigin, save, report } = useAdmin(),
    confirm = useConfirm(),
    video = useRef<HTMLVideoElement>(null),
    duration = Math.max(1, Number(row.durationS ?? 20)),
    [start, setStart] = useState(Number(row.trimStart ?? 0)),
    [end, setEnd] = useState(Number(row.trimEnd ?? Math.min(20, duration))),
    [poster, setPoster] = useState(
      Number(row.posterTime ?? row.trimStart ?? 0),
    ),
    [precise, setPrecise] = useState(false),
    [busy, setBusy] = useState(false);
  const landscape = Number(row.width) > Number(row.height);
  const changed =
    start !== Number(row.trimStart ?? 0) ||
    end !== Number(row.trimEnd ?? Math.min(20, duration)) ||
    poster !== Number(row.posterTime ?? row.trimStart ?? 0);
  const length = end - start,
    invalid = length <= 0 || length > 20 || poster < start || poster > end;
  const pct = (v: number) => (v / duration) * 100 + '%';
  const fmt = (v: number) => v.toFixed(1) + ' s';
  return (
    <div className="trim">
      {row.status === 'ready' && (
        <video
          ref={video}
          className="video-preview"
          src={mediaSrc(apiOrigin, row.id, landscape ? 'video_h' : 'video')}
          crossOrigin="use-credentials"
          controls
          playsInline
          muted
          preload="metadata"
        />
      )}
      <p className="muted small">{t('trimNote')}</p>
      <div className="timeline" aria-label={t('trimTimeline')}>
        <div className="timeline-track">
          <span
            className="timeline-range"
            style={{ left: pct(start), width: pct(Math.max(0, end - start)) }}
          />
          <span
            className="timeline-poster"
            style={{ left: pct(poster) }}
            title={t('posterFrame')}
          />
        </div>
        <input
          type="range"
          className="timeline-handle"
          min={0}
          max={duration}
          step={0.1}
          value={start}
          aria-label={t('trimStart')}
          aria-valuetext={fmt(start)}
          onChange={(e) => {
            const value = Math.min(Number(e.target.value), end - 0.5);
            setStart(value);
            if (poster < value) setPoster(value);
          }}
        />
        <input
          type="range"
          className="timeline-handle"
          min={0}
          max={duration}
          step={0.1}
          value={end}
          aria-label={t('trimEnd')}
          aria-valuetext={fmt(end)}
          onChange={(e) => {
            const value = Math.max(Number(e.target.value), start + 0.5);
            setEnd(value);
            if (poster > value) setPoster(value);
          }}
        />
      </div>
      <p className="trim-readout">
        {fmt(start)} → {fmt(end)} · <strong>{fmt(length)}</strong>
        {length > 20 && <span className="field-error"> {t('trimMax')}</span>}
      </p>
      <div className="inline-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const now = video.current?.currentTime ?? start;
            setPoster(Math.min(end, Math.max(start, Number(now.toFixed(1)))));
          }}
        >
          {t('posterFromPlayer')}
        </button>
        <span className="muted small">
          {t('posterFrame')}: {fmt(poster)}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={precise}
          onClick={() => setPrecise((v) => !v)}
        >
          {t('precise')}
        </button>
      </div>
      {precise && (
        <div className="field-row-3">
          {(
            [
              ['trimStart', start, setStart],
              ['trimEnd', end, setEnd],
              ['posterFrame', poster, setPoster],
            ] as const
          ).map(([key, value, setter]) => (
            <FormField key={key} label={t(key) + ' (s)'}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                />
              )}
            </FormField>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!changed || invalid || busy}
        onClick={async () => {
          if (
            !(await confirm({
              title: t('trimTitle', {
                name: content(row.alt, 'en') || t('untitledMedia'),
              }),
              body: t('trimBody'),
              confirmLabel: t('applyTrim'),
            }))
          )
            return;
          setBusy(true);
          try {
            await save(
              '/v1/admin/media/' + row.id + '/trim',
              'POST',
              { start, end, poster },
              { success: t('trimApplied') },
            );
          } catch (error) {
            report(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <span className="spinner" aria-hidden />}
        {t('applyTrim')}
      </button>
    </div>
  );
}
