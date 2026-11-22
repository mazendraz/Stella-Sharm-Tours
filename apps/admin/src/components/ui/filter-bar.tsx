'use client';
import { useId, useState, type ReactNode } from 'react';
import { Filter } from 'lucide-react';
import { useAdmin } from '../../lib/admin-context';

/**
 * List filters. Wide screens: search + every filter in one row. Phones: search
 * + one "Filters" button (with the active count) that opens the rest, so the
 * first row of the list stays near the top (same pattern as Requests).
 */
export function FilterBar({
  search,
  active = 0,
  pinned,
  children,
}: {
  search?: ReactNode;
  /** Number of filters that differ from their default. */
  active?: number;
  /** Always visible (e.g. a removable filter chip). */
  pinned?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useAdmin(),
    [open, setOpen] = useState(false),
    id = useId();
  return (
    <div className="filters filter-bar" data-open={open || undefined}>
      {search}
      <button
        type="button"
        className="btn filter-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Filter size={16} aria-hidden />
        {t('filters')}
        {active > 0 && <span className="pill-count">{active}</span>}
      </button>
      {pinned}
      <div id={id} className="filter-extra">
        {children}
      </div>
    </div>
  );
}
