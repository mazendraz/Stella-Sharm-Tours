'use client';
import './seo.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Locale } from '@stella/shared';
import type {
  CompletenessCheck,
  IssueCode,
  SeoSummary,
  TripHealth,
} from '@stella/shared/seo-health';
import { completenessChecks } from '@stella/shared/seo-health';
import { useAdmin, useData } from '../lib/admin-context';
import { PageHeader } from '../components/ui/page-header';
import { EmptyState, LoadError, Skeleton } from '../components/ui/states';
import { FormField, Segmented } from '../components/ui/field';
import { AppLink } from '../components/ui/link';

type Loc = { en: string } & Partial<Record<Locale, string>>;
type SeoData = {
  origin: string;
  locales: Locale[];
  summary: SeoSummary;
  trips: {
    id: string;
    slug: string;
    kind: 'trip' | 'package';
    status: string;
    collection: string | null;
    title: Loc;
    seoTitle: Loc | null;
    seoDescription: Loc | null;
  }[];
  health: TripHealth[];
  faqs: { published: number; perLocale: Record<Locale, number> };
  collections: { published: number; withoutDescription: string[] };
  integrations: { id: string; status: 'notConnected' }[];
};
type SiteCheck = {
  ranAt: string;
  origin: string;
  durationMs: number;
  robots: {
    status: number;
    privateBlocked: boolean;
    crawlers: { agent: string; purpose: string; allowed: boolean | null }[];
  };
  sitemap: {
    status: number;
    urls: number;
    missingTrips: string[];
    unpublishedListed: string[];
  };
  pages: { url: string; status: number; problems: string[] }[];
  brokenLinks: { url: string; status: number }[];
  orphans: string[];
  unpublishedReachable: { slug: string; status: number }[];
};
type PageCheck = {
  url: string;
  status: number;
  published: boolean;
  problems: string[];
  page: {
    title: string;
    description: string;
    robots: string;
    canonical: string | null;
    alternates: Record<string, string>;
    ogImage: string | null;
    metadataInHead: boolean;
    schemaTypes: string[];
    jsonld: unknown[];
  } | null;
};

const brand = 'Stella Sharm Tours';
/** Same rule as the public site (apps/web/src/lib/seo.tsx). */
const withBrand = (title: string) =>
  title.includes(brand) || (title + ' | ' + brand).length > 65
    ? title
    : title + ' | ' + brand;

export function Seo({ tab, id }: { tab?: string; id?: string }) {
  const { t } = useAdmin(),
    query = useData<SeoData>('/v1/admin/seo');
  const tabs = [
    { href: '/seo', key: undefined, label: t('seoOverview') },
    { href: '/seo/tours', key: 'tours', label: t('seoTours') },
    {
      href: '/seo/intelligence',
      key: 'intelligence',
      label: t('seoIntelligence'),
    },
  ];
  return (
    <div className="page seo-page">
      <PageHeader title={t('seoSearch')} description={t('seoIntro')} />
      <nav className="seo-tabs" aria-label={t('seoSearch')}>
        {tabs.map((item) => (
          <AppLink
            key={item.href}
            href={item.href}
            className="seo-tab"
            aria-current={item.key === tab ? 'page' : undefined}
          >
            {item.label}
          </AppLink>
        ))}
      </nav>
      {query.isError ? (
        <LoadError retry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton rows={5} />
      ) : tab === 'tours' && id ? (
        <TourSeo data={query.data} id={id} />
      ) : tab === 'tours' ? (
        <TourList data={query.data} />
      ) : tab === 'intelligence' ? (
        <Intelligence data={query.data} />
      ) : (
        <Overview data={query.data} />
      )}
    </div>
  );
}

function Overview({ data }: { data: SeoData }) {
  const { t, locale } = useAdmin(),
    n = (v: number) => new Intl.NumberFormat(locale).format(v),
    s = data.summary,
    i = s.issues;
  const stats: { key: string; value: string; tone?: 'bad' | 'ok' }[] = [
    { key: 'seoStatIndexable', value: n(s.indexableTripPages) },
    {
      key: 'seoStatCompleteness',
      value: new Intl.NumberFormat(locale, { style: 'percent' }).format(
        s.completeness,
      ),
    },
    {
      key: 'seoStatComplete',
      value: `${n(s.completeTrips)} / ${n(s.publishedTrips)}`,
    },
    {
      key: 'seoStatNoDescription',
      value: n(i.noDescription),
      tone: i.noDescription ? 'bad' : 'ok',
    },
    {
      key: 'seoStatTranslations',
      value: n(i.translationMissing),
      tone: i.translationMissing ? 'bad' : 'ok',
    },
    {
      key: 'seoStatDupTitles',
      value: n(i.titleDuplicate),
      tone: i.titleDuplicate ? 'bad' : 'ok',
    },
    {
      key: 'seoStatDupDescriptions',
      value: n(i.descriptionDuplicate),
      tone: i.descriptionDuplicate ? 'bad' : 'ok',
    },
    {
      key: 'seoStatLongTitles',
      value: n(i.titleLong),
      tone: i.titleLong ? 'bad' : 'ok',
    },
    {
      key: 'seoStatAlt',
      value: n(i.altMissing),
      tone: i.altMissing ? 'bad' : 'ok',
    },
    {
      key: 'seoStatFaqs',
      value: n(data.faqs.published),
      tone: data.faqs.published < 5 ? 'bad' : 'ok',
    },
  ];
  return (
    <>
      <section className="panel" aria-labelledby="seo-content-h">
        <div className="panel-head">
          <h2 id="seo-content-h">{t('seoContentHealth')}</h2>
        </div>
        <p className="muted">{t('seoContentHealthBody')}</p>
        <ul className="stat-grid seo-stats">
          {stats.map((stat) => (
            <li key={stat.key} className="stat-card" data-tone={stat.tone}>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{t(stat.key)}</span>
            </li>
          ))}
        </ul>
      </section>
      <SiteCheckPanel />
    </>
  );
}

function SiteCheckPanel() {
  const { t, request, report, locale } = useAdmin(),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<SiteCheck | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      setResult(await request<SiteCheck>('/v1/admin/seo/check', 'POST', {}));
    } catch (error) {
      report(error, t('seoCheckFailed'));
    } finally {
      setBusy(false);
    }
  };
  const problemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of result?.pages ?? [])
      for (const code of p.problems)
        counts.set(code, (counts.get(code) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [result]);
  return (
    <section className="panel" aria-labelledby="seo-live-h" aria-busy={busy}>
      <div className="panel-head">
        <h2 id="seo-live-h">{t('seoLiveCheck')}</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={run}
          disabled={busy}
        >
          {busy ? t('seoChecking') : t('seoRunCheck')}
        </button>
      </div>
      <p className="muted">{t('seoLiveCheckBody')}</p>
      {result && (
        <div className="seo-check" aria-live="polite">
          <p className="muted">
            {t('seoCheckedAt', {
              when: new Date(result.ranAt).toLocaleString(locale),
              pages: result.pages.length,
              seconds: Math.round(result.durationMs / 1000),
            })}
          </p>
          <h3>{t('seoCrawlers')}</h3>
          <table className="seo-table">
            <thead>
              <tr>
                <th scope="col">{t('seoCrawler')}</th>
                <th scope="col">{t('seoPurpose')}</th>
                <th scope="col">{t('seoAccess')}</th>
              </tr>
            </thead>
            <tbody>
              {result.robots.crawlers.map((c) => (
                <tr key={c.agent}>
                  <td>
                    <code>{c.agent}</code>
                  </td>
                  <td>{t('seoPurpose_' + c.purpose)}</td>
                  <td>
                    {c.allowed === null
                      ? '—'
                      : c.allowed
                        ? t('seoAllowed')
                        : t('seoBlocked')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="seo-facts">
            <Fact
              ok={result.robots.privateBlocked}
              text={t('seoPrivateBlocked')}
            />
            <Fact
              ok={result.sitemap.status === 200}
              text={t('seoSitemapUrls', { n: result.sitemap.urls })}
            />
            <Fact
              ok={!result.sitemap.missingTrips.length}
              text={t('seoSitemapMissing', {
                n: result.sitemap.missingTrips.length,
              })}
            />
            <Fact
              ok={
                !result.sitemap.unpublishedListed.length &&
                !result.unpublishedReachable.length
              }
              text={t('seoUnpublishedSafe', {
                n:
                  result.sitemap.unpublishedListed.length +
                  result.unpublishedReachable.length,
              })}
            />
            <Fact
              ok={!result.brokenLinks.length}
              text={t('seoBrokenLinks', { n: result.brokenLinks.length })}
            />
            <Fact
              ok={!result.orphans.length}
              text={t('seoOrphans', { n: result.orphans.length })}
            />
          </ul>
          <h3>{t('seoPageProblems')}</h3>
          {!problemCounts.length ? (
            <p>{t('seoNoPageProblems')}</p>
          ) : (
            <ul className="simple-list">
              {problemCounts.map(([code, count]) => (
                <li key={code}>
                  <details>
                    <summary>
                      {t('seoProblem_' + code)} — {count}
                    </summary>
                    <ul>
                      {result.pages
                        .filter((p) => p.problems.includes(code))
                        .slice(0, 20)
                        .map((p) => (
                          <li key={p.url}>
                            <a href={p.url} target="_blank" rel="noreferrer">
                              {p.url}
                            </a>
                          </li>
                        ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {[
            ...result.brokenLinks,
            ...result.orphans.map((url) => ({ url, status: 0 })),
          ].length > 0 && (
            <details>
              <summary>{t('seoLinkDetails')}</summary>
              <ul>
                {result.brokenLinks.map((b) => (
                  <li key={b.url}>
                    {b.status || t('seoNoResponse')} — {b.url}
                  </li>
                ))}
                {result.orphans.map((u) => (
                  <li key={u}>
                    {t('seoOrphan')} — {u}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function Fact({ ok, text }: { ok: boolean; text: string }) {
  const { t } = useAdmin();
  return (
    <li>
      <span className={'badge-status ' + (ok ? 'green' : 'amber')}>
        <span className="dot" aria-hidden="true" />
        {ok ? t('seoOk') : t('seoAttention')}
      </span>{' '}
      {text}
    </li>
  );
}

function TourList({ data }: { data: SeoData }) {
  const { t, locale } = useAdmin(),
    [filter, setFilter] = useState<'all' | 'issues'>('issues');
  const rows = data.trips
    .map((trip) => ({
      trip,
      health: data.health.find((h) => h.id === trip.id)!,
    }))
    .filter(
      ({ trip, health }) =>
        filter === 'all' ||
        (trip.status === 'published' &&
          health.issues.some((i) => i.severity !== 'info')),
    );
  return (
    <section className="panel" aria-labelledby="seo-tours-h">
      <div className="panel-head">
        <h2 id="seo-tours-h">{t('seoTours')}</h2>
        <Segmented
          label={t('seoFilter')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'issues', label: t('seoNeedsWork') },
            { value: 'all', label: t('seoAllTours') },
          ]}
        />
      </div>
      {!rows.length ? (
        <EmptyState title={t('allGood')} body={t('seoNothingToFix')} />
      ) : (
        <ul className="simple-list">
          {rows.map(({ trip, health }) => {
            const errors = health.issues.filter(
                (i) => i.severity === 'error',
              ).length,
              warnings = health.issues.filter(
                (i) => i.severity === 'warning',
              ).length;
            return (
              <li key={trip.id}>
                <AppLink href={'/seo/tours/' + trip.id} className="simple-row">
                  <span className="simple-main">
                    <span className="strong">
                      {trip.title[locale] || trip.title.en}
                    </span>
                    <span className="muted">
                      {t('seoCompleteOf', {
                        done: health.done.length,
                        total: completenessChecks.length,
                      })}
                      {' · '}
                      {t('seoIssueCounts', { errors, warnings })}
                    </span>
                  </span>
                  {trip.status !== 'published' && (
                    <span className="badge-status amber">
                      <span className="dot" aria-hidden="true" />
                      {t('seoNotPublished')}
                    </span>
                  )}
                </AppLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TourSeo({ data, id }: { data: SeoData; id: string }) {
  const { t, locale: uiLocale, save, request, report } = useAdmin(),
    client = useQueryClient(),
    trip = data.trips.find((x) => x.id === id),
    health = data.health.find((h) => h.id === id),
    [lang, setLang] = useState<Locale>(
      (data.locales as string[]).includes(uiLocale) ? uiLocale : 'en',
    ),
    [live, setLive] = useState<PageCheck | null>(null),
    [busy, setBusy] = useState(false),
    // Unsaved edits per language; untouched languages keep the stored value.
    [edits, setEdits] = useState<{
      title: Partial<Record<Locale, string>>;
      description: Partial<Record<Locale, string>>;
    }>({ title: {}, description: {} });
  if (!trip || !health)
    return <EmptyState title={t('notFoundTitle')} body={t('notFoundBody')} />;
  const stored = health.seo[lang as keyof typeof health.seo],
    ownTitle = edits.title[lang] ?? trip.seoTitle?.[lang] ?? '',
    ownDescription =
      edits.description[lang] ?? trip.seoDescription?.[lang] ?? '',
    seo = {
      ...stored,
      title: ownTitle.trim() || stored.suggestion.title,
      description: ownDescription.trim() || stored.suggestion.description,
    },
    dirty =
      Object.keys(edits.title).length + Object.keys(edits.description).length >
      0,
    url = `${data.origin}/${lang}/t/${trip.slug}`,
    href =
      trip.kind === 'package' ? '/packages/' + trip.id : '/trips/' + trip.id;
  // Saves hand-written titles/descriptions in every language at once. The API
  // needs English, so an empty English field keeps the automatic text.
  const saveOwn = async () => {
    const build = (field: 'title' | 'description') => {
      const own = field === 'title' ? trip.seoTitle : trip.seoDescription,
        edit = edits[field],
        out: Record<string, string> = {};
      for (const l of data.locales) {
        const value = (edit[l] ?? own?.[l] ?? '').trim();
        if (value) out[l] = value;
      }
      if (!Object.keys(out).length) return null;
      out.en ||= health.seo.en.suggestion[field];
      return out;
    };
    try {
      await save(
        '/v1/admin/trips/' + trip.id + '/seo',
        'PATCH',
        { seoTitle: build('title'), seoDescription: build('description') },
        { success: t('seoSaved') },
      );
      setEdits({ title: {}, description: {} });
      await client.invalidateQueries({ queryKey: ['/v1/admin/seo'] });
    } catch (error) {
      report(error);
    }
  };
  const issues = health.issues.filter((i) => !i.locale || i.locale === lang);
  // Copies the automatic texts into the admin overrides, keeping any
  // hand-written language. Editors on published trips create a draft.
  const adopt = async () => {
    const merge = (own: Loc | null, field: 'title' | 'description') => {
      const out: Record<string, string> = {};
      for (const l of data.locales) {
        const value =
          own?.[l]?.trim() ||
          health.seo[l as keyof typeof health.seo].suggestion[field];
        if (value) out[l] = value;
      }
      return out as Loc;
    };
    await save(
      '/v1/admin/trips/' + trip.id + '/seo',
      'PATCH',
      {
        seoTitle: merge(trip.seoTitle, 'title'),
        seoDescription: merge(trip.seoDescription, 'description'),
      },
      { success: t('seoSaved') },
    );
    await client.invalidateQueries({ queryKey: ['/v1/admin/seo'] });
  };
  const check = async () => {
    setBusy(true);
    try {
      setLive(
        await request<PageCheck>('/v1/admin/seo/page', 'POST', {
          slug: trip.slug,
          locale: lang,
        }),
      );
    } catch (error) {
      report(error, t('seoCheckFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <AppLink href="/seo/tours" className="back-link">
        {t('seoBackToTours')}
      </AppLink>
      <section className="panel" aria-labelledby="seo-trip-h">
        <div className="panel-head">
          <h2 id="seo-trip-h">{trip.title[lang] || trip.title.en}</h2>
          <AppLink href={href} className="btn">
            {t('seoEditTrip')}
          </AppLink>
        </div>
        <Segmented
          label={t('language')}
          value={lang}
          onChange={(v) => {
            setLang(v);
            setLive(null);
          }}
          options={data.locales.map((l) => ({
            value: l,
            label: l.toUpperCase(),
          }))}
        />
        <h3>{t('seoSnippet')}</h3>
        <div className="seo-snippet" lang={lang}>
          <span className="seo-snippet-url">
            {url.replace(/^https?:\/\//, '').replace(/\//g, ' › ')}
          </span>
          <span className="seo-snippet-title">{withBrand(seo.title)}</span>
          <span className="seo-snippet-desc">{seo.description}</span>
        </div>
        <p className="muted">
          {t('seoTitleLength', { n: withBrand(seo.title).length })} ·{' '}
          {t('seoDescriptionLength', { n: seo.description.length })} ·{' '}
          {seo.titleSource === 'override' &&
          seo.descriptionSource === 'override'
            ? t('seoSourceOverride')
            : t('seoSourceAutomatic')}
        </p>
        <div className="dialog-actions">
          {(seo.titleSource === 'default' ||
            seo.descriptionSource === 'default') && (
            <button type="button" className="btn" onClick={() => void adopt()}>
              {t('seoAdopt')}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => void check()}
            disabled={busy}
          >
            {busy ? t('seoChecking') : t('seoCheckPage')}
          </button>
        </div>
        <p className="muted">{t('seoAdoptHint')}</p>
        <h3>{t('seoEditTexts', { lang: lang.toUpperCase() })}</h3>
        <FormField
          label={t('seoTitleField')}
          hint={t('seoTitleHint')}
          aside={<span className="counter">{ownTitle.length}/60</span>}
        >
          {(p) => (
            <input
              {...p}
              lang={lang}
              maxLength={70}
              value={ownTitle}
              placeholder={stored.suggestion.title}
              onChange={(e) =>
                setEdits({
                  ...edits,
                  title: { ...edits.title, [lang]: e.target.value },
                })
              }
            />
          )}
        </FormField>
        <FormField
          label={t('seoDescriptionField')}
          hint={t('seoDescriptionHint')}
          aside={<span className="counter">{ownDescription.length}/158</span>}
        >
          {(p) => (
            <textarea
              {...p}
              lang={lang}
              rows={3}
              maxLength={170}
              value={ownDescription}
              placeholder={stored.suggestion.description}
              onChange={(e) =>
                setEdits({
                  ...edits,
                  description: { ...edits.description, [lang]: e.target.value },
                })
              }
            />
          )}
        </FormField>
        <p className="muted">{t('seoSocialNote')}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty}
            onClick={() => void saveOwn()}
          >
            {t('seoSaveTexts')}
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="seo-complete-h">
        <div className="panel-head">
          <h2 id="seo-complete-h">{t('seoCompleteness')}</h2>
          <span className="muted">
            {t('seoCompleteOf', {
              done: health.done.length,
              total: completenessChecks.length,
            })}
          </span>
        </div>
        <p className="muted">{t('seoCompletenessBody')}</p>
        <ul className="seo-facts">
          {completenessChecks.map((c: CompletenessCheck) => (
            <Fact
              key={c}
              ok={health.done.includes(c)}
              text={t('seoCheck_' + c)}
            />
          ))}
        </ul>
        {issues.length > 0 && (
          <>
            <h3>{t('seoIssues')}</h3>
            <ul>
              {issues.map((issue, index) => (
                <li key={index}>
                  {t('seoIssue_' + (issue.code as IssueCode))}
                  {issue.locale ? ` (${issue.locale.toUpperCase()})` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {live && (
        <section
          className="panel"
          aria-labelledby="seo-page-h"
          aria-live="polite"
        >
          <div className="panel-head">
            <h2 id="seo-page-h">{t('seoLivePage')}</h2>
            <a
              className="text-link"
              href={
                'https://search.google.com/test/rich-results?url=' +
                encodeURIComponent(live.url)
              }
              target="_blank"
              rel="noreferrer"
            >
              {t('seoRichResultsTest')}
            </a>
          </div>
          <ul className="seo-facts">
            <Fact
              ok={live.status === 200}
              text={t('seoHttpStatus', { n: live.status || '—' })}
            />
            {live.page && (
              <>
                <Fact
                  ok={live.page.metadataInHead}
                  text={t('seoMetadataInHead')}
                />
                <Fact
                  ok={!/noindex/i.test(live.page.robots)}
                  text={t('seoRobotsMeta', { v: live.page.robots || '—' })}
                />
                <Fact
                  ok={live.page.canonical === live.url}
                  text={t('seoCanonical', { v: live.page.canonical ?? '—' })}
                />
                <Fact
                  ok={!live.problems.includes('hreflang')}
                  text={t('seoHreflang', {
                    n: Object.keys(live.page.alternates).length,
                  })}
                />
                <Fact
                  ok={!live.problems.includes('jsonld')}
                  text={t('seoSchemaTypes', {
                    v: live.page.schemaTypes.join(', ') || '—',
                  })}
                />
              </>
            )}
          </ul>
          {live.page && (
            <details>
              <summary>{t('seoStructuredData')}</summary>
              <pre className="seo-json">
                {JSON.stringify(live.page.jsonld, null, 2)}
              </pre>
            </details>
          )}
        </section>
      )}
    </>
  );
}

function Intelligence({ data }: { data: SeoData }) {
  const { t } = useAdmin();
  return (
    <section className="panel" aria-labelledby="seo-intel-h">
      <div className="panel-head">
        <h2 id="seo-intel-h">{t('seoIntelligence')}</h2>
      </div>
      <p className="muted">{t('seoIntelligenceBody')}</p>
      <ul className="simple-list">
        {data.integrations.map((i) => (
          <li key={i.id} className="seo-integration">
            <span className="simple-main">
              <span className="strong">{t('seoIntegration_' + i.id)}</span>
              <span className="muted">{t('seoIntegrationShows_' + i.id)}</span>
            </span>
            <span className="badge-status amber">
              <span className="dot" aria-hidden="true" />
              {t('seoNotConnected')}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted">{t('seoIntegrationSetup')}</p>
    </section>
  );
}
