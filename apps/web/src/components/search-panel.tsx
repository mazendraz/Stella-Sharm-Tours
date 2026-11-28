'use client';
/**
 * Header search panel (loaded on demand by SearchButton): a full-screen
 * (mobile) or centered (desktop) dialog. Before typing it shows collection chips and
 * the admin's suggested trips; while typing, results update on every key
 * from an index downloaded on first use (see lib/search-client.ts).
 * The query never leaves the browser.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Search as SearchIcon, X, ArrowLeft } from 'lucide-react';
import type { Collection } from '@stella/shared/public-contract';
import type { SearchEntry } from '@stella/shared/search';
import { loadSearch, type Search } from '@/lib/search-client';
import { money, track } from '@/lib/links';
import { Media } from './media';
import { Content } from './text';
import { useCurrency } from './currency';
import { WhatsAppIcon } from './whatsapp-icon';
import './search-panel.css';

const hrefOf = (locale: string, e: SearchEntry) =>
  '/' + locale + (e.type === 'collection' ? '/c/' : '/t/') + e.slug;

export default function SearchPanel({
  collections,
  whatsappUrl,
  onClosed,
}: {
  collections: Collection[];
  whatsappUrl: string | null;
  onClosed: () => void;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    currency = useCurrency(),
    router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    next = useRef<string | null>(null),
    id = useId();
  const [query, setQuery] = useState(''),
    [engine, setEngine] = useState<Search | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [active, setActive] = useState(-1);

  // Load (or reuse) the index; Retry bumps `attempt`.
  useEffect(() => {
    let live = true;
    setFailed(false);
    loadSearch(locale)
      .then((s) => live && setEngine(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [locale, attempt]);

  // Open as a modal with its own history entry, so Back closes it.
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    input.current?.focus();
    const marker =
      Date.now().toString(36) + Math.random().toString(36).slice(2);
    history.pushState({ ...history.state, stellaSearch: marker }, '');
    const root = document.documentElement,
      overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const back = () => onClosed();
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('popstate', back);
      root.style.overflow = overflow;
      d.close();
      const go = () => {
        if (next.current) router.push(next.current);
      };
      if (history.state?.stellaSearch === marker) {
        window.addEventListener('popstate', go, { once: true });
        history.back();
      } else go();
    };
    // Runs once per opening; onClosed/router are stable for its lifetime.
  }, []);

  const trimmed = query.trim();
  const results = useMemo(
    () => (engine && trimmed ? engine.search(trimmed) : []),
    [engine, trimmed],
  );
  const suggested = engine?.suggested ?? [];
  // With no match, the suggestions stay below the empty message.
  const options = trimmed && results.length ? results : suggested;
  useEffect(() => setActive(-1), [trimmed]);

  // Report an empty result once the visitor pauses — never the query text.
  useEffect(() => {
    if (!engine || !trimmed || results.length) return;
    const timer = setTimeout(() => track('search_no_results'), 800);
    return () => clearTimeout(timer);
  }, [engine, trimmed, results.length]);

  const select = (entry: SearchEntry, position: number) => {
    track('search_select', { type: entry.type, slug: entry.slug, position });
    next.current = hrefOf(locale, entry);
    onClosed();
  };
  const onOption = (
    e: MouseEvent<HTMLAnchorElement>,
    entry: SearchEntry,
    position: number,
  ) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    e.preventDefault();
    select(entry, position);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!options.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => {
        const n = options.length,
          to = i < 0 ? (step > 0 ? 0 : n - 1) : (i + step + n) % n;
        document
          .getElementById(optionId(to))
          ?.scrollIntoView({ block: 'nearest' });
        return to;
      });
    } else if (e.key === 'Enter' && active >= 0 && options[active]) {
      e.preventDefault();
      select(options[active]!, active);
    }
  };

  const listId = id + '-list',
    optionId = (i: number) => id + '-option-' + i;
  const price = (e: SearchEntry) =>
    e.type === 'collection'
      ? null
      : e.from_price_eur === null
        ? t('onRequest')
        : t('from', { price: money(e.from_price_eur, locale, currency) });

  return (
    <dialog
      ref={dialog}
      className="search-panel"
      aria-label={t('search')}
      onCancel={(e) => {
        e.preventDefault();
        onClosed();
      }}
      onClick={(e) => {
        // A click on the backdrop (outside the panel box) closes it.
        if (e.target === e.currentTarget) onClosed();
      }}
    >
      <div className="search-bar">
        <button
          type="button"
          className="icon-button search-back"
          aria-label={t('searchClose')}
          onClick={onClosed}
        >
          <ArrowLeft size={20} className="flip-rtl" aria-hidden="true" />
        </button>
        <label className="search-field">
          <SearchIcon size={18} aria-hidden="true" />
          <span className="sr-only">{t('search')}</span>
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          />
        </label>
        {query && (
          <button
            type="button"
            className="icon-button search-clear"
            aria-label={t('searchClear')}
            onClick={() => {
              setQuery('');
              input.current?.focus();
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="search-body">
        <p className="sr-only" aria-live="polite">
          {engine && trimmed
            ? t('searchResults', { count: results.length })
            : ''}
        </p>
        {!trimmed && collections.length > 0 && (
          <section className="search-section">
            <h2>{t('searchCollections')}</h2>
            <div className="search-chips">
              {collections.map((c) => (
                <Link
                  key={c.slug}
                  className="chip"
                  href={'/' + locale + '/c/' + c.slug}
                  prefetch={false}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
                      return;
                    e.preventDefault();
                    next.current = '/' + locale + '/c/' + c.slug;
                    onClosed();
                  }}
                >
                  <Content value={c.short_name} />
                </Link>
              ))}
            </div>
          </section>
        )}
        {failed ? (
          <div className="search-state" role="alert">
            <p>{t('searchLoadFailed')}</p>
            <button
              type="button"
              className="button ink small"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {t('retry')}
            </button>
          </div>
        ) : !engine ? (
          <ul className="search-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="search-skeleton" />
            ))}
          </ul>
        ) : (
          <section className="search-section">
            {trimmed && !results.length ? (
              <div className="search-state">
                <p>{t('searchNoResults', { query: trimmed })}</p>
                {whatsappUrl && (
                  <a
                    className="button wa small"
                    href={whatsappUrl}
                    onClick={() => track('whatsapp_click')}
                  >
                    <WhatsAppIcon size={18} />
                    {t('searchAskWhatsapp')}
                  </a>
                )}
              </div>
            ) : null}
            {(!trimmed || !results.length) && suggested.length > 0 && (
              <h2 id={id + '-suggested'}>{t('searchSuggested')}</h2>
            )}
            <ul
              id={listId}
              role="listbox"
              className="search-list"
              aria-label={
                trimmed && results.length ? t('search') : t('searchSuggested')
              }
            >
              {options.map((e, i) => (
                <li key={e.type + e.slug} role="presentation">
                  <Link
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    className={
                      'search-option' + (i === active ? ' active' : '')
                    }
                    href={hrefOf(locale, e)}
                    prefetch={false}
                    onClick={(ev) => onOption(ev, e, i)}
                  >
                    <span className="search-thumb">
                      <Media media={e.thumb} sizes="56px" />
                    </span>
                    <span className="search-copy">
                      <span className="search-title">
                        <Content value={e.title} />
                      </span>
                      <span className="search-meta">
                        {e.type === 'collection' ? (
                          t('searchCollection')
                        ) : (
                          <>
                            {e.collection_name && (
                              <Content value={e.collection_name} />
                            )}
                            {e.duration && (
                              <>
                                {' · '}
                                <Content value={e.duration} />
                              </>
                            )}
                            {' · '}
                            <bdi>{price(e)}</bdi>
                          </>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </dialog>
  );
}
