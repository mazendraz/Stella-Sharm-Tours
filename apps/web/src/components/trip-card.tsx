'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { Trip } from '@stella/shared/public-contract';
import { Media } from './media';
import { Content } from './text';
import { AddButton } from './add-button';
import { estimateTrip } from '@stella/shared/price';
import { money } from '@/lib/links';
export function TripCard({
  trip,
  compact = false,
  privateMode = false,
}: {
  trip: Trip;
  compact?: boolean;
  privateMode?: boolean;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    estimate = estimateTrip(
      trip,
      1,
      0,
      privateMode ? 'private' : trip.format === 'private' ? 'private' : 'group',
    );
  const href =
    '/' + locale + '/t/' + trip.slug + (privateMode ? '?format=private' : '');
  return (
    <article className={'trip-card ' + (compact ? 'compact' : '')}>
      <Link className="trip-image" href={href} prefetch={false}>
        <Media
          media={trip.cover}
          defer
          sizes={
            compact
              ? '(max-width:767px) 200px, 230px'
              : '(max-width:767px) 80vw, 33vw'
          }
        />
        {trip.duration_label && (
          <span className="tag top-tag">
            <Content value={trip.duration_label} />
          </span>
        )}
        {(trip.format === 'private' || privateMode) && (
          <span className="tag private-tag">
            {t(trip.format === 'private' ? 'private' : 'privateOnRequest')}
          </span>
        )}
        <span className="tag price-tag">
          <bdi>
            {estimate.onRequest
              ? t('onRequest')
              : t('from', { price: money(estimate.amount, locale) })}
          </bdi>
        </span>
      </Link>
      <div className="trip-card-copy">
        <div>
          <h3>
            <Link href={href} prefetch={false}>
              <Content value={trip.title} />
            </Link>
          </h3>
          {trip.summary && (
            <p>
              <Content value={trip.summary} />
            </p>
          )}
        </div>
        <AddButton trip={trip} />
      </div>
    </article>
  );
}
