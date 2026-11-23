'use client';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { bookingArea, bookingGuests } from '@stella/shared/i18n/guests';
import { money } from '@/lib/links';
import type { RequestSummary } from '@/lib/request-summary';

const at = (day: string) => new Date(day + 'T12:00:00Z');

export function RequestSummaryCard({
  reference,
  summary,
}: {
  reference: string;
  summary: RequestSummary;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const short = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const long = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const range = (start: string, end: string, format = short) =>
    start === end
      ? format.format(at(start))
      : format.formatRange(at(start), at(end));
  const onRequest = summary.estimate === null;
  return (
    <section className="request-summary" aria-label={t('summaryRef')}>
      <header className="request-summary-head">
        <span>{t('summaryRef')}</span>
        <strong>
          <bdi>{reference}</bdi>
        </strong>
      </header>

      <dl className="request-summary-facts">
        <div>
          <dt>
            <CalendarDays size={16} aria-hidden="true" />
            {t('summaryDates')}
          </dt>
          <dd>{range(summary.start, summary.end, long)}</dd>
        </div>
        <div>
          <dt>
            <Users size={16} aria-hidden="true" />
            {t('summaryGuests')}
          </dt>
          <dd>
            {bookingGuests(summary.adults, summary.children, locale)}
            <small>{t(summary.format)}</small>
          </dd>
        </div>
        <div>
          <dt>
            <MapPin size={16} aria-hidden="true" />
            {t('area')}
          </dt>
          <dd>
            {bookingArea(summary.area, locale)}
            {summary.hotel && (
              <small>
                <bdi>{summary.hotel}</bdi>
              </small>
            )}
          </dd>
        </div>
      </dl>

      <h3 className="request-summary-title">
        {t('summaryTours')}
        <span>{summary.items.length}</span>
      </h3>
      <ol className="request-summary-tours">
        {summary.items.map((item, index) => (
          <li key={index}>
            <span className="request-summary-date">
              <small>{weekday.format(at(item.start))}</small>
              <b>{at(item.start).getUTCDate()}</b>
            </span>
            <span className="request-summary-tour">
              <bdi>{item.title}</bdi>
              <small>{range(item.start, item.end)}</small>
            </span>
            <span
              className={
                'request-summary-price' +
                (item.amount === null ? ' on-request' : '')
              }
            >
              {item.amount === null ? (
                t('onRequest')
              ) : (
                <bdi>{money(item.amount, locale)}</bdi>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="request-summary-total">
        {onRequest && summary.known > 0 && (
          <div>
            <span>{t('pricedTripsSubtotal')}</span>
            <bdi>{money(summary.known, locale)}</bdi>
          </div>
        )}
        <div className="grand">
          <span>{t('estimate')}</span>
          <strong>
            {onRequest ? (
              t('onRequest')
            ) : (
              <bdi>{money(summary.estimate!, locale)}</bdi>
            )}
          </strong>
        </div>
        <p>{t('noPayment')}</p>
      </div>
    </section>
  );
}
