'use client';
import { useEffect, useRef, type ReactNode } from 'react';

// Keep the home-page reveal separate from the dialogs' Radix dependency.
export function Reveal({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      matchMedia('(prefers-reduced-motion:reduce)').matches ||
      !('IntersectionObserver' in window)
    )
      return;
    el.classList.add('reveal-ready');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void import('motion/mini')
            .then(({ animate }) => {
              el.classList.add('revealed');
              if (
                !el.isConnected ||
                matchMedia('(prefers-reduced-motion:reduce)').matches
              )
                return;
              animate(
                el,
                {
                  opacity: [0, 1],
                  transform: ['translateY(30px)', 'translateY(0px)'],
                },
                { duration: 0.85, ease: [0.2, 0.8, 0.2, 1] },
              );
            })
            .catch(() => el.classList.add('revealed'));
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={'reveal ' + className}>
      {children}
    </div>
  );
}
