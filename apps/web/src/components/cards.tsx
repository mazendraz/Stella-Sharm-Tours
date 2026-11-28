import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';
import type { Collection } from '@stella/shared/public-contract';
import { Media } from './media';
import { Content } from './text';
import { money } from '@/lib/links';
export { TripCard } from './trip-card';
import { StackMotion } from './stack-motion';
import { getCurrency } from '@/lib/currency';
export async function CollectionCards({
  collections,
}: {
  collections: Collection[];
}) {
  const currency = await getCurrency();
  const locale = await getLocale(),
    t = await getTranslations();
  return (
    <StackMotion>
      <div className="collection-stack">
        {collections.map((c, i) => (
          <Link
            key={c.slug}
            className={'collection-card ' + (i === 0 ? 'expanded' : '')}
            data-collection-link="true"
            href={'/' + locale + '/c/' + c.slug}
            style={
              { '--index': i, '--collection': c.color } as React.CSSProperties
            }
          >
            <Media
              media={c.cover}
              defer
              sizes="(max-width: 767px) 100vw, 70vw"
            />
            <div className="photo-shade" />
            <div className="collection-copy">
              <span className="kicker">
                <i style={{ background: c.color }} />
                <Content value={c.short_name} />
              </span>
              <h3>
                <Content value={c.name} />
              </h3>
              <div className="collection-more">
                <p>
                  <Content value={c.subline} />
                </p>
                <span className="collection-meta">
                  {t('tripCount', { count: c.trip_count })}
                  {c.min_price_eur !== null && (
                    <>
                      {' '}
                      ·{' '}
                      <bdi>
                        {t('from', {
                          price: money(c.min_price_eur, locale, currency),
                        })}
                      </bdi>
                    </>
                  )}
                </span>
                <span className="mini-photos">
                  {c.previews.slice(0, 3).map((m, j) => (
                    <span key={j}>
                      <Media media={m} defer sizes="40px" />
                    </span>
                  ))}
                </span>
              </div>
              <span className="collection-arrow">
                <ArrowUpRight size={25} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </StackMotion>
  );
}
