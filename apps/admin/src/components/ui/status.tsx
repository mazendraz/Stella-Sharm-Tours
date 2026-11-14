'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAdmin } from '../../lib/admin-context';
import { useConfirm } from './dialog';
import { Menu, type MenuItem } from './menu';

export type ContentStatus = 'published' | 'draft' | 'archived';
export const contentStatus = (row: Record<string, unknown>): ContentStatus =>
  row.archivedAt
    ? 'archived'
    : row.status === 'published'
      ? 'published'
      : 'draft';

const requestTones: Record<string, string> = {
  new: 'blue',
  contacted: 'amber',
  confirmed: 'green',
  completed: 'green',
  cancelled: 'grey',
  spam: 'red',
};
const contentTones: Record<string, string> = {
  published: 'green',
  draft: 'amber',
  archived: 'grey',
  scheduled: 'blue',
  ended: 'grey',
};

export function StatusBadge({
  status,
  kind = 'content',
}: {
  status: string;
  kind?: 'content' | 'request';
}) {
  const { t } = useAdmin();
  const tone =
    (kind === 'request' ? requestTones[status] : contentTones[status]) ??
    'grey';
  const label =
    kind === 'request'
      ? t('req_' + status)
      : t(status === 'hidden' ? 'draft' : status);
  return (
    <span className={'badge-status ' + tone}>
      <span className="dot" aria-hidden />
      {label}
    </span>
  );
}

/**
 * One button that shows the current status and offers only valid transitions.
 * Every transition goes through a ConfirmDialog with real text (§3.6).
 */
export function StatusMenu({
  status,
  name,
  canPublish = true,
  onPublish,
  onUnpublish,
  onArchive,
  onUnarchive,
  missingLocales = [],
  whereUsed = [],
  compact = false,
}: {
  status: ContentStatus;
  name: string;
  canPublish?: boolean;
  onPublish?: (() => Promise<unknown>) | undefined;
  onUnpublish?: (() => Promise<unknown>) | undefined;
  onArchive?: (() => Promise<unknown>) | undefined;
  onUnarchive?: (() => Promise<unknown>) | undefined;
  missingLocales?: string[];
  whereUsed?: string[];
  compact?: boolean;
}) {
  const { t, report } = useAdmin(),
    confirm = useConfirm(),
    [busy, setBusy] = useState(false);
  const run = async (action?: () => Promise<unknown>) => {
    if (!action) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const items: MenuItem[] = [];
  if (status === 'draft' && onPublish && canPublish)
    items.push({
      label: t('publish'),
      onSelect: async () => {
        if (
          await confirm({
            title: t('publishTitle', { name }),
            body: missingLocales.length
              ? t('publishBodyMissing', { langs: missingLocales.join(', ') })
              : t('publishBody'),
            confirmLabel: t('publish'),
          })
        )
          await run(onPublish);
      },
    });
  if (status === 'published' && onUnpublish && canPublish)
    items.push({
      label: t('unpublish'),
      onSelect: async () => {
        if (
          await confirm({
            title: t('unpublishTitle', { name }),
            body: t('unpublishBody'),
            confirmLabel: t('unpublish'),
          })
        )
          await run(onUnpublish);
      },
    });
  if (status !== 'archived' && onArchive)
    items.push({
      label: t('archive'),
      tone: 'danger',
      onSelect: async () => {
        if (
          await confirm({
            title: t('archiveTitle', { name }),
            body: t('archiveBody'),
            details: whereUsed.length
              ? [t('whereUsed') + ':', ...whereUsed]
              : undefined,
            confirmLabel: t('archive'),
            tone: 'danger',
          })
        )
          await run(onArchive);
      },
    });
  if (status === 'archived' && onUnarchive)
    items.push({
      label: t('unarchive'),
      onSelect: () => void run(onUnarchive),
    });
  if (!items.length) return <StatusBadge status={status} />;
  return (
    <Menu
      align="end"
      label={t('changeStatus')}
      triggerClass={'status-trigger ' + (compact ? 'compact' : '')}
      trigger={
        <>
          <StatusBadge status={status} />
          {busy ? (
            <span className="spinner" aria-hidden />
          ) : (
            <ChevronDown size={16} aria-hidden />
          )}
          <span className="sr-only">{t('changeStatus')}</span>
        </>
      }
      items={items}
    />
  );
}
