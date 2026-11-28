'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Copy,
  Filter,
  Mail,
  Phone,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { can } from '@stella/shared/admin';
import { isCoreLocale, type Locale } from '@stella/shared';
import {
  scheduleNotice,
  storedScheduleNotice,
} from '@stella/shared/i18n/booking-messages';
import { bookingArea } from '@stella/shared/i18n/guests';
import { useAdmin, useData } from '../lib/admin-context';
import { content, obj, rows, type Row } from '../lib/content';
import { addDays, dateTime, dayLabel, money, relative } from '../lib/format';
import { usePriceText, formatLabelKey } from '../lib/catalog';
import { useGuard } from '../lib/guard';
import { AppLink } from '../components/ui/link';
import { SearchBox, Pagination } from '../components/ui/data-table';
import { StatusBadge } from '../components/ui/status';
import { Menu, type MenuItem } from '../components/ui/menu';
import { useConfirm } from '../components/ui/dialog';
import { WhatsAppIcon } from '../components/ui/whatsapp-icon';
import { EmptyState, LoadError, Skeleton } from '../components/ui/states';
import { FormField, AutoTextarea } from '../components/ui/field';
import { usePageTitle } from '../components/ui/editor';

const replies: Record<string, string> = {
  en: 'Hello {name}, this is Stella Sharm Tours about your request {ref}.\n{trips}\nPickup: {pickup}\nPickup time: [to confirm]',
  it: 'Ciao {name}, siamo Stella Sharm Tours e ti contattiamo per la richiesta {ref}.\n{trips}\nRitiro: {pickup}\nOrario di ritiro: [da confermare]',
  es: 'Hola {name}, somos Stella Sharm Tours y te escribimos sobre tu solicitud {ref}.\n{trips}\nRecogida: {pickup}\nHora de recogida: [por confirmar]',
  fr: 'Bonjour {name}, ici Stella Sharm Tours au sujet de votre demande {ref}.\n{trips}\nPrise en charge : {pickup}\nHeure de prise en charge : [à confirmer]',
  de: 'Hallo {name}, hier ist Stella Sharm Tours zu deiner Anfrage {ref}.\n{trips}\nAbholung: {pickup}\nAbholzeit: [noch zu bestätigen]',
  ru: 'Здравствуйте, {name}! Это Stella Sharm Tours по вашей заявке {ref}.\n{trips}\nМесто трансфера: {pickup}\nВремя трансфера: [уточняется]',
  tr: 'Merhaba {name}, {ref} talebiniz için Stella Sharm Tours olarak yazıyoruz.\n{trips}\nAlınış yeri: {pickup}\nAlınış saati: [teyit edilecek]',
};
const mainTabs = ['new', 'contacted', 'confirmed'] as const;
const moreTabs = ['completed', 'cancelled', 'spam', 'all'] as const;
const tabs = [...mainTabs, ...moreTabs] as const;

/** Trip date = request start date + (dayIndex − 1); dayIndex is 1-based. */
const tripDate = (start: unknown, dayIndex: unknown) =>
  start ? addDays(String(start), Number(dayIndex ?? 1) - 1) : null;

export function Requests({ id }: { id?: string }) {
  const { t, tp, locale, me, request, report, notify } = useAdmin(),
    params = useSearchParams(),
    router = useRouter(),
    status = (tabs as readonly string[]).includes(params.get('status') ?? '')
      ? (params.get('status') as string)
      : 'new',
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [showFilters, setShowFilters] = useState(false),
    [filters, setFilters] = useState({
      from: params.get('from') ?? '',
      to: '',
      tripFrom: '',
      tripTo: '',
      assigned: '',
    });
  usePageTitle(t('requests'));
  const filterQuery = [
    q && 'q=' + encodeURIComponent(q),
    ...Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => k + '=' + encodeURIComponent(v)),
  ]
    .filter(Boolean)
    .join('&');
  const visibleQuery = [status === 'all' ? '' : 'status=' + status, filterQuery]
    .filter(Boolean)
    .join('&');
  const list = useData<Row[]>(
      `/v1/admin/requests?page=${page}${visibleQuery ? '&' + visibleQuery : ''}`,
    ),
    counts = useData<Record<string, number>>(
      '/v1/admin/requests/counts' + (filterQuery ? '?' + filterQuery : ''),
    ),
    assignees = useData<Row[]>('/v1/admin/request-assignees');
  const activeFilters = Object.values(filters).filter(Boolean).length;
  useEffect(() => setPage(1), [status, filterQuery]);
  const setStatus = (value: string) => {
    const search = new URLSearchParams(params.toString());
    search.set('status', value);
    router.replace(
      (id ? '/requests/' + id : '/requests') + '?' + search.toString(),
    );
  };
  const exportCsv = async (scope: 'all' | 'filtered') => {
    try {
      const file = await request<Blob>(
        '/v1/admin/requests/export.csv?scope=' +
          scope +
          (scope === 'filtered' && visibleQuery ? '&' + visibleQuery : ''),
      );
      const url = URL.createObjectURL(file),
        link = document.createElement('a');
      link.href = url;
      link.download = 'requests-' + scope + '.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(t('requestsCsvDownloaded'));
    } catch (error) {
      report(error);
    }
  };
  const query = params.toString() ? '?' + params.toString() : '';
  return (
    <div className={'inbox' + (id ? ' has-detail' : '')}>
      <div className="inbox-list">
        <header className="page-header inbox-header">
          <div className="page-header-text">
            <h1>{t('requests')}</h1>
          </div>
          {can(me!.role, 'export') && (
            <Menu
              items={[
                {
                  label: t('exportFilteredCsv'),
                  onSelect: () => void exportCsv('filtered'),
                },
                {
                  label: t('exportAllCsv'),
                  onSelect: () => void exportCsv('all'),
                },
              ]}
            />
          )}
        </header>
        <div className="tabs-row">
          <div className="tabs" role="tablist" aria-label={t('requestStatus')}>
            {[
              ...mainTabs,
              ...((moreTabs as readonly string[]).includes(status)
                ? [status]
                : []),
            ].map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                className="tab"
                onClick={() => setStatus(value)}
              >
                {t(value === 'all' ? 'all' : 'req_' + value)}
                <span className="tab-count">
                  {counts.data
                    ? new Intl.NumberFormat(locale).format(
                        counts.data[value] ?? 0,
                      )
                    : ''}
                </span>
              </button>
            ))}
          </div>
          <Menu
            label={t('moreStatuses')}
            triggerClass="tab tab-more"
            trigger={
              <>
                {t('moreTab')}
                <ChevronDown size={16} aria-hidden />
              </>
            }
            items={moreTabs
              .filter((value) => value !== status)
              .map((value) => ({
                label:
                  t(value === 'all' ? 'all' : 'req_' + value) +
                  (counts.data
                    ? ' · ' +
                      new Intl.NumberFormat(locale).format(
                        counts.data[value] ?? 0,
                      )
                    : ''),
                onSelect: () => setStatus(value),
              }))}
          />
        </div>
        <div className="inbox-tools">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder={t('searchRequests')}
          />
          <button
            type="button"
            className="btn"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter size={16} aria-hidden />
            {t('filters')}
            {activeFilters > 0 && (
              <span className="pill-count">{activeFilters}</span>
            )}
          </button>
        </div>
        {showFilters && (
          <div className="filter-panel">
            <FormField label={t('createdFrom')}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={filters.from}
                  onChange={(e) =>
                    setFilters({ ...filters, from: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label={t('createdTo')}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={filters.to}
                  onChange={(e) =>
                    setFilters({ ...filters, to: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label={t('tripFrom')}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={filters.tripFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, tripFrom: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label={t('tripTo')}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={filters.tripTo}
                  onChange={(e) =>
                    setFilters({ ...filters, tripTo: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label={t('assignedTo')}>
              {(p) => (
                <select
                  {...p}
                  value={filters.assigned}
                  onChange={(e) =>
                    setFilters({ ...filters, assigned: e.target.value })
                  }
                >
                  <option value="">{t('anyone')}</option>
                  <option value="none">{t('unassigned')}</option>
                  {assignees.data?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {String(user.name)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            {activeFilters > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setFilters({
                    from: '',
                    to: '',
                    tripFrom: '',
                    tripTo: '',
                    assigned: '',
                  })
                }
              >
                {t('clearFilters')}
              </button>
            )}
          </div>
        )}
        {list.isPending ? (
          <Skeleton rows={6} />
        ) : list.isError ? (
          <LoadError retry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          q || activeFilters ? (
            <EmptyState
              variant="filtered"
              title={q ? t('noRequestsMatch', { q }) : t('noRequestsFiltered')}
              action={
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setQ('');
                    setFilters({
                      from: '',
                      to: '',
                      tripFrom: '',
                      tripTo: '',
                      assigned: '',
                    });
                  }}
                >
                  {t('clearFilters')}
                </button>
              }
            />
          ) : (
            <EmptyState
              title={t('noRequestsIn', {
                status: t(status === 'all' ? 'all' : 'req_' + status),
              })}
              body={status === 'new' ? t('noNewBody') : undefined}
            />
          )
        ) : (
          <>
            <ul className="request-list" aria-label={t('requests')}>
              {list.data.map((row) => {
                const items = rows(row.tripItems),
                  first = items[0],
                  titles = items
                    .map((item) => content(item.title, locale))
                    .filter(Boolean),
                  guests = Number(row.adults ?? 0) + Number(row.children ?? 0);
                return (
                  <li key={row.id}>
                    <AppLink
                      href={'/requests/' + row.id + query}
                      className={
                        'request-row' + (row.id === id ? ' selected' : '')
                      }
                      aria-current={row.id === id ? 'true' : undefined}
                    >
                      <span className="request-line1">
                        <span className="strong truncate">
                          {String(row.name)}
                        </span>
                        <StatusBadge
                          kind="request"
                          status={String(row.status)}
                        />
                      </span>
                      <span className="request-line2 muted">
                        <bdi>{String(row.ref)}</bdi>
                        {' · '}
                        {tp('tripsCount', items.length)}
                        {first && row.startDate
                          ? ' · ' +
                            dayLabel(
                              tripDate(row.startDate, first.dayIndex)!,
                              locale,
                            )
                          : ''}
                        {' · '}
                        {tp('guestsCount', guests)}
                      </span>
                      {titles.length > 0 && (
                        <span className="request-line3 muted truncate">
                          {titles.slice(0, 2).join(' · ')}
                          {titles.length > 2
                            ? ' ' + tp('plusMore', titles.length - 2)
                            : ''}
                        </span>
                      )}
                      <span className="request-aside">
                        <span className="muted">
                          {relative(String(row.createdAt), locale)}
                        </span>
                        <span className="strong">
                          {money(
                            row.estimateEur as string | null,
                            locale,
                            row.currency as string | undefined,
                          ) ?? t('onRequest')}
                        </span>
                      </span>
                    </AppLink>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={page}
              pageSize={50}
              shown={list.data.length}
              total={counts.data?.[status]}
              hasNext={list.data.length === 50}
              onPage={setPage}
            />
          </>
        )}
      </div>
      <div className="inbox-detail">
        {id ? (
          <RequestDetail
            key={id}
            id={id}
            backHref={'/requests' + query}
            onMoved={(next) => {
              // Follow the request to its new tab so it doesn't vanish.
              if (status !== 'all' && next !== status) setStatus(next);
            }}
          />
        ) : (
          <EmptyState title={t('pickRequest')} body={t('pickRequestBody')} />
        )}
      </div>
    </div>
  );
}

function useRequestStatus(row: Row, onMoved?: (status: string) => void) {
  const { t, save } = useAdmin(),
    confirm = useConfirm(),
    ref = String(row.ref);
  return async (next: string) => {
    if (next === row.status) return;
    if (next === 'cancelled') {
      const ok = await confirm({
        title: t('cancelRequestTitle', { ref }),
        body: t('cancelRequestBody'),
        confirmLabel: t('markCancelled'),
        cancelLabel: t('keepRequest'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    if (next === 'spam') {
      const ok = await confirm({
        title: t('spamTitle', { ref }),
        body: t('spamBody'),
        confirmLabel: t('markSpam'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    await save(
      '/v1/admin/requests/' + row.id,
      'PATCH',
      { status: next },
      {
        success: t('requestMarked', {
          status: t('req_' + next).toLocaleLowerCase(),
        }),
      },
    );
    onMoved?.(next);
  };
}

function RequestDetail({
  id,
  backHref,
  onMoved,
}: {
  id: string;
  backHref: string;
  onMoved?: (status: string) => void;
}) {
  const { t, tp, locale, me, save, report, online, notify } = useAdmin(),
    query = useData<Row>('/v1/admin/requests/' + id),
    assignees = useData<Row[]>('/v1/admin/request-assignees'),
    history = useData<Row[]>(
      '/v1/admin/audit?entity=request&entityId=' + id,
      can(me!.role, 'audit'),
    ),
    users = useData<Row[]>('/v1/admin/audit-actors', can(me!.role, 'audit')),
    priceText = usePriceText(),
    [askContacted, setAskContacted] = useState(false),
    [note, setNote] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    { navigate } = useGuard();
  const row = query.data;
  const setStatus = useRequestStatus(row ?? { id }, onMoved);
  usePageTitle(row ? String(row.name) + ' · ' + t('requests') : t('requests'));
  const items = useMemo(
    () =>
      rows(row?.items).sort(
        (a, b) => Number(a.dayIndex ?? 0) - Number(b.dayIndex ?? 0),
      ),
    [row?.items],
  );
  if (query.isPending) return <Skeleton variant="editor" rows={4} />;
  if (!row) return <LoadError retry={() => void query.refetch()} />;
  const customerLocale: Locale = isCoreLocale(String(row.locale))
    ? (String(row.locale) as Locale)
    : 'en';
  const dates = items.map((item) => tripDate(row.startDate, item.dayIndex));
  const dupes = new Set(dates.filter((d, i) => d && dates.indexOf(d) !== i));
  const message = (replies[customerLocale] ?? replies.en!).replace(
    /\{(name|ref|trips|pickup)\}/g,
    (_, key: string) =>
      ({
        name: String(row.name),
        ref: String(row.ref),
        trips: items
          .map(
            (item, index) =>
              (dates[index]
                ? dayLabel(dates[index]!, customerLocale) + ' — '
                : '') + content(item.title, customerLocale),
          )
          .join('\n'),
        pickup: bookingArea(String(row.pickupArea ?? ''), customerLocale),
      })[key] ?? '',
  );
  const phone = String(row.phone ?? ''),
    validPhone = /^\+[1-9]\d{7,14}$/.test(phone),
    anonymized = !!row.anonymizedAt,
    status = String(row.status);
  const forward: Record<string, string | undefined> = {
    new: 'contacted',
    contacted: 'confirmed',
    confirmed: 'completed',
  };
  const statusItems: MenuItem[] = [
    ...(['new', 'contacted', 'confirmed', 'completed'] as const).map(
      (value) => ({
        label: t('req_' + value),
        checked: status === value,
        onSelect: () => void setStatus(value).catch(report),
      }),
    ),
    'separator',
    {
      label: t('cancelRequestAction'),
      tone: 'danger',
      checked: status === 'cancelled',
      onSelect: () => void setStatus('cancelled').catch(report),
    },
    {
      label: t('markSpamAction'),
      tone: 'danger',
      checked: status === 'spam',
      onSelect: () => void setStatus('spam').catch(report),
    },
  ];
  const userName = (uid: unknown) =>
    String(
      assignees.data?.find((u) => u.id === uid)?.name ??
        users.data?.find((u) => u.id === uid)?.name ??
        t('someone'),
    );
  const guests = [
    tp('adultsCount', Number(row.adults ?? 0)),
    Number(row.children) ? tp('childrenCount', Number(row.children)) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const originalNote =
    row.internalNote === storedScheduleNotice
      ? scheduleNotice[locale]
      : String(row.internalNote ?? '');
  const noteValue = note ?? originalNote;
  return (
    <article className="request-detail" aria-labelledby="request-name">
      <button
        type="button"
        className="back-link mobile-only"
        onClick={() => void navigate(backHref)}
      >
        <ArrowLeft size={18} aria-hidden />
        {t('requests')}
      </button>
      <header className="detail-head">
        <div>
          <h2 id="request-name" className="detail-title">
            {String(row.name)}
          </h2>
          <p className="detail-meta">
            <bdi className="mono">{String(row.ref)}</bdi>
            <button
              type="button"
              className="icon-btn sm"
              aria-label={t('copyRef')}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(String(row.ref))
                  .then(() => notify(t('refCopied')));
              }}
            >
              <Copy size={14} aria-hidden />
            </button>
            <span className="chip">{customerLocale.toUpperCase()}</span>
            <span className="muted">
              {dateTime(String(row.createdAt), locale)}
            </span>
          </p>
        </div>
        {!anonymized ? (
          <Menu
            items={statusItems}
            label={t('changeStatus')}
            triggerClass="status-trigger"
            trigger={
              <>
                <StatusBadge kind="request" status={status} />
                <ChevronDown size={16} aria-hidden />
                <span className="sr-only">{t('changeStatus')}</span>
              </>
            }
          />
        ) : (
          <StatusBadge kind="request" status={status} />
        )}
      </header>
      {anonymized && <p className="callout info">{t('anonymizedNote')}</p>}
      {!anonymized && (
        <div className="action-row">
          {validPhone && (
            <a
              className="btn btn-whatsapp"
              href={
                'https://wa.me/' +
                phone.slice(1) +
                '?text=' +
                encodeURIComponent(message)
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => status === 'new' && setAskContacted(true)}
            >
              <WhatsAppIcon size={19} />
              {t('whatsapp')}
            </a>
          )}
          {validPhone && (
            <a className="btn" href={'tel:' + phone}>
              <Phone size={18} aria-hidden />
              {t('call')}
            </a>
          )}
          {Boolean(row.email) && (
            <a className="btn" href={'mailto:' + String(row.email)}>
              <Mail size={18} aria-hidden />
              {t('email')}
            </a>
          )}
          {forward[status] && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!online}
              onClick={() => void setStatus(forward[status]!).catch(report)}
            >
              {t('markAs', {
                status: t('req_' + forward[status]!).toLocaleLowerCase(),
              })}
            </button>
          )}
        </div>
      )}
      {askContacted && status === 'new' && (
        <div className="callout info inline-prompt" role="status">
          <span>{t('askContacted')}</span>
          <div className="prompt-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setAskContacted(false);
                void setStatus('contacted').catch(report);
              }}
            >
              {t('mark')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setAskContacted(false)}
            >
              {t('notNow')}
            </button>
          </div>
        </div>
      )}
      <section className="detail-section" aria-labelledby="plan-h">
        <h3 id="plan-h">{t('tripPlan')}</h3>
        {!items.length ? (
          <p className="muted">{t('noTripsInRequest')}</p>
        ) : (
          <div className="table-scroll">
            <table className="plain-table plan-table">
              <thead>
                <tr>
                  <th scope="col">{t('date')}</th>
                  <th scope="col">{t('trip')}</th>
                  <th scope="col">{t('format')}</th>
                  <th scope="col" className="num">
                    {t('price')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const snapshot = obj(item.priceSnapshot),
                    prices = rows(snapshot.prices),
                    selected =
                      prices.find((p) => p.id === snapshot.selected_price_id) ??
                      prices.find((p) => p.is_primary ?? p.isPrimary) ??
                      prices[0];
                  const priceRow = selected
                    ? {
                        amountEur: selected.amount_eur ?? selected.amountEur,
                        unit: selected.unit,
                      }
                    : null;
                  return (
                    <tr key={index}>
                      <td className="nowrap" data-label={t('date')}>
                        {dates[index] ? dayLabel(dates[index]!, locale) : '—'}
                        {dates[index] && dupes.has(dates[index]) && (
                          <span className="warn-chip">
                            <AlertTriangle size={14} aria-hidden />
                            {t('sameDay')}
                          </span>
                        )}
                      </td>
                      <td data-label={t('trip')}>
                        {can(me!.role, 'content') ? (
                          <AppLink
                            href={'/trips/' + String(item.tripId)}
                            className="text-link"
                          >
                            {content(item.title, locale)}
                          </AppLink>
                        ) : (
                          content(item.title, locale)
                        )}
                      </td>
                      <td data-label={t('format')}>
                        {t(formatLabelKey(snapshot.format ?? row.format))}
                      </td>
                      <td className="num" data-label={t('price')}>
                        {priceText(priceRow, snapshot.on_request === true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    {t('estimate')}
                  </th>
                  <td className="num strong">
                    {money(
                      row.estimateEur as string | null,
                      locale,
                      row.currency as string | undefined,
                    ) ?? t('onRequest')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      <section className="detail-section" aria-labelledby="customer-h">
        <h3 id="customer-h">{t('customer')}</h3>
        <dl className="kv">
          {[
            ['phone', phone],
            ['email', row.email],
            ['hotel', row.hotel],
            ['pickup', bookingArea(String(row.pickupArea ?? ''), locale)],
            ['guests', guests],
            [
              'childAges',
              rows(row.childAges).length
                ? (row.childAges as unknown[]).join(', ')
                : '',
            ],
            [
              'startDate',
              row.startDate ? dayLabel(String(row.startDate), locale) : '',
            ],
            ['notes', row.notes],
          ]
            .filter(
              ([, value]) =>
                value !== null && value !== undefined && value !== '',
            )
            .map(([label, value]) => (
              <div key={String(label)}>
                <dt>{t(String(label))}</dt>
                <dd>
                  <bdi className="pre-wrap">{String(value)}</bdi>
                </dd>
              </div>
            ))}
        </dl>
      </section>
      {!anonymized && (
        <section className="detail-section" aria-labelledby="internal-h">
          <h3 id="internal-h">{t('internal')}</h3>
          <FormField label={t('assignedTo')}>
            {(p) => (
              <select
                {...p}
                value={String(row.assignedTo ?? '')}
                disabled={!online}
                onChange={async (event) => {
                  const value = event.target.value || null;
                  try {
                    await save(
                      '/v1/admin/requests/' + id,
                      'PATCH',
                      { assignedTo: value },
                      {
                        success: value
                          ? t('assignedToName', { name: userName(value) })
                          : t('unassignedToast'),
                      },
                    );
                  } catch (error) {
                    report(error);
                  }
                }}
              >
                <option value="">{t('unassigned')}</option>
                {assignees.data?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {String(user.name)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField
            label={t('internalNote')}
            hint={
              row.updatedAt
                ? t('lastUpdated', {
                    when: dateTime(String(row.updatedAt), locale),
                  })
                : undefined
            }
          >
            {(p) => (
              <AutoTextarea
                {...p}
                value={noteValue}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </FormField>
          {note !== null && note !== originalNote && (
            <div className="inline-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setNote(null)}
              >
                {t('discard')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !online}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await save(
                      '/v1/admin/requests/' + id,
                      'PATCH',
                      { internalNote: note || null },
                      { success: t('noteSaved') },
                    );
                    setNote(null);
                  } catch (error) {
                    report(error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <span className="spinner" aria-hidden />}
                {t('saveNote')}
              </button>
            </div>
          )}
        </section>
      )}
      {can(me!.role, 'audit') && (
        <section className="detail-section" aria-labelledby="history-h">
          <h3 id="history-h">{t('history')}</h3>
          {history.isPending ? (
            <Skeleton rows={2} />
          ) : !history.data?.length ? (
            <p className="muted">{t('noHistory')}</p>
          ) : (
            <ol className="timeline">
              {history.data.flatMap((entry) => {
                const before = obj(entry.before),
                  after = obj(entry.after),
                  who = String(entry.userName ?? t('system')),
                  when = dateTime(String(entry.at), locale),
                  lines: string[] = [];
                if (
                  before.status &&
                  after.status &&
                  before.status !== after.status
                )
                  lines.push(
                    t('histStatus', {
                      who,
                      from: t('req_' + String(before.status)),
                      to: t('req_' + String(after.status)),
                    }),
                  );
                if ((before.assignedTo ?? null) !== (after.assignedTo ?? null))
                  lines.push(
                    after.assignedTo
                      ? t('histAssigned', {
                          who,
                          name: userName(after.assignedTo),
                        })
                      : t('histUnassigned', { who }),
                  );
                if (!lines.length && entry.action === 'restore')
                  lines.push(t('histRestored', { who }));
                return lines.map((line, i) => (
                  <li key={entry.id + '-' + i}>
                    <span>{line}</span>
                    <time className="muted">{when}</time>
                  </li>
                ));
              })}
            </ol>
          )}
        </section>
      )}
    </article>
  );
}
