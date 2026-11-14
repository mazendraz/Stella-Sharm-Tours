'use client';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function StackMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cards = Array.from(
      root.current?.querySelectorAll<HTMLElement>('.collection-card') ?? [],
    );
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const reduce =
          matchMedia('(prefers-reduced-motion:reduce)').matches ||
          innerWidth >= 1024;
        cards.forEach((card, i) => {
          const next = cards[i + 1];
          const progress =
            reduce || !next
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    1,
                    1 -
                      (next.getBoundingClientRect().top -
                        card.getBoundingClientRect().top) /
                        430,
                  ),
                );
          card.style.transform = 'scale(' + (1 - progress * 0.07) + ')';
          card.style.setProperty('--dim', String(progress * 0.45));
        });
      });
    };
    // Desktop row: open a card after the pointer rests on it briefly. The
    // open card stays open until another one is chosen, so moving across the
    // gaps or a resizing neighbour doesn't make the row flicker.
    let intent = 0;
    const open = (card: HTMLElement) =>
      cards.forEach((c) => c.classList.toggle('expanded', c === card));
    const enter = (e: Event) => {
      if (innerWidth < 1024) return;
      clearTimeout(intent);
      const card = e.currentTarget as HTMLElement;
      intent = window.setTimeout(() => open(card), 110);
    };
    const focus = (e: Event) => {
      if (innerWidth >= 1024) open(e.currentTarget as HTMLElement);
    };
    const cancel = () => clearTimeout(intent);
    cards.forEach((c) => {
      c.addEventListener('pointerenter', enter);
      c.addEventListener('focus', focus);
    });
    root.current?.addEventListener('pointerleave', cancel);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    const el = root.current;
    return () => {
      cards.forEach((c) => {
        c.removeEventListener('pointerenter', enter);
        c.removeEventListener('focus', focus);
      });
      el?.removeEventListener('pointerleave', cancel);
      clearTimeout(intent);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={root}>{children}</div>;
}
