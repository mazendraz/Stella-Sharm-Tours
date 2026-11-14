'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { useAdmin } from '../../lib/admin-context';
import { useGuard } from '../../lib/guard';
import { AppLink } from './link';
import { Menu, type MenuItem } from './menu';
import { EmptyState, LoadError, Skeleton } from './states';
import {
  DndContext,
  SortableContext,
  closestCenter,
  verticalListSortingStrategy,
  arrayMove,
  useSortSensors,
  useSortableRow,
  useDndAnnouncements,
  DragHandle,
  moveItems,
} from './sortable';
import { restrictToVerticalAxis } from './dnd-modifiers';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};
export type Group<T> = { key: string; label: ReactNode; rows: T[] };

/** Debounced search box with a clear button. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const { t } = useAdmin(),
    [text, setText] = useState(value),
    timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setText(value), [value]);
  const update = (next: string, immediate = false) => {
    setText(next);
    clearTimeout(timer.current);
    if (immediate) onChange(next);
    else timer.current = setTimeout(() => onChange(next), 250);
  };
  return (
    <div className="searchbox">
      <Search size={18} aria-hidden className="searchbox-icon" />
      <input
        type="search"
        aria-label={label ?? t('search')}
        placeholder={placeholder ?? t('search')}
        value={text}
        maxLength={80}
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && update('', true)}
      />
      {text && (
        <button
          type="button"
          className="icon-btn sm"
          aria-label={t('clearSearch')}
          onClick={() => update('', true)}
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  shown,
  total,
  hasNext,
  onPage,
}: {
  page: number;
  pageSize: number;
  shown: number;
  total?: number | undefined;
  hasNext: boolean;
  onPage: (page: number) => void;
}) {
  const { t, locale } = useAdmin();
  if (page === 1 && !hasNext) return null;
  const fmt = (n: number) => new Intl.NumberFormat(locale).format(n),
    from = (page - 1) * pageSize + 1,
    to = (page - 1) * pageSize + shown;
  return (
    <nav className="pagination" aria-label={t('pagination')}>
      <span>
        {total !== undefined
          ? t('rangeOf', { from: fmt(from), to: fmt(to), total: fmt(total) })
          : t('range', { from: fmt(from), to: fmt(to) })}
      </span>
      <div className="pagination-buttons">
        <button
          type="button"
          className="btn"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          {t('previous')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hasNext}
          onClick={() => onPage(page + 1)}
        >
          {t('next')}
        </button>
      </div>
    </nav>
  );
}

type Props<T> = {
  caption: string;
  columns: Column<T>[];
  rows?: T[] | undefined;
  groups?: Group<T>[] | undefined;
  getKey: (row: T) => string;
  href?: (row: T) => string;
  thumb?: (row: T) => ReactNode;
  mobile: {
    title: (row: T) => ReactNode;
    meta?: (row: T) => ReactNode;
    badge?: (row: T) => ReactNode;
  };
  menu?: (row: T) => MenuItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  empty: { title: string; body?: ReactNode; action?: ReactNode };
  filtered?: { active: boolean; title: string; onClear: () => void };
  toolbar?: ReactNode;
  count?: ReactNode;
  footer?: ReactNode;
  reorder?: {
    enabled: boolean;
    onReorder: (groupKey: string | null, ids: string[]) => void;
    itemName: (row: T) => string;
  };
  selectedKey?: string;
  dense?: boolean;
};

export function DataTable<T>(props: Props<T>) {
  const {
    caption,
    columns,
    toolbar,
    count,
    loading,
    error,
    onRetry,
    empty,
    filtered,
    footer,
  } = props;
  const { t } = useAdmin();
  const groups: Group<T>[] = useMemo(
    () =>
      props.groups
        ? props.groups.filter((group) => group.rows.length > 0)
        : [{ key: '', label: null, rows: props.rows ?? [] }],
    [props.groups, props.rows],
  );
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  let body: ReactNode;
  if (loading) body = <Skeleton rows={5} />;
  else if (error) body = <LoadError retry={() => onRetry?.()} />;
  else if (!total && filtered?.active)
    body = (
      <EmptyState
        variant="filtered"
        title={filtered.title}
        action={
          <button type="button" className="btn" onClick={filtered.onClear}>
            {t('clearFilters')}
          </button>
        }
      />
    );
  else if (!total) body = <EmptyState {...empty} />;
  else
    body = (
      <>
        <table className="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {props.reorder?.enabled && (
                <th className="col-handle">
                  <span className="sr-only">{t('reorder')}</span>
                </th>
              )}
              {props.thumb && (
                <th className="col-thumb">
                  <span className="sr-only">{t('image')}</span>
                </th>
              )}
              {columns.map((column) => (
                <th key={column.key} className={column.className} scope="col">
                  {column.header}
                </th>
              ))}
              {props.menu && (
                <th className="col-menu">
                  <span className="sr-only">{t('actions')}</span>
                </th>
              )}
            </tr>
          </thead>
          {groups.map((group) => (
            <TableGroup key={group.key} group={group} props={props} />
          ))}
        </table>
        <ul className="data-list" aria-label={caption}>
          {groups.map((group) => (
            <MobileGroup key={group.key} group={group} props={props} />
          ))}
        </ul>
      </>
    );
  return (
    <div className="data-table-wrap">
      {(toolbar || count) && (
        <div className="table-toolbar">
          {toolbar}
          {count && !loading && (
            <span className="result-count" role="status">
              {count}
            </span>
          )}
        </div>
      )}
      {body}
      {footer}
    </div>
  );
}

function TableGroup<T>({ group, props }: { group: Group<T>; props: Props<T> }) {
  const { t } = useAdmin(),
    sensors = useSortSensors(),
    ids = group.rows.map(props.getKey),
    enabled = !!props.reorder?.enabled;
  const accessibility = useDndAnnouncements(
    (id) => props.reorder?.itemName(group.rows[ids.indexOf(id)]!) ?? id,
    ids,
  );
  const span =
    props.columns.length +
    (enabled ? 1 : 0) +
    (props.thumb ? 1 : 0) +
    (props.menu ? 1 : 0);
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= ids.length) return;
    props.reorder?.onReorder(group.key || null, arrayMove(ids, from, to));
  };
  const content = (
    <tbody>
      {group.label && (
        <tr className="group-row">
          <th colSpan={span} scope="colgroup">
            {group.label}
          </th>
        </tr>
      )}
      {group.rows.map((row, index) => (
        <TableRow
          key={ids[index]}
          id={ids[index]!}
          row={row}
          props={props}
          enabled={enabled}
          extraMenu={
            enabled
              ? moveItems(t, index, ids.length, (to) => reorder(index, to))
              : []
          }
        />
      ))}
    </tbody>
  );
  if (!enabled) return content;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      accessibility={accessibility}
      onDragEnd={(event) => {
        if (!event.over) return;
        reorder(
          ids.indexOf(String(event.active.id)),
          ids.indexOf(String(event.over.id)),
        );
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {content}
      </SortableContext>
    </DndContext>
  );
}

function TableRow<T>({
  id,
  row,
  props,
  enabled,
  extraMenu,
}: {
  id: string;
  row: T;
  props: Props<T>;
  enabled: boolean;
  extraMenu: MenuItem[];
}) {
  const { t } = useAdmin(),
    { navigate } = useGuard(),
    sortable = useSortableRow(id, !enabled),
    href = props.href?.(row),
    menu = [...(props.menu?.(row) ?? [])];
  if (extraMenu.length) {
    if (menu.length) menu.push('separator');
    menu.push(...extraMenu);
  }
  return (
    <tr
      ref={sortable.setNodeRef}
      style={enabled ? sortable.style : undefined}
      className={
        (href ? 'clickable' : '') +
        (props.selectedKey === id ? ' selected' : '') +
        (sortable.isDragging ? ' dragging' : '')
      }
      onClick={(event) => {
        if (!href) return;
        const target = event.target as HTMLElement;
        if (target.closest('a,button,input,select,textarea,[role="menu"]'))
          return;
        if (event.metaKey || event.ctrlKey) window.open(href, '_blank');
        else void navigate(href);
      }}
    >
      {enabled && (
        <td className="col-handle">
          <DragHandle
            attributes={sortable.attributes}
            listeners={sortable.listeners}
            label={t('dragToReorder', {
              name: props.reorder?.itemName(row) ?? '',
            })}
          />
        </td>
      )}
      {props.thumb && <td className="col-thumb">{props.thumb(row)}</td>}
      {props.columns.map((column, index) => (
        <td key={column.key} className={column.className}>
          {index === 0 && href ? (
            <AppLink href={href} className="row-link">
              {column.cell(row)}
            </AppLink>
          ) : (
            column.cell(row)
          )}
        </td>
      ))}
      {props.menu && (
        <td className="col-menu">
          {menu.length > 0 && (
            <Menu
              items={menu}
              label={t('actionsFor', {
                name: props.reorder?.itemName(row) ?? '',
              })}
            />
          )}
        </td>
      )}
    </tr>
  );
}

function MobileGroup<T>({
  group,
  props,
}: {
  group: Group<T>;
  props: Props<T>;
}) {
  const { t } = useAdmin();
  return (
    <>
      {group.label && <li className="data-list-group">{group.label}</li>}
      {group.rows.map((row) => {
        const href = props.href?.(row),
          key = props.getKey(row),
          menu = props.menu?.(row) ?? [];
        const inner = (
          <>
            {props.thumb && (
              <span className="list-thumb">{props.thumb(row)}</span>
            )}
            <span className="list-text">
              <span className="list-title">{props.mobile.title(row)}</span>
              {props.mobile.meta && (
                <span className="list-meta">{props.mobile.meta(row)}</span>
              )}
            </span>
            {props.mobile.badge && (
              <span className="list-badge">{props.mobile.badge(row)}</span>
            )}
          </>
        );
        return (
          <li
            key={key}
            className={
              'data-list-item' + (props.selectedKey === key ? ' selected' : '')
            }
          >
            {href ? (
              <AppLink href={href} className="list-link">
                {inner}
              </AppLink>
            ) : (
              <div className="list-link">{inner}</div>
            )}
            {menu.length > 0 && <Menu items={menu} label={t('moreActions')} />}
          </li>
        );
      })}
    </>
  );
}
