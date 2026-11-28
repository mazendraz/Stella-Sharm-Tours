'use client';
import { BuilderLink } from './home-widgets';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import type { CollectionDetail } from '@stella/shared/public-contract';
import { Media } from './media';
import { Content } from './text';
import { TripCard } from './trip-card';
import { money, track } from '@/lib/links';
import { useTripStore } from './store';
import { estimateTrip } from '@stella/shared/price';
import { useCurrency } from './currency';
type Group = Pick<
  CollectionDetail['collection'],
  'slug' | 'name' | 'short_name' | 'color'
>;
export function CollectionView({
  data,
  preview = false,
}: {
  data: CollectionDetail & { groups?: Group[] };
  preview?: boolean;
}) {
  const currency = useCurrency();
  const { collection: c, trips, combo } = data,
    t = useTranslations(),
    locale = useLocale();
  const hero = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // Lets the floating WhatsApp button name this collection in its message.
  useEffect(() => {
    if (!preview) useTripStore.getState().nameCollection(c.slug, c.name);
  }, [c.slug, c.name, preview]);
  useEffect(() => {
    const node = hero.current;
    const scroller = node?.closest('.panel-scroll');
    const target = scroller ?? window;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!node || matchMedia('(prefers-reduced-motion:reduce)').matches)
          return;
        const img = node.querySelector('img');
        const y =
          scroller?.scrollTop ?? Math.max(0, -node.getBoundingClientRect().top);
        if (img)
          img.style.transform = 'translateY(' + Math.min(y * 0.4, 200) + 'px)';
      });
    };
    target.addEventListener('scroll', update, { passive: true });
    return () => {
      target.removeEventListener('scroll', update);
      cancelAnimationFrame(raf);
    };
  }, []);
  const [mode, setMode] = useState<'group' | 'private'>('group'),
    [filter, setFilter] = useState('all');
  const privateMode = mode === 'private' || c.kind === 'private_virtual';
  useEffect(() => {
    track('collection_open', { slug: c.slug });
    useTripStore.getState().sync(trips);
  }, [trips, c.slug]);
  const shown = trips
    .filter(
      (tr) =>
        (privateMode || c.kind === 'packages' || tr.format !== 'private') &&
        (filter === 'all' ||
          (filter === 'family' && tr.family_friendly) ||
          (filter === 'short' &&
            tr.duration_minutes !== null &&
            tr.duration_minutes <= 300) ||
          (filter === 'plane' && tr.flight)),
    )
    .sort((a, b) =>
      privateMode
        ? Number(b.format === 'private') - Number(a.format === 'private')
        : 0,
    );
  // "All of Egypt": every trip, one section per collection, with chips to
  // narrow it to one collection.
  const sections =
    c.kind === 'packages' && data.groups?.length
      ? data.groups.flatMap((g) => {
          const list = trips.filter((tr) => tr.collection === g.slug);
          return list.length
            ? [
                {
                  ...g,
                  title: g.slug === c.slug ? c.short_name : g.name,
                  label: g.slug === c.slug ? c.short_name : g.short_name,
                  trips: list,
                },
              ]
            : [];
        })
      : null;
  const visibleSections = sections?.filter(
    (g) => filter === 'all' || filter === 'g:' + g.slug,
  );
  return (
    <article
      data-collection-ready={ready}
      className="collection-view"
      style={{ '--collection': c.color } as React.CSSProperties}
    >
      <div className="collection-hero" ref={hero}>
        <Media media={c.cover} priority sizes="100vw" />
        <div className="photo-shade" />
        <div className="wrap">
          <p className="kicker">
            <Content value={c.short_name} />
          </p>
          <h1>
            <Content value={c.name} />
          </h1>
          <p>
            <Content value={c.subline} />
          </p>
        </div>
      </div>
      <div className="wrap">
        <div className="stats">
          <div>
            <b>{c.trip_count}</b>
            <span>{t('journeys')}</span>
          </div>
          <div>
            <b>{c.max_days}</b>
            <span>{t('duration')}</span>
          </div>
          <div>
            <b>
              <bdi>
                {c.min_price_eur === null
                  ? t('onRequest')
                  : money(c.min_price_eur, locale, currency)}
              </bdi>
            </b>
            <span>{t('prices')}</span>
          </div>
        </div>
        {c.kind === 'normal' && (
          <div className="collection-toolbar">
            <div className="segmented" role="group" aria-label={t('format')}>
              {(['group', 'private'] as const).map((m) => (
                <button
                  key={m}
                  className={
                    mode === m
                      ? 'active ' + (m === 'private' ? 'navy' : '')
                      : ''
                  }
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setFilter('all');
                    if (m === 'private')
                      track('private_mode_on', { slug: c.slug });
                  }}
                >
                  {t(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        {privateMode && (
          <div className="private-banner">
            <h2>{t('makePrivate')}</h2>
            <p>{t('privateIntro')}</p>
            <Link
              className="text-link"
              href={'/' + locale + '/contact'}
              onClick={() => track('private_quote_click')}
            >
              {t('privateQuote')}
              <ArrowUpRight size={18} />
            </Link>
          </div>
        )}
        {c.kind !== 'packages' && (
          <div className="filter-row" role="group" aria-label={t('journeys')}>
            {[
              'all',
              'family',
              'short',
              ...(c.slug === 'history' ? ['plane'] : []),
            ].map((f) => (
              <button
                className={'chip ' + (filter === f ? 'active' : '')}
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {t(f)}
              </button>
            ))}
          </div>
        )}
        {sections && visibleSections ? (
          <>
            <div className="filter-row" role="group" aria-label={t('journeys')}>
              {[
                { key: 'all', label: t('all') },
                ...sections.map((g) => ({
                  key: 'g:' + g.slug,
                  label: g.label.text,
                  count: g.trips.length,
                })),
              ].map((f) => (
                <button
                  className={'chip ' + (filter === f.key ? 'active' : '')}
                  key={f.key}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  {'count' in f && (
                    <span className="chip-count">{f.count}</span>
                  )}
                </button>
              ))}
            </div>
            {visibleSections.map((g) => (
              <section
                key={g.slug}
                className="all-group"
                aria-labelledby={'group-' + g.slug}
                style={{ '--group': g.color } as React.CSSProperties}
              >
                <h2 id={'group-' + g.slug}>
                  <span className="all-group-dot" aria-hidden="true" />
                  <Content value={g.title} />
                  <small>{g.trips.length}</small>
                </h2>
                <div className="trip-grid">
                  {g.trips.map((trip) => (
                    <TripCard key={trip.slug} trip={trip} privateMode={false} />
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <>
            {/* Trip cards use <h3>; keep the outline h1 → h2 → h3. */}
            <h2 className="sr-only">{t('journeys')}</h2>
            <div className="trip-grid">
              {shown.map((trip) => (
                <TripCard
                  key={trip.slug}
                  trip={trip}
                  privateMode={privateMode}
                />
              ))}
            </div>
          </>
        )}
        {!shown.length && c.kind !== 'packages' && (
          <div className="empty-filter">
            <p>{t('emptyFilter')}</p>
            <button className="button ink" onClick={() => setFilter('all')}>
              {t('showAll')}
            </button>
          </div>
        )}
        {combo && (
          <section className="combo-card">
            <p className="kicker">{t('together')}</p>
            <h2>
              <Content value={combo.title} />
            </h2>
            <p>
              <Content value={combo.summary} />
              <strong className="combo-price">
                <bdi>
                  {estimateTrip(combo, 1).onRequest
                    ? t('onRequest')
                    : money(estimateTrip(combo, 1).amount, locale, currency)}
                </bdi>
              </strong>
            </p>
            <div className="combo-parts">
              {combo.parts.map((p) => (
                <Link key={p.slug} href={'/' + locale + '/t/' + p.slug}>
                  <Content value={p.title} />
                </Link>
              ))}
            </div>
            <button
              className="button gold"
              disabled={preview}
              onClick={() =>
                useTripStore
                  .getState()
                  .addMany(
                    trips.filter((tr) =>
                      combo.parts.some((p) => p.slug === tr.slug),
                    ),
                  )
              }
            >
              {t('addAll', { count: combo.parts.length })}
            </button>
          </section>
        )}
        {c.kind === 'packages' && (
          <section className="build-block section">
            <h2>{t('build')}</h2>
            <p>{t('buildSub')}</p>
            <BuilderLink>{t('startBuilding')}</BuilderLink>
          </section>
        )}
      </div>
    </article>
  );
}
