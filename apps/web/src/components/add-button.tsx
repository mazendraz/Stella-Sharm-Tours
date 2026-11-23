'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Check } from 'lucide-react';
import type { Trip } from '@stella/shared/public-contract';
import { useTripStore } from './store';
import { useEffect } from 'react';
export function AddButton({ trip }: { trip: Trip }) {
  const t = useTranslations(),
    locale = useLocale();
  const selected = useTripStore((s) => s.ids.includes(trip.slug));
  useEffect(() => useTripStore.getState().sync([trip]), [trip]);
  return (
    <button
      type="button"
      className={'add-button ' + (selected ? 'selected' : '')}
      aria-label={t(selected ? 'remove' : 'add') + ' · ' + trip.title.text}
      aria-pressed={selected}
      onClick={(e) => {
        useTripStore.getState().toggle(trip);
        if (selected || matchMedia('(prefers-reduced-motion:reduce)').matches)
          return;
        const scope = e.currentTarget.closest('.panel-with-footer') ?? document;
        const start = e.currentTarget.getBoundingClientRect();
        requestAnimationFrame(() => {
          const end = Array.from(
            scope.querySelectorAll<HTMLElement>('[data-mytrip]'),
          ).find((element) => element.getClientRects().length > 0);
          if (!end) return;
          const target = end.getBoundingClientRect();
          const dot = document.createElement('span');
          dot.className = 'fly-dot';
          dot.style.setProperty('--fx', start.left + start.width / 2 + 'px');
          dot.style.setProperty('--fy', start.top + start.height / 2 + 'px');
          dot.style.setProperty('--tx', target.left + target.width / 2 + 'px');
          dot.style.setProperty('--ty', target.top + target.height / 2 + 'px');
          document.body.append(dot);
          dot.addEventListener('animationend', () => dot.remove(), {
            once: true,
          });
          setTimeout(() => dot.remove(), 1000);
        });
      }}
      lang={locale}
    >
      {selected ? <Check size={21} /> : <Plus size={22} />}
    </button>
  );
}
