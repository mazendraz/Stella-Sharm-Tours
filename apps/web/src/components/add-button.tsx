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
        const end = [
          ...document.querySelectorAll<HTMLElement>('[data-mytrip]'),
        ].find((element) => element.getClientRects().length > 0);
        if (!end) return;
        const a = e.currentTarget.getBoundingClientRect(),
          b = end.getBoundingClientRect();
        const dot = document.createElement('span');
        dot.className = 'fly-dot';
        dot.style.setProperty('--fx', a.left + a.width / 2 + 'px');
        dot.style.setProperty('--fy', a.top + a.height / 2 + 'px');
        dot.style.setProperty('--tx', b.left + b.width / 2 + 'px');
        dot.style.setProperty('--ty', b.top + b.height / 2 + 'px');
        document.body.append(dot);
        dot.addEventListener('animationend', () => dot.remove(), {
          once: true,
        });
        setTimeout(() => dot.remove(), 1000);
      }}
      lang={locale}
    >
      {selected ? <Check size={21} /> : <Plus size={22} />}
    </button>
  );
}
