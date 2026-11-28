'use client';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Clock,
  CalendarDays,
  MapPin,
  UsersRound,
  Check,
  Minus,
  Plus,
  Backpack,
  ChevronRight,
} from 'lucide-react';
import type { Trip } from '@stella/shared/public-contract';
import { Content } from './text';
import { Media } from './media';
import { AddButton } from './add-button';
import { useTripStore } from './store';
import { estimateTrip } from '@stella/shared/price';
import { money, track } from '@/lib/links';
import { useCurrency } from './currency';
const TripStory = dynamic(() => import('./trip-story'));
const itemGroups = [
  { type: 'include', Icon: Check },
  { type: 'exclude', Icon: Minus },
  { type: 'optional', Icon: Plus },
  { type: 'bring', Icon: Backpack },
] as const;
export function TripView({
  trip,
  whatsappUrl,
  preview = false,
  requestedPrivate = false,
  previewStory,
}: {
  trip: Trip;
  whatsappUrl: string | null;
  preview?: boolean;
  requestedPrivate?: boolean;
  previewStory?: import('@stella/shared/story').PublicStory | undefined;
}) {
  const currency = useCurrency();
  const locale = useLocale(),
    t = useTranslations();
  const enhanced = useTripStore((s) => s.ready);
  const [slide, setSlide] = useState(0);
  const gallery = trip.gallery.length
    ? trip.gallery
    : trip.cover
      ? [trip.cover]
      : [];
  const privateMode = trip.format === 'private' || requestedPrivate;
  const estimate = estimateTrip(trip, 1, 0, privateMode ? 'private' : 'group');
  const onRequest = estimate.onRequest;
  useEffect(() => {
    track('trip_open', { slug: trip.slug });
  }, [trip.slug]);
  // Lets the floating WhatsApp button name this trip in its message.
  useEffect(() => {
    if (!preview) useTripStore.getState().sync([trip]);
  }, [trip, preview]);
  const facts = [
    { icon: Clock, k: 'duration', value: trip.duration_label },
    {
      icon: CalendarDays,
      k: 'runs',
      value: trip.run_days
        ? {
            text: trip.run_days
              .map((day) =>
                new Intl.DateTimeFormat(locale, {
                  weekday: 'long',
                  timeZone: 'Africa/Cairo',
                }).format(new Date(Date.UTC(1970, 0, 4 + day, 12))),
              )
              .join(' · '),
            lang: locale,
          }
        : trip.days_label,
    },
    {
      icon: MapPin,
      k: 'pickup',
      value: trip.departure_label
        ? { text: trip.departure_label, lang: locale }
        : null,
    },
    {
      icon: Clock,
      k: 'returnTime',
      value: trip.return_label,
    },
    {
      icon: UsersRound,
      k: 'format',
      value: {
        text:
          t(trip.format === 'private' ? 'private' : 'group') +
          (trip.private_on_request ? ' · ' + t('privateOnRequest') : ''),
        lang: locale,
      },
    },
  ];
  return (
    <article className="trip-view">
      <div
        className="gallery"
        // A horizontally scrolling region must be reachable by keyboard so
        // arrow keys can move between photos (WCAG 2.1.1).
        role="region"
        aria-label={t('galleryLabel')}
        tabIndex={0}
        onScroll={(e) =>
          setSlide(
            Math.round(
              e.currentTarget.scrollLeft / e.currentTarget.clientWidth,
            ),
          )
        }
      >
        {gallery.map((media, i) => (
          <div className="gallery-slide" key={i}>
            <Media
              media={media}
              priority={i === 0}
              // Chrome fetches lazy images in a horizontal scroller early, so
              // later slides would compete with the first (LCP) image; they
              // load just after hydration instead (<noscript> fallback kept).
              defer={i > 0}
              sizes="(min-width:1024px) 620px, 100vw"
            />
            {media.video && media.rights_status !== 'unknown' && (
              <video
                controls
                playsInline
                preload="none"
                // The slide's image sits underneath; only the visible slide
                // needs a poster, so off-screen videos do not compete with
                // the first image while the page loads.
                poster={i === slide ? media.url : undefined}
                aria-label={media.alt.text}
              >
                <source
                  src={
                    media.video.horizontal ?? media.video.vertical ?? undefined
                  }
                />
              </video>
            )}
          </div>
        ))}
      </div>
      {gallery.length > 0 && (
        <p className="gallery-counter" aria-live="polite">
          {t('galleryCount', {
            current: Math.abs(slide) + 1,
            total: gallery.length,
          })}
        </p>
      )}
      <div className="trip-body">
        <Link className="kicker" href={'/' + locale + '/c/' + trip.collection}>
          {t('journeys')}
          <ChevronRight size={14} />
        </Link>
        <h1>
          <Content value={trip.title} />
        </h1>
        {trip.summary && (
          <p className="trip-lead">
            <Content value={trip.summary} />
          </p>
        )}
        <div className="facts">
          {facts
            .filter((f) => f.value)
            .map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.k}>
                  <Icon size={19} />
                  <span>
                    <small>{t(f.k)}</small>
                    <strong>
                      <Content value={f.value} />
                    </strong>
                  </span>
                </div>
              );
            })}
        </div>
        <section className="price-block">
          <h2>{t('prices')}</h2>
          {trip.prices.map((p) => (
            <div className="price-row" key={p.id}>
              <span>
                <Content value={p.label} />
              </span>
              <strong>
                <bdi>
                  {p.amount_eur === null
                    ? t('onRequest')
                    : money(p.amount_eur, locale, currency)}
                </bdi>{' '}
                <small>/ {t(p.unit === 'group' ? 'groupUnit' : p.unit)}</small>
              </strong>
            </div>
          ))}
          <p className="small-text">{t('childrenAsk')}</p>
        </section>
        {trip.description && (
          <p className="body-copy">
            <Content value={trip.description} />
          </p>
        )}
        {trip.story_available && (!preview || previewStory) && (
          <TripStory
            previewStory={previewStory}
            key={trip.slug}
            trip={trip}
            privateMode={privateMode}
          />
        )}
        {trip.itinerary.length > 0 && (
          <section>
            <h2>{t('yourDay')}</h2>
            <ol className="timeline">
              {trip.itinerary.map((p, i) => (
                <li key={i}>
                  {p.time && <small>{p.time}</small>}
                  <p>
                    <Content value={p.text} />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
        {trip.parts.length > 0 && (
          <section>
            <h2>{t('theDays')}</h2>
            <div className="package-parts">
              {trip.parts.map((p) => (
                <Link key={p.slug} href={'/' + locale + '/t/' + p.slug}>
                  <span className="part-image">
                    <Media media={p.cover} sizes="64px" />
                  </span>
                  <Content value={p.title} />
                  <ChevronRight size={18} />
                </Link>
              ))}
            </div>
          </section>
        )}
        {trip.items.length > 0 && (
          <div className="items-grid">
            {itemGroups.map(({ type, Icon }) => {
              const items = trip.items.filter((i) => i.type === type);
              return (
                items.length > 0 && (
                  <section
                    className="inclusion-group"
                    data-type={type}
                    key={type}
                  >
                    <h2>{t(type)}</h2>
                    <ul className="inclusions" role="list">
                      {items.map((item, i) => (
                        <li key={i}>
                          <span className="inclusion-icon" aria-hidden="true">
                            <Icon size={15} strokeWidth={2.2} />
                          </span>
                          <Content value={item.text} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              );
            })}
          </div>
        )}
        {trip.notes.length > 0 && (
          <section className="notes">
            <h2>{t('notes')}</h2>
            {trip.notes.map((n, i) => (
              <p key={i}>
                <Content value={n} />
              </p>
            ))}
          </section>
        )}
        <p className="small-text">{t('noPayment')}</p>
        {whatsappUrl && (
          <a className="text-link wa-link" href={whatsappUrl}>
            <WhatsAppIcon size={16} />
            {t('whatsapp')}
          </a>
        )}
      </div>
      <div className="trip-sticky">
        <div>
          <small>{t('estimate')}</small>
          <strong>
            <bdi>
              {onRequest
                ? t('onRequest')
                : t('from', {
                    price: money(estimate.amount, locale, currency),
                  })}
            </bdi>
          </strong>
        </div>
        {!preview && <AddButton trip={trip} />}
        <button
          className="button ink"
          disabled={preview || !enhanced}
          onClick={(event) =>
            useTripStore
              .getState()
              .openRequest(
                [trip],
                privateMode ? 'private' : 'group',
                1,
                event.currentTarget,
              )
          }
        >
          {t('request')}
        </button>
      </div>
    </article>
  );
}
