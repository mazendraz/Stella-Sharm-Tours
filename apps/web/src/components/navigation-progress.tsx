'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

// Shown only when a page change is genuinely slow; fast navigations never
// flash a bar. No percentages: the bar only says "working on it".
const SHOW_AFTER_MS = 150;
const SLOW_AFTER_MS = 8000;
const GIVE_UP_MS = 30000;

type State = 'idle' | 'pending' | 'slow';

/**
 * Thin progress bar at the top of the page while a client-side navigation
 * loads, plus a slow-connection notice with a retry. It renders nothing on
 * the server, never covers content and never blocks interaction, so server
 * HTML, crawlers and no-JavaScript visitors are unaffected.
 */
export function NavigationProgress() {
  const pathname = usePathname(),
    t = useTranslations(),
    [state, setState] = useState<State>('idle'),
    target = useRef<string | null>(null),
    current = useRef(pathname),
    timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  // The new route rendered: stop.
  useEffect(() => {
    current.current = pathname;
    clear();
    target.current = null;
    setState('idle');
  }, [pathname]);
  useEffect(() => {
    const start = (href: string) => {
      clear();
      target.current = href;
      timers.current = [
        window.setTimeout(() => setState('pending'), SHOW_AFTER_MS),
        window.setTimeout(() => setState('slow'), SLOW_AFTER_MS),
        // Never spin forever: if nothing happened, quietly give up.
        window.setTimeout(() => {
          target.current = null;
          setState('idle');
        }, GIVE_UP_MS),
      ];
    };
    // Capture phase: runs before Next's Link handler prevents the default.
    const onClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (
        (link.target && link.target !== '_self') ||
        link.hasAttribute('download')
      )
        return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname === current.current ||
        url.pathname.startsWith('/api/') ||
        /\.[a-z0-9]+$/i.test(url.pathname)
      )
        return;
      start(url.href);
    };
    // Back/forward to another page; in-page history entries (search panel,
    // story viewer) keep the same path and are ignored.
    const onPop = () => {
      if (window.location.pathname !== current.current)
        start(window.location.href);
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      clear();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  return (
    <>
      <div className={'nav-progress ' + state} aria-hidden="true">
        <span />
      </div>
      {state === 'slow' && (
        <div className="nav-slow" role="status">
          <span>{t('navSlow')}</span>
          <button
            type="button"
            className="nav-slow-retry"
            onClick={() => {
              // A plain page load of the same address (a safe GET).
              if (target.current) window.location.assign(target.current);
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
    </>
  );
}
