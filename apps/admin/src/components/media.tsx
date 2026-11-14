'use client';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { can, mediaPatchSchema, heroSchema } from '@stella/shared/admin';
import { useAdmin, useData, type Me } from '../lib/admin-context';
import { obj, rows, content, type Row } from '../lib/content';
import { EditorForm, type Field } from './forms';
import { local, select, HistoryPanel } from './trips';
import { Loading, Failure, Empty, Sheet, Pill, ConfirmButton } from './ui';
import { OrderList } from './order-list';
import { resizeImage, uploadFile } from '../lib/upload';
import { useMediaOptions } from '../lib/media-options';
export function MediaThumb({
  row,
  video = false,
}: {
  row: Row;
  video?: boolean;
}) {
  const { apiOrigin, t, locale } = useAdmin();
  if (row.status !== 'ready')
    return (
      <div className="thumb" role="img" aria-label={t(String(row.status))} />
    );
  const src =
    apiOrigin +
    '/v1/admin/media/' +
    row.id +
    '/preview?variant=' +
    (row.kind === 'video' ? (video ? 'mp4_v' : 'poster') : '480.jpg');
  return video ? (
    <video
      src={src}
      controls
      crossOrigin="use-credentials"
      playsInline
      autoPlay
      muted
      loop
    />
  ) : (
    <img
      className="thumb"
      src={src}
      crossOrigin="use-credentials"
      alt={content(row.alt, locale)}
    />
  );
}
export function Media() {
  const { t, locale, request, apiOrigin, report, online } = useAdmin(),
    client = useQueryClient(),
    [filter, setFilter] = useState(''),
    [collection, setCollection] = useState(''),
    collections = useData<Row[]>('/v1/admin/collections'),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(''),
    [progress, setProgress] = useState<{ name: string; value: number }[]>([]),
    [uploading, setUploading] = useState(false),
    query = useData<Row[]>(
      `/v1/admin/media?page=${page}${filter ? '&filter=' + filter : ''}${collection ? '&collection=' + collection : ''}`,
    );
  useEffect(() => {
    if (!query.data?.some((row) => row.status === 'processing')) return;
    const timer = setInterval(() => void query.refetch(), 5000);
    return () => clearInterval(timer);
  }, [query]);
  return (
    <>
      <div className="toolbar">
        <label>
          {t('collectionId')}
          <select
            value={collection}
            onChange={(event) => {
              setCollection(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('all')}</option>
            {collections.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {content(row.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('upload')}
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,video/mp4,video/quicktime"
            disabled={uploading || !online}
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? []).slice(0, 10);
              setUploading(true);
              setProgress(files.map((file) => ({ name: file.name, value: 0 })));
              try {
                const me = await request<Me>('/v1/admin/me');
                for (const [index, file] of files.entries()) {
                  const prepared = await resizeImage(file);
                  await uploadFile(
                    apiOrigin,
                    me.csrf_token,
                    prepared,
                    (value) =>
                      setProgress((previous) =>
                        previous.map((row, i) =>
                          i === index ? { ...row, value } : row,
                        ),
                      ),
                  );
                }
                await client.invalidateQueries();
              } catch (error) {
                report(error);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <label>
          {t('type')}
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            {['', 'image', 'video', 'unused', 'unknown'].map((value) => (
              <option key={value} value={value}>
                {t(value || 'all')}
              </option>
            ))}
          </select>
        </label>
      </div>
      {progress.map((row, index) => (
        <label key={index}>
          {row.name}
          <progress className="upload-meter" value={row.value} max={100} />
        </label>
      ))}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <Empty />
      ) : (
        <div className="media-grid">
          {query.data.map((row) => (
            <button
              className="card card-button"
              key={row.id}
              onClick={() => setSelected(row.id)}
            >
              <MediaThumb row={row} />
              <Pill value={String(row.status)} />
              <Pill value={String(row.rightsStatus)} />
              <span>{content(row.alt, locale)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        <button
          className="secondary"
          disabled={page === 1}
          onClick={() => setPage((v) => v - 1)}
        >
          {t('previous')}
        </button>
        <button
          className="secondary"
          disabled={(query.data?.length ?? 0) < 60}
          onClick={() => setPage((v) => v + 1)}
        >
          {t('next')}
        </button>
      </div>
      {selected && (
        <Sheet title={t('media')} onClose={() => setSelected('')}>
          <MediaEditor id={selected} />
        </Sheet>
      )}
    </>
  );
}
function MediaEditor({ id }: { id: string }) {
  const { t, save, apiOrigin, report, locale } = useAdmin(),
    query = useData<Row>('/v1/admin/media/' + id),
    translations = useData<Row[]>(
      `/v1/admin/i18n/values?entity=media&id=${id}`,
    ),
    [focal, setFocal] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => {
    if (query.data)
      setFocal({
        x: Number(query.data.focalX ?? 0.5),
        y: Number(query.data.focalY ?? 0.5),
      });
  }, [query.data?.focalX, query.data?.focalY]);
  useEffect(() => {
    if (query.data?.status !== 'processing') return;
    const timer = setInterval(() => void query.refetch(), 5000);
    return () => clearInterval(timer);
  }, [query.data?.status, query.refetch]);
  if (query.isPending) return <Loading />;
  if (!query.data) return <Failure retry={() => void query.refetch()} />;
  const row = query.data;
  return (
    <>
      {row.rightsStatus === 'unknown' && (
        <p className="warning">{t('rightsWarning')}</p>
      )}
      <MediaThumb row={row} video={row.kind === 'video'} />
      <EditorForm
        key={JSON.stringify([
          row.alt,
          row.credit,
          row.license,
          row.rightsStatus,
          row.autoEnhance,
        ])}
        schema={mediaPatchSchema}
        value={row}
        translations={translations.data ?? []}
        fields={[
          local('alt'),
          { key: 'credit', nullable: true },
          { key: 'license', nullable: true },
          {
            ...select('rightsStatus', [
              'owned',
              'licensed',
              'permission',
              'unknown',
            ]),
            label: 'rights',
          },
          { key: 'autoEnhance', kind: 'check' },
        ]}
        onSave={(data) => save('/v1/admin/media/' + id, 'PATCH', data)}
      />
      {row.kind === 'image' && row.status === 'ready' && (
        <>
          <p>{t('focal')}</p>
          <button
            className="focal-image"
            aria-label={t('focal')}
            onClick={async (event) => {
              if (event.detail === 0) {
                event.currentTarget.parentElement
                  ?.querySelector<HTMLInputElement>('input[type="range"]')
                  ?.focus();
                return;
              }
              const box = event.currentTarget
                  .querySelector('img')!
                  .getBoundingClientRect(),
                x = Math.max(
                  0,
                  Math.min(1, (event.clientX - box.left) / box.width),
                ),
                y = Math.max(
                  0,
                  Math.min(1, (event.clientY - box.top) / box.height),
                );
              setFocal({ x, y });
              try {
                await save('/v1/admin/media/' + id, 'PATCH', {
                  focalX: x,
                  focalY: y,
                });
              } catch (error) {
                report(error);
              }
            }}
          >
            <span className="focal-target">
              <img
                src={apiOrigin + '/v1/admin/media/' + id + '/preview'}
                crossOrigin="use-credentials"
                alt=""
              />
              <span
                className="focal-dot"
                style={{ left: focal.x * 100 + '%', top: focal.y * 100 + '%' }}
              />
            </span>
          </button>
          <div className="field-grid">
            <label>
              {t('focal')} X
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={focal.x}
                onChange={(event) =>
                  setFocal((value) => ({
                    ...value,
                    x: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              {t('focal')} Y
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={focal.y}
                onChange={(event) =>
                  setFocal((value) => ({
                    ...value,
                    y: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
          <button
            className="secondary"
            onClick={() =>
              void save('/v1/admin/media/' + id, 'PATCH', {
                focalX: focal.x,
                focalY: focal.y,
              }).catch(report)
            }
          >
            {t('save')}
          </button>
        </>
      )}
      {row.kind === 'video' && (
        <EditorForm
          value={{
            start: Number(row.trimStart ?? 0),
            end: Number(
              row.trimEnd ?? Math.min(20, Number(row.durationS ?? 20)),
            ),
            poster: Number(row.posterTime ?? row.trimStart ?? 0),
          }}
          fields={[
            {
              key: 'start',
              kind: 'range',
              step: 0.1,
              min: 0,
              max: Number(row.durationS ?? 3600),
            },
            {
              key: 'end',
              kind: 'range',
              step: 0.1,
              min: 1,
              max: Number(row.durationS ?? 3600),
            },
            {
              key: 'poster',
              kind: 'range',
              step: 0.1,
              min: 0,
              max: Number(row.durationS ?? 3600),
            },
          ]}
          submitLabel="trim"
          onSave={(data) =>
            save('/v1/admin/media/' + id + '/trim', 'POST', data)
          }
        />
      )}
      <h3>{t('whereUsed')}</h3>
      {Object.entries(obj(row.where_used)).map(([key, value]) => (
        <ul key={key}>
          {rows(value).map((item) => (
            <li key={item.id}>
              {content(item.title ?? item.name ?? item.headline, locale) ||
                item.id}
            </li>
          ))}
        </ul>
      ))}
      <ConfirmButton
        onConfirm={() => save('/v1/admin/media/' + id, 'DELETE', {})}
      >
        {t('archive')}
      </ConfirmButton>
      <HistoryPanel entity="media" id={id} />
    </>
  );
}
export function Heroes() {
  const { t, locale, me, save } = useAdmin(),
    query = useData<Row[]>('/v1/admin/hero-slides'),
    media = useMediaOptions(),
    collections = useData<Row[]>('/v1/admin/collections'),
    [selected, setSelected] = useState<Row | null>(null),
    [adding, setAdding] = useState(false),
    [preview, setPreview] = useState(false);
  const slideState = (row: Row) =>
    row.status !== 'published'
      ? String(row.status)
      : row.startsAt && Date.parse(String(row.startsAt)) > Date.now()
        ? 'scheduled'
        : row.endsAt && Date.parse(String(row.endsAt)) <= Date.now()
          ? 'off'
          : 'published';
  const live =
      query.data?.filter((row) => slideState(row) === 'published') ?? [],
    privateCollection = collections.data?.find(
      (row) => row.kind === 'private_virtual',
    );
  return (
    <>
      <div className="actions">
        <button onClick={() => setAdding(true)}>{t('add')}</button>
        <button className="secondary" onClick={() => setPreview(true)}>
          {t('preview')}
        </button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure retry={() => void query.refetch()} />
      ) : (
        <>
          {!live.length && <p className="warning">{t('noSlides')}</p>}
          {live.length > 10 && <p className="warning">{t('limitSlides')}</p>}
          {query.data?.some(
            (row, index) =>
              row.collectionId === privateCollection?.id && index > 0,
          ) && <p className="warning">{t('privateFirst')}</p>}
          <OrderList
            items={query.data ?? []}
            disabled={!can(me!.role, 'heroLive')}
            onReorder={(ids) =>
              save('/v1/admin/hero-slides/reorder', 'POST', { ids })
            }
            render={(row) => (
              <button className="link-button" onClick={() => setSelected(row)}>
                {content(row.headline, locale) ||
                  content(
                    collections.data?.find(
                      (collection) => collection.id === row.collectionId,
                    )?.name,
                    locale,
                  )}{' '}
                <Pill value={slideState(row)} />
                <small>
                  {new Intl.NumberFormat(locale, {
                    style: 'unit',
                    unit: 'second',
                    unitDisplay: 'short',
                  }).format(Number(row.durationS))}{' '}
                  · {t(String(row.showOn))}
                </small>
              </button>
            )}
          />
        </>
      )}
      {(selected || adding) && (
        <Sheet
          title={t('hero')}
          onClose={() => {
            setSelected(null);
            setAdding(false);
          }}
        >
          <HeroEditor
            key={JSON.stringify(
              query.data?.find((row) => row.id === selected?.id) ?? selected,
            )}
            value={
              query.data?.find((row) => row.id === selected?.id) ??
              selected ?? { durationS: 6, showOn: 'all', ctaType: 'collection' }
            }
            media={media.data ?? []}
            collections={collections.data ?? []}
            creating={adding}
            onCreated={() => setAdding(false)}
          />
        </Sheet>
      )}
      {preview && (
        <Sheet title={t('preview')} onClose={() => setPreview(false)}>
          <HeroPreview
            slides={query.data ?? []}
            media={media.data ?? []}
            collections={collections.data ?? []}
          />
        </Sheet>
      )}
    </>
  );
}
function HeroEditor({
  value,
  media,
  collections,
  creating,
  onCreated,
}: {
  value: Record<string, unknown>;
  media: Row[];
  collections: Row[];
  creating: boolean;
  onCreated: () => void;
}) {
  const { t, locale, me, save } = useAdmin(),
    translations = useData<Row[]>(
      `/v1/admin/i18n/values?entity=hero_slide&id=${value.id}`,
      !creating,
    ),
    targets = useData<Row[]>('/v1/admin/trips'),
    [uploading, setUploading] = useState(false);
  const fields: Field[] = [
    {
      key: 'videoMediaId',
      label: 'video',
      kind: 'select',
      nullable: true,
      options: media
        .filter(
          (row) =>
            row.kind === 'video' &&
            row.status === 'ready' &&
            (row.rightsStatus !== 'unknown' || row.id === value.videoMediaId),
        )
        .map((row) => ({
          value: row.id,
          label: content(row.alt, locale) || row.id.slice(0, 8),
          literal: true,
        })),
    },
    {
      key: 'imageMediaId',
      label: 'cover',
      kind: 'select',
      nullable: true,
      options: media
        .filter(
          (row) =>
            row.kind === 'image' &&
            row.status === 'ready' &&
            (row.rightsStatus !== 'unknown' || row.id === value.imageMediaId),
        )
        .map((row) => ({
          value: row.id,
          label: content(row.alt, locale) || row.id.slice(0, 8),
          literal: true,
        })),
    },
    {
      key: 'collectionId',
      kind: 'select',
      nullable: true,
      options: collections.map((row) => ({
        value: row.id,
        label: content(row.name, locale),
        literal: true,
      })),
    },
    local('kicker'),
    local('headline'),
    local('subline'),
    select('ctaType', [
      'collection',
      'trip',
      'package',
      'my_trip',
      'whatsapp',
      'page',
    ]),
    {
      key: 'ctaTarget',
      kind: 'select',
      nullable: true,
      dependsOn: 'ctaType',
      options: [
        ...collections.map((row) => ({
          value: String(row.slug),
          label: content(row.name, locale),
          literal: true,
          group: 'collection',
        })),
        ...(targets.data ?? []).map((row) => ({
          value: String(row.slug),
          label: content(row.title, locale),
          literal: true,
          group: row.kind === 'package' ? 'package' : 'trip',
        })),
        ...['contact', 'terms', 'privacy', 'cancellation'].map((value) => ({
          value: value === 'contact' ? '/contact' : '/legal/' + value,
          label: t(value),
          literal: true,
          group: 'page',
        })),
      ],
    },
    local('ctaLabel'),
    { key: 'durationS', kind: 'number', min: 3, max: 20 },
    select('showOn', ['all', 'mobile', 'desktop']),
    { key: 'startsAt', kind: 'datetime-local', nullable: true },
    { key: 'endsAt', kind: 'datetime-local', nullable: true },
  ];
  return (
    <>
      <EditorForm
        value={value}
        fields={fields}
        translations={translations.data ?? []}
        onSave={async (data) => {
          const normalized = {
            ...data,
            startsAt: data.startsAt
              ? new Date(
                  String(data.startsAt).endsWith('Z')
                    ? String(data.startsAt)
                    : String(data.startsAt) + 'Z',
                ).toISOString()
              : null,
            endsAt: data.endsAt
              ? new Date(
                  String(data.endsAt).endsWith('Z')
                    ? String(data.endsAt)
                    : String(data.endsAt) + 'Z',
                ).toISOString()
              : null,
          };
          heroSchema.parse(normalized);
          await save(
            '/v1/admin/hero-slides' + (creating ? '' : '/' + value.id),
            creating ? 'POST' : 'PATCH',
            normalized,
          );
          if (creating) onCreated();
        }}
      />
      {!creating && can(me!.role, 'heroLive') && (
        <div className="actions">
          <ConfirmButton
            onConfirm={() =>
              save('/v1/admin/hero-slides/' + value.id + '/publish', 'POST', {})
            }
          >
            {t('publish')}
          </ConfirmButton>
          <ConfirmButton
            onConfirm={() =>
              save(
                '/v1/admin/hero-slides/' + value.id + '/unpublish',
                'POST',
                {},
              )
            }
          >
            {t('off')}
          </ConfirmButton>
          <ConfirmButton
            onConfirm={() =>
              save('/v1/admin/hero-slides/' + value.id, 'DELETE', {})
            }
          >
            {t('archive')}
          </ConfirmButton>
        </div>
      )}
      {!creating && <HistoryPanel entity="hero_slide" id={String(value.id)} />}
      <button className="secondary" onClick={() => setUploading(true)}>
        {t('upload')}
      </button>
      {uploading && (
        <Sheet title={t('media')} onClose={() => setUploading(false)}>
          <Media />
        </Sheet>
      )}
    </>
  );
}
function HeroPreview({
  slides,
  media,
  collections,
}: {
  slides: Row[];
  media: Row[];
  collections: Row[];
}) {
  const { locale } = useAdmin(),
    [index, setIndex] = useState(0);
  useEffect(() => {
    if (!slides.length) return;
    const timer = setTimeout(
      () => setIndex((value) => (value + 1) % slides.length),
      Number(slides[index]?.durationS ?? 6) * 1000,
    );
    return () => clearTimeout(timer);
  }, [slides, index]);
  const slide = slides[index],
    row = media.find(
      (row) => row.id === (slide?.videoMediaId ?? slide?.imageMediaId),
    );
  return slide ? (
    <div className="phone-preview">
      {row && <MediaThumb row={row} video={row.kind === 'video'} />}
      <div className="preview-copy">
        <h2>
          {content(slide.headline, locale) ||
            content(
              collections.find((row) => row.id === slide.collectionId)
                ?.headline,
              locale,
            )}
        </h2>
        <p>{content(slide.subline, locale)}</p>
        <strong>{content(slide.ctaLabel, locale)}</strong>
      </div>
    </div>
  ) : (
    <Empty />
  );
}
