'use client';
/**
 * Header search button. Kept tiny: the panel and the matching engine are
 * separate chunks, fetched on first touch/focus of the button.
 */
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { Search as SearchIcon } from 'lucide-react';
import type { Collection } from '@stella/shared/public-contract';
import { track } from '@/lib/links';
import './search-button.css';

const SearchPanel = dynamic(() => import('./search-panel'), { ssr: false });
const prefetch = (locale: string) =>
  void import('@/lib/search-client')
    .then((m) => m.loadSearch(locale))
    .catch(() => {});

export function SearchButton({
  collections,
  whatsappUrl,
}: {
  collections: Collection[];
  whatsappUrl: string | null;
}) {
  const t = useTranslations(),
    locale = useLocale();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null),
    wasOpen = useRef(false);
  // Return focus once the modal is really gone (it blocks focus while open).
  useEffect(() => {
    if (wasOpen.current && !open)
      button.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="nav-search"
        aria-label={t('search')}
        aria-haspopup="dialog"
        onPointerDown={() => prefetch(locale)}
        onFocus={() => prefetch(locale)}
        onClick={() => {
          setOpen(true);
          track('search_open');
        }}
      >
        <SearchIcon size={21} aria-hidden="true" />
      </button>
      {open && (
        <SearchPanel
          collections={collections}
          whatsappUrl={whatsappUrl}
          onClosed={() => setOpen(false)}
        />
      )}
    </>
  );
}
