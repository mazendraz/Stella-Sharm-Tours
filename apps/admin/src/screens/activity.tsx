'use client';
import { useMemo, useState } from 'react';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, type Row } from '../lib/content';
import { dateTime } from '../lib/format';
import { describeChange, entityHref, entityKeys } from '../lib/diff';
import { PageHeader } from '../components/ui/page-header';
import { Pagination } from '../components/ui/data-table';
import { FormField } from '../components/ui/field';
import { EmptyState, LoadError, Skeleton } from '../components/ui/states';
import { AppLink } from '../components/ui/link';

const types = [
  'trip',
  'trip_prices',
  'package',
  'collection',
  'hero_slide',
  'media',
  'request',
  'faq',
  'page_blocks',
  'settings',
  'user',
  'translation',
];
const silent = new Set(['update', 'prices']);

export function Activity() {
  const { t, tp, locale } = useAdmin(),
    [user, setUser] = useState(''),
    [entity, setEntity] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [page, setPage] = useState(1),
    actors = useData<Row[]>('/v1/admin/audit-actors'),
    trips = useData<Row[]>('/v1/admin/trips'),
    collections = useData<Row[]>('/v1/admin/collections'),
    query = useData<Row[]>(
      `/v1/admin/audit?page=${page}${entity ? '&entity=' + entity : ''}${user ? '&user=' + user : ''}${from ? '&from=' + from : ''}${to ? '&to=' + to : ''}`,
    );
  const lookup = useMemo(() => {
    const map = new Map<string, unknown>();
    (trips.data ?? []).forEach((r) => map.set(r.id, r.title));
    (collections.data ?? []).forEach((r) => map.set(r.id, r.name));
    return map;
  }, [trips.data, collections.data]);
  // Collapse consecutive reorders by the same person within two minutes.
  const entries = useMemo(() => {
    const out: (Row & { times: number })[] = [];
    for (const row of query.data ?? []) {
      const last = out.at(-1);
      if (
        last &&
        row.action === 'reorder' &&
        last.action === 'reorder' &&
        last.entity === row.entity &&
        last.userId === row.userId &&
        Math.abs(
          new Date(String(last.at)).getTime() -
            new Date(String(row.at)).getTime(),
        ) < 120000
      )
        last.times++;
      else out.push({ ...row, times: 1 });
    }
    return out;
  }, [query.data]);
  const sentence = (row: Row & { times: number }) => {
    const who = String(row.userName ?? t('system')),
      type = t(entityKeys[String(row.entity)] ?? 'ent_item'),
      key0 = typeof row.entityTitle === 'string' ? row.entityTitle : '',
      name =
        row.entity === 'settings' && key0
          ? t('setting_' + key0)
          : row.entity === 'page_blocks' && key0
            ? t('page_' + key0)
            : content(row.entityTitle, locale) ||
              content(lookup.get(String(row.entityId)), locale) ||
              '',
      after = obj(row.after),
      key =
        row.action === 'restore' &&
        after.section === 'archive' &&
        obj(after.values).archivedAt
          ? 'act_undoCreate'
          : 'act_' + String(row.action);
    const text = t(key, { who, type, name: name || type });
    const base =
      text === key ? t('act_update', { who, type, name: name || type }) : text;
    return row.times > 1 ? base + ' ' + t('timesN', { n: row.times }) : base;
  };
  const filtering = !!(user || entity || from || to);
  return (
    <div className="page">
      <PageHeader title={t('activity')} description={t('activityDesc')} />
      <div className="filter-panel inline">
        <FormField label={t('person')}>
          {(p) => (
            <select
              {...p}
              value={user}
              onChange={(e) => {
                setUser(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('everyone')}</option>
              {actors.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {String(r.name)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label={t('type')}>
          {(p) => (
            <select
              {...p}
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('allTypes')}</option>
              {types.map((v) => (
                <option key={v} value={v}>
                  {t('typeLbl_' + v)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label={t('from')}>
          {(p) => (
            <input
              {...p}
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          )}
        </FormField>
        <FormField label={t('to')}>
          {(p) => (
            <input
              {...p}
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          )}
        </FormField>
      </div>
      {query.isPending ? (
        <Skeleton rows={8} />
      ) : query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : !entries.length ? (
        filtering ? (
          <EmptyState
            variant="filtered"
            title={t('noActivityFiltered')}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setUser('');
                  setEntity('');
                  setFrom('');
                  setTo('');
                }}
              >
                {t('clearFilters')}
              </button>
            }
          />
        ) : (
          <EmptyState title={t('noActivityYet')} />
        )
      ) : (
        <>
          <ol className="activity-list">
            {entries.map((row) => {
              const href = entityHref(row),
                details = silent.has(String(row.action))
                  ? describeChange(row, t, locale)
                  : [];
              const body = (
                <>
                  <span className="activity-text">{sentence(row)}</span>
                  {details.length > 0 && (
                    <span className="muted activity-details">
                      {details.join(' · ')}
                    </span>
                  )}
                </>
              );
              return (
                <li key={row.id}>
                  <time className="muted nowrap">
                    {dateTime(String(row.at), locale)}
                  </time>
                  {href ? (
                    <AppLink href={href} className="activity-link">
                      {body}
                    </AppLink>
                  ) : (
                    <span className="activity-link">{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
          <Pagination
            page={page}
            pageSize={50}
            shown={(query.data ?? []).length}
            hasNext={(query.data ?? []).length === 50}
            onPage={setPage}
          />
          <p className="sr-only">{tp('itemsCount', entries.length)}</p>
        </>
      )}
    </div>
  );
}
