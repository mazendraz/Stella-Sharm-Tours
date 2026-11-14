'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Trash2, ArrowUpRight, Sun, Plus } from 'lucide-react';
import { z } from 'zod';
import { tripSchema } from '@stella/shared/public-contract';
import { planDays } from '@stella/shared/days';
import { estimateTrips } from '@stella/shared/price';
import { useTripStore } from './store';
import { Content } from './text';
import { Media } from './media';
import { money } from '@/lib/links';
export function MyTrip({ overlay = false }: { overlay?: boolean }) {
  const Root = overlay ? 'div' : 'main';
  const t = useTranslations(),
    locale = useLocale(),
    ids = useTripStore((s) => s.ids),
    cache = useTripStore((s) => s.cache),
    ready = useTripStore((s) => s.ready),
    rest = useTripStore((s) => s.rest);
  const [error, setError] = useState(false),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!ids.length || !ready) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    fetch(
      '/api/trips?locale=' +
        encodeURIComponent(locale) +
        '&slugs=' +
        ids.map(encodeURIComponent).join(','),
      { signal: ctrl.signal, cache: 'no-store' },
    )
      .then((r) => {
        if (!r.ok) throw new Error('catalog');
        return r.json();
      })
      .then((data) =>
        useTripStore.getState().sync(z.array(tripSchema).parse(data)),
      )
      .catch((e) => {
        if (e.name !== 'AbortError') setError(true);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [ids, locale, ready]);
  const trips = ids
      .map((id) => cache[id])
      .filter((t): t is NonNullable<typeof t> => !!t),
    rows = planDays(trips, rest),
    // Guests and dates are chosen in the request form; here we show the price
    // for one adult.
    estimate = estimateTrips(trips, 1),
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
  return (
    <Root className="wrap builder" id={overlay ? undefined : 'main'}>
      <p className="kicker">{t('myTrip')}</p>
      <h1>{t(ids.length ? 'build' : 'emptyTrip')}</h1>
      {!ids.length ? (
        <>
          <p>{t('emptyTripSub')}</p>
          <Link className="button ink" href={'/' + locale + '#journeys'}>
            {t('journeys')}
            <ArrowUpRight size={18} />
          </Link>
        </>
      ) : (
        <>
          {!ready || (loading && trips.length === 0) ? (
            <div className="skeleton" aria-busy="true" />
          ) : (
            <>
              <div className="mix-bar" aria-hidden="true">
                {Object.entries(counts).map(([c, n]) => (
                  <span
                    key={c}
                    style={{ flex: n, background: colors[c] ?? 'var(--ink)' }}
                  />
                ))}
              </div>
              <div className="day-list">
                {rows.map((row) => (
                  <article
                    className={'day-card ' + (!row.trip ? 'rest-day' : '')}
                    key={row.day}
                  >
                    <span className="day-label">
                      {t('day', { day: row.day })}
                    </span>
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
                          onClick={() =>
                            useTripStore.getState().toggle(row.trip!)
                          }
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
                <div className="estimate">
                  <span>{t('estimatePerPerson')}</span>
                  <strong>
                    <bdi>
                      {estimate.amount > 0
                        ? money(estimate.amount, locale)
                        : estimate.onRequest
                          ? ''
                          : money(0, locale)}
                    </bdi>
                    {estimate.onRequest && (
                      <small>
                        {estimate.amount > 0
                          ? t('plusRequest')
                          : t('onRequest')}
                      </small>
                    )}
                  </strong>
                </div>
                <p className="small-text">{t('noPayment')}</p>
                {error && <p role="alert">{t('unavailableSub')}</p>}
                <button
                  className="button ink wide"
                  disabled={loading || error || trips.length !== ids.length}
                  onClick={(event) =>
                    useTripStore
                      .getState()
                      .openRequest(trips, 'group', 1, event.currentTarget)
                  }
                >
                  {t('requestTrip')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Root>
  );
}
