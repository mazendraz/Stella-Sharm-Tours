'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';

import type { Collection } from '@stella/shared/public-contract';
import { planDays } from '@stella/shared/days';
import { useTripStore } from './store';
import { track } from '@/lib/links';
import { Content } from './text';
import type { ReactNode } from 'react';
export function BuilderLink({
  children,
  className = 'button gold',
}: {
  children: ReactNode;
  className?: string;
}) {
  const locale = useLocale();
  return (
    <Link className={className} href={'/' + locale + '/my-trip'}>
      {children}
    </Link>
  );
}
export function BuildWidget({ collections }: { collections: Collection[] }) {
  const t = useTranslations(),
    ids = useTripStore((s) => s.ids),
    order = useTripStore((s) => s.order),
    cache = useTripStore((s) => s.cache),
    rest = useTripStore((s) => s.rest);
  const trips = (order ?? ids)
    .map((id) => cache[id])
    .filter((trip): trip is NonNullable<typeof trip> => !!trip);
  return (
    <>
      <div className="build-counts">
        {collections
          .filter((c) => c.kind === 'normal')
          .map((c) => (
            <div key={c.slug}>
              <span style={{ background: c.color }} />
              <strong>
                {trips.filter((tr) => tr.collection === c.slug).length}
              </strong>
              <Content value={c.short_name} />
            </div>
          ))}
      </div>
      <div className="build-preview">
        {planDays(trips, rest, !!order)
          .slice(0, 4)
          .map((row) => (
            <div key={row.day}>
              <small>{t('day', { day: row.day })}</small>
              <span>
                {row.trip ? <Content value={row.trip.title} /> : t('beachDay')}
              </span>
            </div>
          ))}
      </div>
      <BuilderLink>
        {ids.length
          ? t('openMyTrip', { count: ids.length })
          : t('startBuilding')}
        <span style={{ display: 'inline-flex' }}>
          <ArrowUpRight size={19} />
        </span>
      </BuilderLink>
    </>
  );
}
export function PrivateTracker() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        track('private_section_view');
        io.disconnect();
      }
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} />;
}
