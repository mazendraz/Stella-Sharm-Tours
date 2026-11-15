'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUrlState } from '../lib/url-state';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { can } from '@stella/shared/admin';
import { locales } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, type Row } from '../lib/content';
import { languageName } from '../lib/format';
import { PageHeader } from '../components/ui/page-header';
import { Pagination, SearchBox } from '../components/ui/data-table';
import { AutoTextarea, Toggle } from '../components/ui/field';
import { useConfirm } from '../components/ui/dialog';
import { EmptyState, LoadError, Skeleton } from '../components/ui/states';
import { AppLink } from '../components/ui/link';

const groups: Record<string, string[]> = {
  trips: ['trip', 'trip_item', 'itinerary', 'trip_price'],
  collections: ['collection'],
  hero: ['hero_slide'],
  media: ['media'],
  pages: ['faq', 'page_block'],
  settings: ['settings'],
  ui: ['ui'],
};
const STORAGE = 'stella-admin-translation-locale';
const isTrivial = (text: string) =>
  /^[\d\s:.,;–\-/()+%€$h]*$/i.test(text.trim());
const key = (row: Row) => [row.entity, row.id, row.field].join('|');

function fieldLabel(
  field: string,
  t: (k: string, v?: Record<string, string | number>) => string,
) {
  const perk = field.match(/^perks\[(\d+)\]\.(\w+)$/);
  if (perk)
    return t('perkN', { n: Number(perk[1]) + 1 }) + ' · ' + t('fld_' + perk[2]);
  const note = field.match(/^notes\[(\d+)\]$/);
  if (note) return t('noteN', { n: Number(note[1]) + 1 });
  const k = 'fld_' + field;
  const label = t(k);
  return label === k ? field : label;
}

export function Translations() {
  const { t, tp, locale, me, request, write, notify, report } = useAdmin(),
    client = useQueryClient(),
    confirm = useConfirm(),
    settings = useData<Row>(
      '/v1/admin/i18n/settings',
      can(me!.role, 'languages'),
    ),
    // Extra languages only make sense when machine translation runs;
    // otherwise they just show English.
    providers = obj(settings.data?.i18n_runtime).providers_available === true,
    auto = providers
      ? ((obj(settings.data?.i18n).auto as string[] | undefined) ?? []).filter(
          (c) => !(locales as readonly string[]).includes(c),
        )
      : [],
    core = locales.filter((c) => c !== 'en') as string[],
    choices = [...core, ...auto],
    [lang, setLang] = useState<string>(() => {
      try {
        return localStorage.getItem(STORAGE) ?? '';
      } catch {
        return '';
      }
    }),
    [filters, setFilters] = useUrlState({
      group: '',
      state: '',
      q: '',
      times: '',
    }),
    { group, state, q } = filters,
    showTrivial = filters.times === '1',
    setGroup = (v: string) => setFilters({ group: v }),
    setState = (v: string) => setFilters({ state: v }),
    setQ = (v: string) => setFilters({ q: v }),
    setShowTrivial = (v: boolean) => setFilters({ times: v ? '1' : '' }),
    [page, setPage] = useState(1),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState<string | null>(null),
    [done, setDone] = useState<Set<string>>(new Set()),
    table = useRef<HTMLTableSectionElement>(null);
  const queues = useQueries({
    queries: choices.map((code) => ({
      queryKey: ['/v1/admin/i18n/queue?locale=' + code],
      queryFn: () => request<Row[]>('/v1/admin/i18n/queue?locale=' + code),
      staleTime: 60000,
    })),
  });
  const counts = Object.fromEntries(
    choices.map((code, i) => [code, queues[i]?.data?.length]),
  );
  // Default: last used, else the language with the most pending items.
  useEffect(() => {
    if (lang && choices.includes(lang)) return;
    if (queues.some((q) => q.isPending)) return;
    const best = [...choices].sort(
      (a, b) => (counts[b] ?? 0) - (counts[a] ?? 0),
    )[0];
    if (best) setLang(best);
  }, [queues.map((q) => q.dataUpdatedAt).join(), choices.join()]);
  useEffect(() => {
    try {
      if (lang) localStorage.setItem(STORAGE, lang);
    } catch {
      /* storage blocked */
    }
    setPage(1);
    setSelected(new Set());
    setDrafts({});
    setDone(new Set());
  }, [lang]);
  useEffect(() => setPage(1), [group, state, showTrivial, q]);
  const index = choices.indexOf(lang),
    query = queues[index];
  const needle = q.trim().toLocaleLowerCase(locale);
  const list = useMemo(
    () =>
      (query?.data ?? []).filter(
        (row) =>
          !done.has(key(row)) &&
          (!group || groups[group]!.includes(String(row.entity))) &&
          (!state ||
            (state === 'missing'
              ? row.state === 'empty'
              : state === 'machine'
                ? !['empty', 'stale', 'draft'].includes(String(row.state))
                : row.state === state)) &&
          (showTrivial || !isTrivial(String(row.source))) &&
          (!needle ||
            String(row.source).toLocaleLowerCase(locale).includes(needle) ||
            content(row.itemTitle, locale)
              .toLocaleLowerCase(locale)
              .includes(needle)),
      ),
    [query?.data, group, state, showTrivial, needle, locale, done],
  );
  const pageRows = list.slice((page - 1) * 50, page * 50);
  const href = (row: Row) => {
    const parent = String(row.parentId ?? '');
    switch (row.parentKind) {
      case 'trip':
        return parent ? '/trips/' + parent : null;
      case 'package':
        return parent ? '/packages/' + parent : null;
      case 'collection':
        return '/collections/' + parent;
      case 'hero_slide':
        return '/hero/' + parent;
      case 'media':
        return '/media/' + parent;
      case 'faq':
        return '/pages/faq';
      case 'page':
        return parent ? '/pages/' + parent : '/pages';
      default:
        return null;
    }
  };
  const where = (row: Row) => {
    const entity = String(row.entity);
    const type = t(
      entity === 'trip_item' ||
        entity === 'itinerary' ||
        entity === 'trip_price'
        ? row.parentKind === 'package'
          ? 'entCap_package'
          : 'entCap_trip'
        : entity === 'page_block'
          ? 'entCap_page'
          : entity === 'ui'
            ? 'websiteText'
            : 'entCap_' + entity,
    );
    const title =
      entity === 'page_block'
        ? t('page_' + String(row.parentId ?? ''))
        : entity === 'ui' || entity === 'settings'
          ? ''
          : content(row.itemTitle, 'en');
    const field =
      entity === 'trip_item'
        ? t('whatsIncluded')
        : entity === 'itinerary'
          ? t('dayPlan')
          : entity === 'trip_price'
            ? t('priceLabel')
            : entity === 'ui' || entity === 'settings'
              ? String(row.field)
              : fieldLabel(String(row.field), t);
    return [type, title, field].filter(Boolean).join(' · ');
  };
  const approve = async (row: Row, next?: boolean) => {
    const k = key(row),
      text = drafts[k] ?? String(row.value ?? '');
    if (!text.trim()) {
      notify(t('translationEmpty'), { tone: 'error' });
      return;
    }
    setBusy(k);
    try {
      const { value } = await write<{ draft?: boolean }>(
        '/v1/admin/i18n/review',
        'POST',
        {
          entity: row.entity,
          id: row.id,
          field: row.field,
          locale: lang,
          source: row.source,
          text,
        },
      );
      setDone((s) => new Set(s).add(k));
      notify(value.draft ? t('savedForReview') : t('translationApproved'));
      if (next) {
        const nodes =
          table.current?.querySelectorAll<HTMLTextAreaElement>('textarea');
        const i = pageRows.findIndex((r) => key(r) === k);
        requestAnimationFrame(() => nodes?.[i + 1]?.focus());
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };
  const approveSelected = async () => {
    const rowsToApprove = list.filter((r) => selected.has(key(r)));
    if (
      !(await confirm({
        title: tp('approveNTitle', rowsToApprove.length),
        body: t('approveNBody', { lang: languageName(lang, locale) }),
        confirmLabel: tp('approveN', rowsToApprove.length),
      }))
    )
      return;
    for (const row of rowsToApprove) await approve(row);
    setSelected(new Set());
    await client.invalidateQueries({
      queryKey: ['/v1/admin/i18n/queue?locale=' + lang],
    });
  };
  const allOnPage =
    pageRows.length > 0 && pageRows.every((r) => selected.has(key(r)));
  return (
    <div className="page">
      <PageHeader
        title={t('translations')}
        description={t('translationsDesc')}
      />
      <div className="table-toolbar">
        <div className="filters">
          <label className="inline-label">
            <span className="sr-only">{t('language')}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label={t('language')}
            >
              {(
                [
                  [t('coreLanguages'), core],
                  [t('extraLanguagesMachine'), auto],
                ] as const
              )
                .filter(([, list]) => list.length)
                .map(([label, list]) => (
                  <optgroup key={label} label={label}>
                    {list.map((code) => (
                      <option key={code} value={code}>
                        {languageName(code, locale)}
                        {counts[code] !== undefined
                          ? ' · ' + tp('toReview', counts[code]!)
                          : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </label>
          <select
            aria-label={t('contentType')}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">{t('allContent')}</option>
            {Object.keys(groups).map((g) => (
              <option key={g} value={g}>
                {t('grp_' + g)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('state')}
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">{t('allStates')}</option>
            <option value="machine">{t('stateMachine')}</option>
            <option value="missing">{t('stateMissing')}</option>
            <option value="stale">{t('stateStale')}</option>
            <option value="draft">{t('stateDraft')}</option>
          </select>
          <SearchBox value={q} onChange={setQ} placeholder={t('searchText')} />
          <Toggle
            checked={showTrivial}
            onChange={setShowTrivial}
            label={t('showTimesNumbers')}
          />
        </div>
        {query?.data && (
          <span className="result-count" role="status">
            {tp('itemsCount', list.length)}
          </span>
        )}
      </div>
      {selected.size > 0 && (
        <div className="bulk-bar" role="region" aria-label={t('selection')}>
          <span>{tp('nSelected', selected.size)}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void approveSelected()}
          >
            {tp('approveN', selected.size)}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setSelected(new Set())}
          >
            {t('clearSelection')}
          </button>
        </div>
      )}
      {!query || query.isPending ? (
        <Skeleton rows={6} />
      ) : query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : !list.length ? (
        (query.data ?? []).length && (group || state || needle) ? (
          <EmptyState
            variant="filtered"
            title={t('nothingMatches')}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => setFilters({ group: '', state: '', q: '' })}
              >
                {t('clearFilters')}
              </button>
            }
          />
        ) : (
          <EmptyState
            title={t('allTranslated', { lang: languageName(lang, locale) })}
            body={t('allTranslatedBody')}
          />
        )
      ) : (
        <>
          <p className="muted small">{t('approveShortcut')}</p>
          <div className="table-scroll">
            <table className="data-table translations-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      type="checkbox"
                      aria-label={t('selectPage')}
                      checked={allOnPage}
                      onChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          pageRows.forEach((r) =>
                            allOnPage ? next.delete(key(r)) : next.add(key(r)),
                          );
                          return next;
                        })
                      }
                    />
                  </th>
                  <th scope="col">{t('where')}</th>
                  <th scope="col">{t('english')}</th>
                  <th scope="col">{languageName(lang, locale)}</th>
                  <th scope="col">{t('state')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('approve')}</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={table}>
                {pageRows.map((row) => {
                  const k = key(row),
                    link = href(row),
                    label = where(row);
                  return (
                    <tr key={k}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          aria-label={t('selectItem', { name: label })}
                          checked={selected.has(k)}
                          onChange={() =>
                            setSelected((s) => {
                              const next = new Set(s);
                              if (next.has(k)) next.delete(k);
                              else next.add(k);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="cell-where">
                        {link ? (
                          <AppLink href={link} className="text-link">
                            {label}
                          </AppLink>
                        ) : (
                          label
                        )}
                      </td>
                      <td lang="en" className="cell-source">
                        {String(row.source)}
                      </td>
                      <td className="cell-translation">
                        <AutoTextarea
                          lang={lang}
                          minRows={2}
                          aria-label={t('translationOf', { name: label })}
                          value={drafts[k] ?? String(row.value ?? '')}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [k]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                              e.preventDefault();
                              void approve(row, true);
                            }
                          }}
                        />
                      </td>
                      <td>
                        <span
                          className={
                            'loc-state ' +
                            (row.state === 'empty'
                              ? 'missing'
                              : String(row.state) === 'stale'
                                ? 'stale'
                                : 'machine')
                          }
                        >
                          {t(
                            row.state === 'empty'
                              ? 'stateMissing'
                              : row.state === 'stale'
                                ? 'stateStale'
                                : row.state === 'draft'
                                  ? 'stateDraft'
                                  : 'stateMachine',
                          )}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn approve"
                          aria-label={t('approveItem', { name: label })}
                          title={t('approve')}
                          disabled={busy === k}
                          onClick={() => void approve(row)}
                        >
                          {busy === k ? (
                            <span className="spinner" aria-hidden />
                          ) : (
                            <Check size={18} aria-hidden />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={50}
            shown={pageRows.length}
            total={list.length}
            hasNext={page * 50 < list.length}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
