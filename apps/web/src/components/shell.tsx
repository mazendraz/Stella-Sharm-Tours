'use client';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { TripNavigation } from './tab-bar';
import { recordPanelLink, restorePanelPath } from './panel-history';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Compass,
  House,
  Mail,
  Map,
  MessageCircle,
  Phone,
  X,
} from 'lucide-react';
import { SocialIcon, isMapLink } from './social-icon';
import { useEffect, useState } from 'react';
import type { ReactNode, MouseEvent } from 'react';
import type { Collection } from '@stella/shared/public-contract';
import type { ShellSite } from '@stella/shared/card-trip';

import dynamic from 'next/dynamic';
import { useTripStore } from './store';
import { officeMap, track, whatsapp } from '@/lib/links';
import type { SavedTrip } from '@/lib/saved-trips';
import { Content } from './text';
import { SearchButton } from './search-button';
import { coreLocaleOptions, isCoreLocale } from '@stella/shared';
// In-site page history, so Back returns to the previous Stella page and a
// guest who landed here from a link or search gets a sensible parent page.
const visited: string[] = [];
function trackVisit(path: string) {
  if (visited.at(-1) === path) return;
  if (visited.at(-2) === path) visited.pop();
  else visited.push(path);
}
function parentPath(path: string, locale: string) {
  const home = '/' + locale;
  if (path.startsWith(home + '/c/') || path.startsWith(home + '/t/'))
    return home + '#journeys';
  return home;
}
const RequestSheet = dynamic(() => import('./request-sheet'), { ssr: false });
export function Shell({
  site,
  children,
  collections,
  guides = false,
}: {
  site: ShellSite | null;
  children: ReactNode;
  collections: Collection[];
  guides?: boolean;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    path = usePathname();
  const router = useRouter();
  const isHome = path === '/' + locale || path === '/';
  useEffect(() => {
    trackVisit(path);
  }, [path]);
  function goBack() {
    track('nav_back');
    if (visited.length > 1) router.back();
    else router.push(parentPath(path, locale));
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [router]);
  const enhanced = useTripStore((s) => s.ready);
  const ids = useTripStore((s) => s.ids);
  const attempt = useTripStore((s) => s.lookupAttempt);

  useEffect(() => {
    if (!ids.length) return;
    const ctrl = new AbortController();
    function resolve(results: SavedTrip[]) {
      if (!ctrl.signal.aborted)
        useTripStore
          .getState()
          .resolveLookup({ ids, locale, attempt, results });
    }
    const response = fetch(
      '/api/trips?locale=' +
        encodeURIComponent(locale) +
        '&slugs=' +
        ids.map(encodeURIComponent).join(','),
      { signal: ctrl.signal, cache: 'no-store' },
    );
    Promise.all([response, import('@/lib/saved-trips')])
      .then(async ([r, { savedTripsSchema }]) => {
        if (!r.ok) throw new Error('Saved tours could not be loaded');
        const results = savedTripsSchema.parse(await r.json());
        if (
          results.length !== ids.length ||
          results.some(
            (result, index) =>
              result.slug !== ids[index] ||
              (result.status === 'available' &&
                result.trip.slug !== result.slug),
          )
        )
          throw new Error('Saved tours did not match the lookup');
        resolve(results);
      })
      .catch(() =>
        resolve(ids.map((slug) => ({ slug, status: 'unavailable' }))),
      );
    return () => ctrl.abort();
  }, [ids, locale, attempt]);
  const toast = useTripStore((s) => s.toast);
  const request = useTripStore((s) => s.request);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(scrollY > 100);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  const [notice, setNotice] = useState(true),
    [search, setSearch] = useState('');
  const auto = !isCoreLocale(locale);
  const languageOptions = [
    ...coreLocaleOptions,
    ...(site?.locales.filter((l) => !isCoreLocale(l.code)) ?? []),
  ];
  const wa = whatsapp(site?.contacts.whatsapp_primary ?? null);
  useEffect(() => {
    useTripStore.getState().hydrate();
    try {
      setNotice(localStorage.getItem('stella.auto-notice') !== 'dismissed');
    } catch {}
  }, []);
  useEffect(() => {
    window.addEventListener('popstate', restorePanelPath, true);
    return () => window.removeEventListener('popstate', restorePanelPath, true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => useTripStore.setState({ toast: null }),
      2800,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  const capture = (e: MouseEvent) => {
    const element = e.target as Element;
    const link = element.closest<HTMLAnchorElement>('a[href]');
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey)
      recordPanelLink(link);
    const target = element.closest('[data-collection-link]');
    if (!target) return;
    const r = target.getBoundingClientRect();
    useTripStore.setState({
      clip: {
        top: Math.max(0, r.top),
        left: Math.max(0, r.left),
        bottom: Math.max(0, innerHeight - r.bottom),
        right: Math.max(0, innerWidth - r.right),
      },
    });
  };
  const items = [
    { key: 'home', href: '', icon: House },
    { key: 'journeys', href: '#journeys', icon: Compass },
    { key: 'myTrip', href: '/my-trip', icon: Map },
    { key: 'contact', href: '/contact', icon: MessageCircle },
  ] as const;
  return (
    <>
      <>
        <div onClickCapture={capture} data-enhanced={enhanced}>
          <a className="skip-link" href="#main">
            {t('skip')}
          </a>
          <header
            className={
              'nav ' +
              (path === '/' + locale &&
              !!site &&
              (site.has_hero || collections.length > 0)
                ? 'over-hero' + (scrolled ? ' scrolled' : '')
                : '')
            }
          >
            <div className="nav-start">
              {!isHome && (
                <button
                  type="button"
                  className="nav-back"
                  aria-label={t('back')}
                  onClick={goBack}
                >
                  <ArrowLeft
                    size={21}
                    className="flip-rtl"
                    aria-hidden="true"
                  />
                </button>
              )}
              <Link
                href={'/' + locale}
                className="wordmark"
                aria-label={t('brand')}
              >
                <span className="brand-mark" aria-hidden="true" />
                <span className="brand-word" aria-hidden="true" />
              </Link>
            </div>
            <nav className="desktop-nav" aria-label={t('journeys')}>
              {items.map((i) => (
                <Link
                  key={i.key}
                  href={'/' + locale + i.href}
                  data-mytrip={i.key === 'myTrip' ? 'true' : undefined}
                >
                  {t(i.key)}
                </Link>
              ))}
            </nav>
            <div className="nav-tools">
              <SearchButton collections={collections} whatsappUrl={wa} />
              <details className="languages">
                <summary
                  aria-label={
                    t('language') + ' ' + locale.toLocaleUpperCase(locale)
                  }
                >
                  {locale.toLocaleUpperCase(locale)}{' '}
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="language-list">
                  <label className="sr-only" htmlFor="language-search">
                    {t('searchLanguages')}
                  </label>
                  {languageOptions.length > 8 && (
                    <input
                      id="language-search"
                      placeholder={t('searchLanguages')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  )}
                  <nav
                    aria-label={
                      t('language') + ' ' + locale.toLocaleUpperCase(locale)
                    }
                  >
                    {languageOptions
                      .filter((l) =>
                        l.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((l) => (
                        <a
                          key={l.code}
                          href={path.replace(/^\/[^/]+/, '/' + l.code)}
                          hrefLang={l.code}
                          lang={l.code}
                          aria-current={locale === l.code ? 'page' : undefined}
                          onClick={() => {
                            document.cookie =
                              'NEXT_LOCALE=' +
                              l.code +
                              '; Path=/; SameSite=Lax; Max-Age=31536000' +
                              (location.protocol === 'https:'
                                ? '; Secure'
                                : '');
                            track('lang_change', {
                              from: locale,
                              to: l.code,
                              auto: l.auto,
                            });
                          }}
                        >
                          {l.name}
                          {l.auto && <small>auto</small>}
                        </a>
                      ))}
                  </nav>
                </div>
              </details>
              {wa && (
                <a
                  className="button small wa desktop-wa"
                  href={wa}
                  onClick={() => track('whatsapp_click')}
                >
                  <WhatsAppIcon size={18} />
                  {t('whatsapp')}
                </a>
              )}
            </div>
          </header>
          {auto && notice && (
            <aside className="auto-notice">
              <span>
                {t('autoNotice')}{' '}
                <Link
                  href={path.replace(/^\/[^/]+/, '/en')}
                  onClick={() => track('auto_notice_read_en')}
                >
                  {t('readEnglish')}
                </Link>
              </span>
              <button
                className="icon-button"
                aria-label={t('dismiss')}
                onClick={() => {
                  setNotice(false);
                  try {
                    localStorage.setItem('stella.auto-notice', 'dismissed');
                  } catch {}
                }}
              >
                <X size={18} />
              </button>
            </aside>
          )}
          {children}
          <footer className="footer wrap">
            <div className="footer-brand-block">
              <Link className="footer-brand" href={'/' + locale}>
                <img
                  src="/brand/logo.webp"
                  alt={t('brand')}
                  width={415}
                  height={360}
                  loading="lazy"
                />
              </Link>
              {site?.address && (
                <Link
                  className="footer-address"
                  href={'/' + locale + '/contact'}
                >
                  <Content value={site.address} />
                </Link>
              )}
              {!!site?.social.length && (
                <ul className="footer-social" aria-label={t('followUs')}>
                  {site.social
                    .filter((s) => /^https:\/\//.test(s.url))
                    .map((s) => (
                      <li key={s.url}>
                        <a
                          href={isMapLink(s.label) ? officeMap.url : s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={s.label}
                          title={s.label}
                        >
                          <SocialIcon label={s.label} size={20} />
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <nav
              className="footer-collections"
              aria-labelledby="footer-journeys"
            >
              <h2 className="footer-heading" id="footer-journeys">
                {t('journeys')}
              </h2>
              {collections.map((c) => (
                <Link key={c.slug} href={'/' + locale + '/c/' + c.slug}>
                  <Content value={c.name} />
                </Link>
              ))}
            </nav>
            <nav className="footer-help" aria-labelledby="footer-contact">
              <h2 className="footer-heading" id="footer-contact">
                {t('contact')}
              </h2>
              {wa && (
                <a
                  className="wa-link"
                  href={wa}
                  onClick={() => track('whatsapp_click')}
                >
                  <WhatsAppIcon size={17} />
                  {t('whatsapp')}
                </a>
              )}
              {site?.contacts.phone && (
                <a href={'tel:' + site.contacts.phone.replace(/[^\d+]/g, '')}>
                  <Phone size={17} aria-hidden="true" />
                  {t('contactCall')}
                </a>
              )}
              {site?.contacts.email && (
                <a href={'mailto:' + site.contacts.email}>
                  <Mail size={17} aria-hidden="true" />
                  {t('contactEmail')}
                </a>
              )}
              <Link href={'/' + locale + '/faq'}>{t('faq')}</Link>
              {guides && (
                <Link href={'/' + locale + '/guides'}>{t('guides')}</Link>
              )}
            </nav>
            <div className="footer-bottom">
              <p className="small-text">{t('noPayment')}</p>
              <div className="footer-legal">
                {(['terms', 'privacy', 'cancellation'] as const).map((k) => (
                  <Link key={k} href={'/' + locale + '/legal/' + k}>
                    {t(k)}
                  </Link>
                ))}
              </div>
              {site?.legal_entity && (
                <p className="footer-legal-entity">
                  © <Content value={site.legal_entity} />
                </p>
              )}
            </div>
          </footer>
          <TripNavigation />
          {request && <RequestSheet site={site} />}
        </div>
      </>
    </>
  );
}
