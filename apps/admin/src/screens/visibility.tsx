'use client';
import './seo.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { locales } from '@stella/shared';
import { can } from '@stella/shared/admin';
import {
  rowsFromCsv,
  rowsToCsv,
  topCompetitors,
  visibilityPlatforms,
  visibilityTrend,
  type VisibilityRow,
} from '@stella/shared/visibility';
import { useAdmin, useData } from '../lib/admin-context';
import { PageHeader } from '../components/ui/page-header';
import { EmptyState, LoadError, Skeleton } from '../components/ui/states';
import { FormField } from '../components/ui/field';
import { useConfirm } from '../components/ui/dialog';

type Stored = VisibilityRow & { id: string };
const blank = (): VisibilityRow => ({
  measuredOn: new Date().toISOString().slice(0, 10),
  platform: 'chatgpt-search',
  kind: 'ai',
  promptId: null,
  query: '',
  lang: 'en',
  market: 'UK',
  branded: false,
  mentioned: false,
  citedUrl: null,
  recommendedPosition: null,
  organicPosition: null,
  competitors: [],
  sources: [],
  notes: null,
});

export function Visibility() {
  const { t, locale, me, request, report, notify } = useAdmin(),
    client = useQueryClient(),
    query = useData<Stored[]>('/v1/admin/visibility'),
    [row, setRow] = useState<VisibilityRow>(blank()),
    [importErrors, setImportErrors] = useState<
      { line: number; message: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [shown, setShown] = useState(25),
    mayDelete = me ? can(me.role, 'publish') : false,
    confirm = useConfirm();
  const data = useMemo(() => query.data ?? [], [query.data]);
  const trend = useMemo(() => visibilityTrend(data), [data]),
    competitors = useMemo(
      () => topCompetitors(data.filter((r) => !r.branded)),
      [data],
    );
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'percent' }).format(v);
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['/v1/admin/visibility'] });

  const add = async () => {
    setBusy(true);
    try {
      await request('/v1/admin/visibility', 'POST', row);
      setRow({
        ...blank(),
        measuredOn: row.measuredOn,
        platform: row.platform,
        lang: row.lang,
        market: row.market,
      });
      await refresh();
      notify(t('visibilitySaved'), { tone: 'success' });
    } catch (error) {
      report(error, t('visibilitySaveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File) => {
    const { rows, errors } = rowsFromCsv(await file.text());
    setImportErrors(errors);
    if (!rows.length) {
      notify(t('visibilityNothingToImport'), { tone: 'info' });
      return;
    }
    setBusy(true);
    try {
      for (let i = 0; i < rows.length; i += 2000)
        await request('/v1/admin/visibility/import', 'POST', {
          rows: rows.slice(i, i + 2000),
        });
      await refresh();
      notify(t('visibilityImported', { n: rows.length }), { tone: 'success' });
    } catch (error) {
      report(error, t('visibilitySaveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => {
    const blob = new Blob([rowsToCsv(data) + '\n'], { type: 'text/csv' }),
      a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download =
      'stella-visibility-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const remove = async (r: Stored) => {
    if (
      !(await confirm({
        title: t('visibilityDeleteTitle'),
        body: t('visibilityDeleteRow', { q: r.query, d: r.measuredOn }),
        confirmLabel: t('visibilityDelete'),
        tone: 'danger',
      }))
    )
      return;
    const id = r.id;
    setBusy(true);
    try {
      await request('/v1/admin/visibility/' + id, 'DELETE');
      await refresh();
      notify(t('visibilityDeleted'), { tone: 'success' });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const yesNo = (v: boolean) => t(v ? 'visibilityYes' : 'visibilityNo');
  const list = (v: string) =>
    v
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean);

  return (
    <div className="page seo-page">
      <PageHeader
        title={t('aiVisibility')}
        description={t('visibilityIntro')}
      />
      {query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <section className="panel" aria-labelledby="vis-trend-h">
            <div className="panel-head">
              <h2 id="vis-trend-h">{t('visibilityTrend')}</h2>
            </div>
            {!trend.length ? (
              <EmptyState
                title={t('visibilityEmpty')}
                body={t('visibilityEmptyBody')}
              />
            ) : (
              <div className="seo-scroll">
                <table className="seo-table">
                  <caption className="sr-only">{t('visibilityTrend')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('visibilityMonth')}</th>
                      <th scope="col">{t('visibilityPlatform')}</th>
                      <th scope="col">{t('visibilityTested')}</th>
                      <th scope="col">{t('visibilityMentioned')}</th>
                      <th scope="col">{t('visibilityCited')}</th>
                      <th scope="col">{t('visibilityRecommended')}</th>
                      <th scope="col">{t('visibilityTop3')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((r) => (
                      <tr key={r.month + r.platform}>
                        <td>{r.month}</td>
                        <td>{t('platform_' + r.platform)}</td>
                        <td>{r.tested}</td>
                        <td>{pct(r.mentioned)}</td>
                        <td>{pct(r.cited)}</td>
                        <td>{pct(r.recommended)}</td>
                        <td>
                          {['google-search', 'bing'].includes(r.platform)
                            ? pct(r.topThree)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted">{t('visibilityTrendNote')}</p>
            {competitors.length > 0 && (
              <>
                <h3>{t('visibilityCompetitors')}</h3>
                <p>
                  {competitors.map((c) => `${c.name} (${c.count})`).join(', ')}
                </p>
              </>
            )}
          </section>

          {data.length > 0 && (
            <section className="panel" aria-labelledby="vis-history-h">
              <div className="panel-head">
                <h2 id="vis-history-h">
                  {t('visibilityHistory', { n: data.length })}
                </h2>
              </div>
              <div className="seo-scroll">
                <table className="seo-table">
                  <caption className="sr-only">
                    {t('visibilityHistory', { n: data.length })}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('visibilityDate')}</th>
                      <th scope="col">{t('visibilityPlatform')}</th>
                      <th scope="col">{t('visibilityQuery')}</th>
                      <th scope="col">{t('visibilityLanguage')}</th>
                      <th scope="col">{t('visibilityMentioned')}</th>
                      <th scope="col">{t('visibilityCited')}</th>
                      <th scope="col">{t('visibilityRecPos')}</th>
                      <th scope="col">{t('visibilityOrgPos')}</th>
                      <th scope="col">{t('visibilityCompetitorsField')}</th>
                      {mayDelete && (
                        <th scope="col">
                          <span className="sr-only">
                            {t('visibilityDelete')}
                          </span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, shown).map((r) => (
                      <tr key={r.id}>
                        <td>{r.measuredOn}</td>
                        <td>{t('platform_' + r.platform)}</td>
                        <td>
                          {r.promptId && (
                            <span className="muted">{r.promptId} · </span>
                          )}
                          {r.query}
                          {r.branded && (
                            <span className="muted">
                              {' '}
                              · {t('visibilityBranded')}
                            </span>
                          )}
                        </td>
                        <td>
                          {r.lang.toUpperCase()}
                          {r.market ? ' · ' + r.market : ''}
                        </td>
                        <td>{yesNo(r.mentioned)}</td>
                        <td>{yesNo(Boolean(r.citedUrl))}</td>
                        <td>{r.recommendedPosition ?? '—'}</td>
                        <td>{r.organicPosition ?? '—'}</td>
                        <td>{r.competitors.join(', ') || '—'}</td>
                        {mayDelete && (
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busy}
                              aria-label={t('visibilityDeleteRow', {
                                q: r.query,
                                d: r.measuredOn,
                              })}
                              onClick={() => void remove(r)}
                            >
                              {t('visibilityDelete')}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.length > shown && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShown(shown + 100)}
                >
                  {t('visibilityShowMore')}
                </button>
              )}
            </section>
          )}

          <section className="panel" aria-labelledby="vis-io-h">
            <div className="panel-head">
              <h2 id="vis-io-h">{t('visibilityImportExport')}</h2>
            </div>
            <p className="muted">{t('visibilityCsvHint')}</p>
            <div className="dialog-actions">
              <label className="btn">
                {t('visibilityImport')}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="btn"
                onClick={exportCsv}
                disabled={!data.length}
              >
                {t('visibilityExport')}
              </button>
            </div>
            {importErrors.length > 0 && (
              <details open>
                <summary>
                  {t('visibilityImportErrors', { n: importErrors.length })}
                </summary>
                <ul>
                  {importErrors.slice(0, 50).map((e) => (
                    <li key={e.line}>
                      {t('visibilityLine', { n: e.line })}: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="panel" aria-labelledby="vis-add-h">
            <div className="panel-head">
              <h2 id="vis-add-h">{t('visibilityAdd')}</h2>
            </div>
            <div className="seo-form-grid">
              <FormField label={t('visibilityDate')}>
                {(p) => (
                  <input
                    {...p}
                    type="date"
                    value={row.measuredOn}
                    onChange={(e) =>
                      setRow({ ...row, measuredOn: e.target.value })
                    }
                  />
                )}
              </FormField>
              <FormField label={t('visibilityPlatform')}>
                {(p) => (
                  <select
                    {...p}
                    value={row.platform}
                    onChange={(e) => {
                      const platform = e.target
                        .value as VisibilityRow['platform'];
                      setRow({
                        ...row,
                        platform,
                        kind: ['google-search', 'bing'].includes(platform)
                          ? 'search'
                          : 'ai',
                      });
                    }}
                  >
                    {visibilityPlatforms.map((pl) => (
                      <option key={pl} value={pl}>
                        {t('platform_' + pl)}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label={t('visibilityLanguage')}>
                {(p) => (
                  <select
                    {...p}
                    value={row.lang}
                    onChange={(e) => setRow({ ...row, lang: e.target.value })}
                  >
                    {locales.map((l) => (
                      <option key={l} value={l}>
                        {l.toUpperCase()}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label={t('visibilityMarket')}>
                {(p) => (
                  <input
                    {...p}
                    value={row.market ?? ''}
                    onChange={(e) =>
                      setRow({ ...row, market: e.target.value || null })
                    }
                  />
                )}
              </FormField>
            </div>
            <FormField label={t('visibilityQuery')}>
              {(p) => (
                <input
                  {...p}
                  value={row.query}
                  onChange={(e) => setRow({ ...row, query: e.target.value })}
                />
              )}
            </FormField>
            <div className="seo-form-grid">
              <label className="seo-check">
                <input
                  type="checkbox"
                  checked={row.mentioned}
                  onChange={(e) =>
                    setRow({ ...row, mentioned: e.target.checked })
                  }
                />{' '}
                {t('visibilityMentionedQ')}
              </label>
              <label className="seo-check">
                <input
                  type="checkbox"
                  checked={row.branded}
                  onChange={(e) =>
                    setRow({ ...row, branded: e.target.checked })
                  }
                />{' '}
                {t('visibilityBrandedQ')}
              </label>
            </div>
            <div className="seo-form-grid">
              <FormField label={t('visibilityCitedUrl')}>
                {(p) => (
                  <input
                    {...p}
                    type="url"
                    value={row.citedUrl ?? ''}
                    onChange={(e) =>
                      setRow({ ...row, citedUrl: e.target.value || null })
                    }
                  />
                )}
              </FormField>
              <FormField label={t('visibilityRecPos')}>
                {(p) => (
                  <input
                    {...p}
                    type="number"
                    min={1}
                    max={100}
                    value={row.recommendedPosition ?? ''}
                    onChange={(e) =>
                      setRow({
                        ...row,
                        recommendedPosition: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                )}
              </FormField>
              {row.kind === 'search' && (
                <FormField label={t('visibilityOrgPos')}>
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      min={1}
                      max={100}
                      value={row.organicPosition ?? ''}
                      onChange={(e) =>
                        setRow({
                          ...row,
                          organicPosition: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  )}
                </FormField>
              )}
            </div>
            <FormField
              label={t('visibilityCompetitorsField')}
              hint={t('visibilityListHint')}
            >
              {(p) => (
                <input
                  {...p}
                  value={row.competitors.join('; ')}
                  onChange={(e) =>
                    setRow({ ...row, competitors: list(e.target.value) })
                  }
                />
              )}
            </FormField>
            <FormField
              label={t('visibilitySources')}
              hint={t('visibilityListHint')}
            >
              {(p) => (
                <input
                  {...p}
                  value={row.sources.join('; ')}
                  onChange={(e) =>
                    setRow({ ...row, sources: list(e.target.value) })
                  }
                />
              )}
            </FormField>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || row.query.trim().length < 2}
                onClick={() => void add()}
              >
                {t('visibilitySave')}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
