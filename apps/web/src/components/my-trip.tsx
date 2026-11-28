'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Trash2,
  ArrowUpRight,
  Sun,
  Plus,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from 'lucide-react';
import { planDays, requiresPrivateRequest } from '@stella/shared/days';
import { estimateTrips } from '@stella/shared/price';
import { useTripStore } from './store';
import { Content } from './text';
import { Media } from './media';
import { money } from '@/lib/links';
import { useTripReorder } from './trip-reorder';
import { useCurrency } from './currency';
export function MyTrip({ overlay = false }: { overlay?: boolean }) {
  const currency = useCurrency();
  const Root = overlay ? 'div' : 'main';
  const t = useTranslations(),
    locale = useLocale(),
    ids = useTripStore((s) => s.ids),
    order = useTripStore((s) => s.order),
    cache = useTripStore((s) => s.cache),
    ready = useTripStore((s) => s.ready),
    lastRequest = useTripStore((s) => s.lastRequest),
    rest = useTripStore((s) => s.rest),
    lookup = useTripStore((s) => s.lookup),
    attempt = useTripStore((s) => s.lookupAttempt),
    removeSaved = useTripStore((s) => s.removeSaved),
    moveSaved = useTripStore((s) => s.moveSaved),
    retryLookup = useTripStore((s) => s.retryLookup);
  const localLookup = lookup?.locale === locale ? lookup : null;
  const resolved = localLookup?.ids === ids && localLookup.attempt === attempt;
  const results = new Map(
    localLookup?.results.map((result) => [result.slug, result]),
  );
  const saved = (order ?? ids).map((slug) => {
    const result = results.get(slug);
    return {
      slug,
      status: result?.status,
      trip: result?.status === 'available' ? result.trip : cache[slug],
    };
  });
  const unresolved = saved.filter(
    ({ trip, status }) => !trip || status === 'withdrawn',
  );
  const canRequest =
    resolved && saved.every(({ status }) => status === 'available');
  const canRetry =
    resolved && saved.some(({ status }) => status === 'unavailable');
  const trips = saved.flatMap(({ trip, status }) =>
      trip && status !== 'withdrawn' ? [trip] : [],
    ),
    rows = planDays(trips, rest, !!order),
    format = requiresPrivateRequest(trips) ? 'private' : 'group',
    // Guests and dates are chosen in the request form; here we show the price
    // for one adult.
    estimate = estimateTrips(trips, 1, 0, format),
    canRest =
      !rest &&
      trips.filter((tr) => tr.flight || tr.overnight).length > 0 &&
      trips.length > 1;
  const counts = trips.reduce<Record<string, number>>(
    (sum, t) => ({
      ...sum,
      [t.collection]: (sum[t.collection] ?? 0) + t.days_count,
    }),
    {},
  );
  const colors: Record<string, string> = {
    sea: 'var(--sea)',
    desert: 'var(--desert)',
    relax: 'var(--relax)',
    history: 'var(--history)',
    beyond: 'var(--beyond)',
    all: 'var(--all)',
  };
  const visibleOrder = rows.flatMap(({ trip }) => (trip ? [trip.slug] : []));
  const [lastMoved, setLastMoved] = useState<string | null>(null);
  const moved = rows.find(({ trip }) => trip?.slug === lastMoved);
  function moveTrip(slug: string, target: string) {
    if (slug === target) return;
    moveSaved(slug, target, visibleOrder);
    setLastMoved(slug);
  }
  const { list, drag, grip } = useTripReorder(moveTrip);
  return (
    <Root className="wrap builder" id={overlay ? undefined : 'main'}>
      <p className="kicker">{t('myTrip')}</p>
      <h1>{t(ids.length ? 'build' : 'emptyTrip')}</h1>
      {!ready ? (
        <div className="skeleton" aria-busy="true" />
      ) : !ids.length ? (
        <>
          {lastRequest && (
            <p>
              <Link
                className="text-link"
                href={'/' + locale + '/request/done/' + lastRequest}
              >
                {t('requestSentShortcut')} <bdi>{lastRequest}</bdi>
              </Link>
            </p>
          )}
          <p>{t('emptyTripSub')}</p>
          <Link className="button ink" href={'/' + locale + '#journeys'}>
            {t('journeys')}
            <ArrowUpRight size={18} />
          </Link>
        </>
      ) : (
        <>
          {trips.length > 0 && (
            <div className="mix-bar" aria-hidden="true">
              {Object.entries(counts).map(([c, n]) => (
                <span
                  key={c}
                  style={{ flex: n, background: colors[c] ?? 'var(--ink)' }}
                />
              ))}
            </div>
          )}
          <div className="sr-only" role="status">
            {moved?.trip && (
              <>
                <Content value={moved.trip.title} /> ·{' '}
                {t('day', { day: moved.day })}
              </>
            )}
          </div>
          <div className="day-list" ref={list}>
            {rows.map((row) => {
              const trip = row.trip;
              const index = trip ? visibleOrder.indexOf(trip.slug) : -1;
              return (
                <article
                  className={'day-card ' + (!row.trip ? 'rest-day' : '')}
                  key={trip?.slug ?? 'rest-' + row.day}
                  data-trip-slug={trip?.slug}
                  data-dragging={
                    (!!trip && drag?.slug === trip.slug) || undefined
                  }
                  data-drop-target={
                    (!!trip &&
                      drag?.slug !== trip.slug &&
                      drag?.target === trip.slug) ||
                    undefined
                  }
                >
                  <span className="day-label">
                    {t('day', { day: row.day })}
                  </span>
                  {trip && visibleOrder.length > 1 && (
                    <div className="trip-order-controls">
                      <span
                        className="trip-grip"
                        aria-hidden="true"
                        onContextMenu={(event) => event.preventDefault()}
                        {...grip(trip.slug)}
                      >
                        <GripVertical size={19} />
                      </span>
                      {[
                        {
                          offset: -1,
                          label: 'moveTripEarlier',
                          Icon: ChevronUp,
                        },
                        {
                          offset: 1,
                          label: 'moveTripLater',
                          Icon: ChevronDown,
                        },
                      ].map(({ offset, label, Icon }) => {
                        const target = visibleOrder[index + offset];
                        return (
                          <button
                            className="icon-button"
                            type="button"
                            key={offset}
                            aria-label={t(label, { trip: trip.title.text })}
                            aria-disabled={!target}
                            onClick={() => {
                              if (target) moveTrip(trip.slug, target);
                            }}
                          >
                            <Icon size={18} aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {row.trip ? (
                    <>
                      <Link
                        className="day-image"
                        href={'/' + locale + '/t/' + row.trip.slug}
                      >
                        <Media media={row.trip.cover} sizes="120px" />
                      </Link>
                      <div>
                        <h2>
                          <Link href={'/' + locale + '/t/' + row.trip.slug}>
                            <Content value={row.trip.title} />
                          </Link>
                        </h2>
                        <p>
                          <Content value={row.trip.duration_label} />
                        </p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={t('remove') + ' · ' + row.trip.title.text}
                        onClick={() => row.trip && removeSaved(row.trip.slug)}
                      >
                        <Trash2 size={19} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="rest-icon" aria-hidden="true">
                        <Sun size={28} />
                      </span>
                      <div>
                        <h2>{t('beachDay')}</h2>
                        <p>{t('beachSub')}</p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={t('remove') + ' · ' + t('beachDay')}
                        onClick={() => useTripStore.getState().setRest(false)}
                      >
                        <Trash2 size={19} />
                      </button>
                    </>
                  )}
                </article>
              );
            })}
            {unresolved.map(({ slug, status, trip }) => (
              <article className="day-card saved-trip-placeholder" key={slug}>
                <div>
                  <h2>
                    <bdi>{trip?.title.text ?? slug.replaceAll('-', ' ')}</bdi>
                  </h2>
                  {status === 'withdrawn' && <p>{t('savedTourWithdrawn')}</p>}
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={
                    t('remove') +
                    ' · ' +
                    (trip?.title.text ?? slug.replaceAll('-', ' '))
                  }
                  onClick={() => removeSaved(slug)}
                >
                  <Trash2 size={19} />
                </button>
              </article>
            ))}
          </div>
          {canRest && (
            <button
              className="text-link add-rest"
              onClick={() => useTripStore.getState().setRest(true)}
            >
              <Plus size={16} />
              {t('restAdd')}
            </button>
          )}
          <div className="builder-total">
            {canRequest && (
              <div className="estimate-summary">
                {estimate.onRequest && estimate.amount > 0 && (
                  <div className="estimate-subtotal">
                    <span>{t('pricedTripsSubtotal')}</span>
                    <bdi>{money(estimate.amount, locale, currency)}</bdi>
                  </div>
                )}
                <div className="estimate">
                  <span>{t('estimatePerPerson')}</span>
                  <strong>
                    {estimate.onRequest ? (
                      t('onRequest')
                    ) : (
                      <bdi>{money(estimate.amount, locale, currency)}</bdi>
                    )}
                  </strong>
                </div>
              </div>
            )}
            <p className="small-text">{t('noPayment')}</p>
            {canRetry && (
              <>
                <p role="alert">{t('unavailableSub')}</p>
                <button
                  className="button line"
                  type="button"
                  onClick={retryLookup}
                >
                  {t('retry')}
                </button>
              </>
            )}
            <button
              className="button ink wide"
              disabled={!canRequest}
              onClick={(event) =>
                useTripStore
                  .getState()
                  .openRequest(trips, format, 1, event.currentTarget, !!order)
              }
            >
              {t('requestTrip')}
            </button>
          </div>
        </>
      )}
    </Root>
  );
}
