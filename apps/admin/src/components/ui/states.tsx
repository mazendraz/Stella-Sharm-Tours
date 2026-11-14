'use client';
import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, SearchX } from 'lucide-react';
import { useAdmin } from '../../lib/admin-context';

/** First-use empty, filtered-empty and error variants. Never "Nothing here yet". */
export function EmptyState({
  title,
  body,
  action,
  icon,
  variant = 'empty',
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  variant?: 'empty' | 'filtered' | 'error';
}) {
  return (
    <div
      className={'empty-state ' + variant}
      role={variant === 'error' ? 'alert' : undefined}
    >
      <span className="empty-icon" aria-hidden>
        {icon ??
          (variant === 'filtered' ? (
            <SearchX size={28} />
          ) : variant === 'error' ? (
            <AlertTriangle size={28} />
          ) : (
            <Inbox size={28} />
          ))}
      </span>
      <p className="empty-title">{title}</p>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}

export function LoadError({ retry }: { retry: () => void }) {
  const { t } = useAdmin();
  return (
    <EmptyState
      variant="error"
      title={t('loadError')}
      body={t('loadErrorBody')}
      action={
        <button type="button" className="btn" onClick={retry}>
          {t('retry')}
        </button>
      }
    />
  );
}

export function Skeleton({
  rows = 5,
  variant = 'rows',
}: {
  rows?: number;
  variant?: 'rows' | 'editor' | 'grid';
}) {
  const { t } = useAdmin();
  return (
    <div
      role="status"
      aria-label={t('loading')}
      className={'skeleton-' + variant}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Callout({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={'callout ' + tone}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}
