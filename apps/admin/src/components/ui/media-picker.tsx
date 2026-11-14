'use client';
import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ImageOff, Play, Upload, X } from 'lucide-react';
import { useAdmin, type Me } from '../../lib/admin-context';
import { content, type Row } from '../../lib/content';
import { useMediaOptions } from '../../lib/media-options';
import { resizeImage, uploadFile } from '../../lib/upload';
import { Modal } from './dialog';
import { Segmented } from './field';
import { SearchBox } from './data-table';
import { EmptyState, Skeleton } from './states';

export function mediaSrc(
  apiOrigin: string,
  id: string,
  variant: 'thumb' | 'poster' | 'full' | 'video' | 'video_h' = 'thumb',
) {
  return (
    apiOrigin +
    '/v1/admin/media/' +
    id +
    '/preview' +
    (variant === 'thumb'
      ? '?variant=480.jpg'
      : variant === 'poster'
        ? '?variant=poster'
        : variant === 'video'
          ? '?variant=mp4_v'
          : variant === 'video_h'
            ? '?variant=mp4_h'
            : '?variant=1200.jpg')
  );
}

export function durationLabel(seconds: unknown) {
  const s = Math.round(Number(seconds ?? 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** 40×40 (or larger) thumbnail for any media row; videos show the poster + ▶. */
export function MediaThumb({
  media,
  size = 40,
  className = '',
}: {
  media: Row | undefined | null;
  size?: number;
  className?: string;
}) {
  const { apiOrigin, locale } = useAdmin();
  if (!media || media.status !== 'ready')
    return (
      <span
        className={'thumb thumb-empty ' + className}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <ImageOff size={Math.min(18, size / 2)} />
      </span>
    );
  return (
    <span
      className={'thumb ' + className}
      style={{ width: size, height: size }}
    >
      <img
        src={mediaSrc(
          apiOrigin,
          media.id,
          media.kind === 'video' ? 'poster' : 'thumb',
        )}
        crossOrigin="use-credentials"
        alt={content(media.alt, locale)}
        loading="lazy"
        width={size}
        height={size}
      />
      {media.kind === 'video' && (
        <span className="thumb-play" aria-hidden>
          <Play size={10} fill="currentColor" />
        </span>
      )}
    </span>
  );
}

export function UploadButton({
  onUploaded,
  label,
  className = 'btn',
}: {
  onUploaded?: (ids: string[]) => void;
  label?: string;
  className?: string;
}) {
  const { t } = useAdmin(),
    input = useRef<HTMLInputElement>(null),
    upload = useUploader();
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={upload.busy}
        onClick={() => input.current?.click()}
      >
        {upload.busy ? (
          <span className="spinner" aria-hidden />
        ) : (
          <Upload size={18} aria-hidden />
        )}
        {label ?? t('uploadNew')}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,video/mp4,video/quicktime"
        onChange={async (event) => {
          const ids = await upload.run(Array.from(event.target.files ?? []));
          event.target.value = '';
          if (ids.length) onUploaded?.(ids);
        }}
      />
      {upload.progress.length > 0 && <UploadProgress items={upload.progress} />}
    </>
  );
}

export type UploadItem = { name: string; value: number; failed?: boolean };
export function UploadProgress({ items }: { items: UploadItem[] }) {
  const { t } = useAdmin();
  return (
    <ul className="upload-progress" aria-live="polite">
      {items.map((item, index) => (
        <li key={index}>
          <span className="truncate">{item.name}</span>
          {item.failed ? (
            <span className="field-error">{t('uploadFailed')}</span>
          ) : (
            <progress value={item.value} max={100} aria-label={item.name} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function useUploader() {
  const { request, apiOrigin, report, notify, t, tp } = useAdmin(),
    client = useQueryClient(),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<UploadItem[]>([]);
  const run = async (picked: File[]) => {
    const files = picked.slice(0, 10);
    if (!files.length) return [];
    setBusy(true);
    setProgress(files.map((file) => ({ name: file.name, value: 0 })));
    const ids: string[] = [];
    try {
      const me = await request<Me>('/v1/admin/me');
      for (const [index, file] of files.entries()) {
        try {
          const prepared = await resizeImage(file);
          const result = await uploadFile(
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
          ids.push(result.id);
        } catch {
          setProgress((previous) =>
            previous.map((row, i) =>
              i === index ? { ...row, failed: true } : row,
            ),
          );
        }
      }
      await client.invalidateQueries();
      if (ids.length) notify(tp('uploaded', ids.length));
      else notify(t('uploadFailed'), { tone: 'error' });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress([]), 2500);
    }
    return ids;
  };
  return { run, busy, progress };
}

/** Grid picker that replaces every media <select>. */
export function MediaPicker({
  kind,
  multiple = false,
  selected,
  onDone,
  onClose,
  title,
}: {
  kind?: 'image' | 'video';
  multiple?: boolean;
  selected: string[];
  onDone: (ids: string[]) => void;
  onClose: () => void;
  title: string;
}) {
  const { t, locale, tp } = useAdmin(),
    media = useMediaOptions(),
    [q, setQ] = useState(''),
    [type, setType] = useState<'all' | 'image' | 'video'>(kind ?? 'all'),
    [picked, setPicked] = useState<string[]>(selected);
  const list = useMemo(
    () =>
      (media.data ?? []).filter(
        (row) =>
          row.status !== 'failed' &&
          (type === 'all' || row.kind === type) &&
          content(row.alt, locale)
            .toLocaleLowerCase(locale)
            .includes(q.toLocaleLowerCase(locale)),
      ),
    [media.data, type, q, locale],
  );
  const toggle = (id: string) =>
    setPicked((previous) =>
      multiple
        ? previous.includes(id)
          ? previous.filter((value) => value !== id)
          : [...previous, id]
        : [id],
    );
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <span className="muted picker-count">
            {multiple ? tp('nSelected', picked.length) : ''}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!multiple && !picked.length}
            onClick={() => onDone(picked)}
          >
            {multiple ? t('useSelected') : t('useThis')}
          </button>
        </>
      }
    >
      <div className="picker-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder={t('searchMedia')} />
        {!kind && (
          <Segmented
            label={t('type')}
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: t('all') },
              { value: 'image', label: t('images') },
              { value: 'video', label: t('videos') },
            ]}
          />
        )}
        <UploadButton
          onUploaded={(ids) =>
            setPicked((previous) =>
              multiple ? [...previous, ...ids] : ids.slice(0, 1),
            )
          }
        />
      </div>
      {media.isPending ? (
        <Skeleton variant="grid" rows={8} />
      ) : !list.length ? (
        <EmptyState
          variant={q ? 'filtered' : 'empty'}
          title={q ? t('noMediaMatch', { q }) : t('noMediaYet')}
        />
      ) : (
        <ul className="picker-grid" aria-label={title}>
          {list.map((row) => {
            const on = picked.includes(row.id),
              name = content(row.alt, locale) || t('untitledMedia');
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={'picker-tile' + (on ? ' on' : '')}
                  aria-pressed={on}
                  aria-label={name}
                  onClick={() => toggle(row.id)}
                  onDoubleClick={() => !multiple && onDone([row.id])}
                >
                  <MediaThumb media={row} size={160} className="tile-img" />
                  {row.kind === 'video' && (
                    <span className="tile-duration">
                      {durationLabel(row.durationS)}
                    </span>
                  )}
                  {on && (
                    <span className="tile-check" aria-hidden>
                      <Check size={16} />
                    </span>
                  )}
                  <span className="tile-name truncate" title={name}>
                    {name}
                  </span>
                  {row.status === 'processing' && (
                    <span className="tile-processing">{t('processing')}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/** Selected-media preview inside an editor (thumbnail + name + replace/remove). */
export function MediaSlot({
  label,
  mediaId,
  kind,
  onChange,
  hint,
  error,
}: {
  label: string;
  mediaId: string | null;
  kind: 'image' | 'video';
  onChange: (id: string | null) => void;
  hint?: string;
  error?: string;
}) {
  const { t, locale } = useAdmin(),
    media = useMediaOptions(),
    [open, setOpen] = useState(false),
    row = media.data?.find((item) => item.id === mediaId);
  return (
    <div className="field">
      <div className="field-label">
        <span className="label-text">{label}</span>
      </div>
      <div className="media-slot">
        {mediaId ? (
          <>
            <MediaThumb media={row} size={88} />
            <div className="media-slot-text">
              <span className="truncate">
                {row
                  ? content(row.alt, locale) || t('untitledMedia')
                  : t('loading')}
              </span>
              <div className="media-slot-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setOpen(true)}
                >
                  {t('replace')}
                </button>
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label={t('removeNamed', { name: label })}
                  onClick={() => onChange(null)}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="media-slot-empty"
            onClick={() => setOpen(true)}
          >
            {t(kind === 'video' ? 'chooseVideo' : 'chooseImage')}
          </button>
        )}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
      {open && (
        <MediaPicker
          kind={kind}
          title={label}
          selected={mediaId ? [mediaId] : []}
          onClose={() => setOpen(false)}
          onDone={(ids) => {
            onChange(ids[0] ?? null);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
