'use client';
import type { ReactNode } from 'react';
import { useAdmin, useData, ApiError } from '../lib/admin-context';
import { content, type Row } from '../lib/content';
import { Callout } from './ui/states';
import { AppLink } from './ui/link';

const reasons = ['unknown_rights', 'archived', 'not_ready', 'missing'] as const;
type Reason = (typeof reasons)[number];

/**
 * Persistent explanation of a refused publish: which file blocked it, where
 * the trip uses that file, why it was refused and how to fix it. Stays on
 * screen until the next publish attempt or until it is dismissed.
 */
export function PublishBlocker({
  error,
  uses,
  scenes,
  onDismiss,
}: {
  error: unknown;
  /** mediaId -> human labels of where this trip uses the file. */
  uses: Record<string, string[]>;
  /** story scene id -> its title, for stops that have no media. */
  scenes: Record<string, string>;
  onDismiss: () => void;
}) {
  const { t, errorText } = useAdmin();
  const details = error instanceof ApiError ? error.details : {};
  const code = error instanceof ApiError ? error.code : '';
  const mediaId =
    code === 'MEDIA_NOT_PUBLISHABLE' && typeof details.mediaId === 'string'
      ? details.mediaId
      : null;
  const reason = reasons.includes(details.reason as Reason)
    ? (details.reason as Reason)
    : null;
  const sceneId =
    details.reason === 'no_media' && typeof details.sceneId === 'string'
      ? details.sceneId
      : null;
  const dismiss = (
    <button type="button" className="btn btn-sm" onClick={onDismiss}>
      {t('dismiss')}
    </button>
  );
  if (sceneId)
    return (
      <Callout
        tone="danger"
        action={
          <span className="callout-actions">
            <a className="btn btn-sm btn-primary" href="#section-story">
              {t('goToStory')}
            </a>
            {dismiss}
          </span>
        }
      >
        <strong>{t('publishBlockedTitle')}</strong>
        <p>
          {t('publishBlockedNoMedia', { name: scenes[sceneId] ?? sceneId })}
        </p>
        <p>{t('publishBlockedNoMediaFix')}</p>
      </Callout>
    );
  if (mediaId && reason)
    return (
      <MediaBlocker
        mediaId={mediaId}
        reason={reason}
        where={uses[mediaId] ?? []}
        dismiss={dismiss}
      />
    );
  return (
    <Callout tone="danger" action={dismiss}>
      <strong>{t('publishBlockedTitle')}</strong>
      <p>{errorText(error)}</p>
    </Callout>
  );
}

function MediaBlocker({
  mediaId,
  reason,
  where,
  dismiss,
}: {
  mediaId: string;
  reason: Reason;
  where: string[];
  dismiss: ReactNode;
}) {
  const { t, locale } = useAdmin();
  // A missing file has nothing to load; everything else is named from Media.
  const file = useData<Row>('/v1/admin/media/' + mediaId, reason !== 'missing');
  const name =
    (file.data && content(file.data.alt, locale)) || t('untitledMedia');
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  return (
    <Callout
      tone="danger"
      action={
        <span className="callout-actions">
          {reason !== 'missing' && (
            <AppLink
              className="btn btn-sm btn-primary"
              href={'/media/' + mediaId}
            >
              {t('openFile')}
            </AppLink>
          )}
          {dismiss}
        </span>
      }
    >
      <strong>{t('publishBlockedTitle')}</strong>
      <p>{t('publishBlockedFile', { name })}</p>
      {where.length > 0 && (
        <p>{t('publishBlockedUsedAs', { where: list.format(where) })}</p>
      )}
      <p>{t('publishBlockedReason_' + reason)}</p>
      <p>{t('publishBlockedFix_' + reason)}</p>
    </Callout>
  );
}
