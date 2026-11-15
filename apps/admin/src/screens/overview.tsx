'use client';
import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { can } from '@stella/shared/admin';
import { locales } from '@stella/shared';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { addDays, dayLabel, relative } from '../lib/format';
import { PageHeader } from '../components/ui/page-header';
import { AppLink } from '../components/ui/link';
import { StatusBadge } from '../components/ui/status';
import { EmptyState, Skeleton } from '../components/ui/states';

const cairoToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(
    new Date(),
  );

export function Overview() {
  const { t, tp, me, locale, request } = useAdmin(),
    role = me!.role,
    sales = can(role, 'requests'),
    contentRole = can(role, 'content'),
    weekStart = addDays(cairoToday(), -6);
  const counts = useData<Record<string, number>>(
      '/v1/admin/requests/counts',
      sales,
    ),
    week = useData<Record<string, number>>(
      '/v1/admin/requests/counts?from=' + weekStart,
      sales,
    ),
    latest = useData<Row[]>('/v1/admin/requests?page=1', sales),
    trips = useData<Row[]>('/v1/admin/trips', contentRole),
    packages = useData<Row[]>('/v1/admin/packages', contentRole),
    settings = useData<Row>('/v1/admin/settings', can(role, 'settings')),
    faqs = useData<Row[]>('/v1/admin/faqs', contentRole),
    [showAll, setShowAll] = useState(false);
  const pages = useQueries({
    queries: ['contact', 'terms', 'privacy', 'cancellation'].map((key) => ({
      queryKey: ['/v1/admin/pages/' + key + '/blocks'],
      queryFn: () => request<Row[]>('/v1/admin/pages/' + key + '/blocks'),
      enabled: contentRole,
    })),
  });
  const queue = useQueries({
    queries: locales
      .filter((code) => code !== 'en')
      .map((code) => ({
        queryKey: ['/v1/admin/i18n/queue?locale=' + code],
        queryFn: () => request<Row[]>('/v1/admin/i18n/queue?locale=' + code),
        enabled: can(role, 'translations'),
        staleTime: 60000,
      })),
  });
  const tripRows = (trips.data ?? []).filter((row) => row.kind === 'trip'),
    missingPrice = tripRows.filter(
      (row) => row.primaryUnit == null && !row.onRequest,
    ),
    noCover = tripRows.filter((row) => !row.coverMediaId),
    draftPackages = (packages.data ?? []).filter(
      (row) => row.status !== 'published',
    ),
    toTranslate = queue.every((q) => q.data)
      ? queue.reduce(
          (sum, q) =>
            sum +
            (q.data ?? []).filter((item) => item.state !== 'human').length,
          0,
        )
      : null;
  const attention: { key: string; text: string; href: string }[] = [];
  for (const row of noCover)
    attention.push({
      key: 'cover' + row.id,
      text: t('attnNoCover', { name: content(row.title, locale) }),
      href: '/trips/' + row.id + '#section-media',
    });
  for (const row of missingPrice)
    attention.push({
      key: 'price' + row.id,
      text: t('attnNoPrice', { name: content(row.title, locale) }),
      href: '/trips/' + row.id + '#section-prices',
    });
  for (const row of draftPackages)
    attention.push({
      key: 'pkg' + row.id,
      text: t('attnDraftPackage', { name: content(row.title, locale) }),
      href: '/packages/' + row.id,
    });
  // Footer pages: empty first, then pages whose changes aren't live yet.
  ['contact', 'terms', 'privacy', 'cancellation'].forEach((key, index) => {
    const data = pages[index]?.data;
    if (data && !data.length)
      attention.unshift({
        key: 'page' + key,
        text: t('attnEmptyPage', { name: t('page_' + key) }),
        href: '/pages/' + key,
      });
    else if (data?.some((b) => b.status === 'draft'))
      attention.unshift({
        key: 'pagedraft' + key,
        text: t('attnPageDraft', { name: t('page_' + key) }),
        href: '/pages/' + key,
      });
  });
  if (faqs.data && !faqs.data.some((f) => f.status === 'published'))
    attention.unshift({
      key: 'faq',
      text: t('attnFaqEmpty'),
      href: '/pages/faq',
    });
  for (const row of tripRows.filter((r) => !obj(r.summary).en))
    attention.push({
      key: 'summary' + row.id,
      text: t('attnNoSummary', { name: content(row.title, locale) }),
      href: '/trips/' + row.id,
    });
  if (settings.data) {
    const contacts = obj(settings.data.contacts);
    if (!contacts.phone || !contacts.email)
      attention.push({
        key: 'contacts',
        text: t('attnContacts'),
        href: '/settings#section-contact',
      });
    if (!rows(settings.data.social).length)
      attention.push({
        key: 'social',
        text: t('attnSocial'),
        href: '/settings#section-social',
      });
  }
  const stats = [
    sales && {
      key: 'new',
      label: t('statNew'),
      value: counts.data?.new,
      href: '/requests?status=new',
    },
    sales && {
      key: 'week',
      label: t('statWeek'),
      value: week.data?.all,
      href: '/requests?status=all&from=' + weekStart,
    },
    contentRole && {
      key: 'price',
      label: t('statNoPrice'),
      value: trips.data ? missingPrice.length : undefined,
      href: '/trips?missing=price',
      done: t('allSet'),
    },
    can(role, 'translations') && {
      key: 'i18n',
      label: t('statTranslate'),
      value: toTranslate ?? undefined,
      href: '/translations',
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    value?: number;
    href: string;
    done?: string;
  }[];
  return (
    <div className="page">
      <PageHeader
        title={t('overview')}
        description={t('overviewHello', { name: me!.name })}
      />
      {stats.length > 0 && (
        <ul className="stat-grid">
          {stats.map((stat) => (
            <li key={stat.key}>
              <AppLink href={stat.href} className="stat-card">
                <span className="stat-value">
                  {stat.value === undefined ? (
                    <span
                      className="skeleton inline"
                      aria-label={t('loading')}
                    />
                  ) : stat.done && stat.value === 0 ? (
                    <span className="stat-done">{stat.done}</span>
                  ) : (
                    new Intl.NumberFormat(locale).format(stat.value)
                  )}
                </span>
                <span className="stat-label">{stat.label}</span>
              </AppLink>
            </li>
          ))}
        </ul>
      )}
      <div className="overview-grid">
        {sales && (
          <section className="panel" aria-labelledby="latest-h">
            <div className="panel-head">
              <h2 id="latest-h">{t('latestRequests')}</h2>
              <AppLink href="/requests?status=all" className="text-link">
                {t('viewAll')}
              </AppLink>
            </div>
            {latest.isPending ? (
              <Skeleton rows={5} />
            ) : !latest.data?.length ? (
              <EmptyState
                title={t('noRequestsYet')}
                body={t('noRequestsYetBody')}
              />
            ) : (
              <ul className="simple-list">
                {latest.data.slice(0, 5).map((row) => {
                  const items = rows(row.tripItems),
                    first = items[0];
                  return (
                    <li key={row.id}>
                      <AppLink
                        href={'/requests/' + row.id}
                        className="simple-row"
                      >
                        <span className="simple-main">
                          <span className="strong">{String(row.name)}</span>
                          <span className="muted">
                            {tp('tripsCount', items.length)}
                            {first && row.startDate
                              ? ' · ' +
                                dayLabel(
                                  addDays(
                                    String(row.startDate),
                                    Number(first.dayIndex ?? 1) - 1,
                                  ),
                                  locale,
                                )
                              : ''}
                            {' · '}
                            {relative(String(row.createdAt), locale)}
                          </span>
                        </span>
                        <StatusBadge
                          kind="request"
                          status={String(row.status)}
                        />
                      </AppLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {contentRole && (
          <section className="panel" aria-labelledby="attn-h">
            <div className="panel-head">
              <h2 id="attn-h">{t('needsAttention')}</h2>
            </div>
            {trips.isPending || packages.isPending ? (
              <Skeleton rows={4} />
            ) : !attention.length ? (
              <EmptyState title={t('allGood')} body={t('allGoodBody')} />
            ) : (
              <ul className="simple-list">
                {attention.slice(0, showAll ? undefined : 12).map((item) => (
                  <li key={item.key}>
                    <AppLink href={item.href} className="simple-row">
                      <AlertCircle
                        size={18}
                        aria-hidden
                        className="attn-icon"
                      />
                      <span className="simple-main">{item.text}</span>
                      <ChevronRight size={18} aria-hidden />
                    </AppLink>
                  </li>
                ))}
                {attention.length > 12 && (
                  <li className="more-note">
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-expanded={showAll}
                      onClick={() => setShowAll((v) => !v)}
                    >
                      {showAll
                        ? t('showFewer')
                        : tp('moreItems', attention.length - 12)}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
