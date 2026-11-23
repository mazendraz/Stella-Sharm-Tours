'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronDown, Search } from 'lucide-react';
import { countries, flag, popular } from './countries';

const normalize = (value: string, locale: string) =>
  value.toLocaleLowerCase(locale).normalize('NFD').replace(/\p{M}/gu, '');

export function CountryPicker({
  country,
  open,
  onOpenChange,
  onSelect,
}: {
  country: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (country: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  const options = useMemo(() => {
    let names: Intl.DisplayNames | undefined;
    try {
      names = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {}
    const sort = new Intl.Collator(locale);
    return countries
      .map(([code, dial]) => ({ code, dial, name: names?.of(code) ?? code }))
      .sort((a, b) => sort.compare(a.name, b.name));
  }, [locale]);
  const selected = options.find(({ code }) => code === country);
  const preferred = popular[locale] ?? [];
  const term = normalize(query.trim(), locale);
  const matches = term
    ? options.filter(({ name, code, dial }) =>
        [name, code, dial].some((value) =>
          normalize(value, locale).includes(term),
        ),
      )
    : options;
  const groups = term
    ? [{ label: 'allCountries', items: matches }]
    : [
        {
          label: 'popular',
          items: preferred.flatMap(
            (code) => options.find((item) => item.code === code) ?? [],
          ),
        },
        {
          label: 'allCountries',
          items: matches.filter(({ code }) => !preferred.includes(code)),
        },
      ];

  useEffect(() => {
    if (open) search.current?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  return (
    <div className="field country-picker">
      <label id="booking-country-label" htmlFor="booking-country">
        {t('country')}
      </label>
      <button
        ref={trigger}
        type="button"
        id="booking-country"
        className="country-trigger"
        aria-labelledby="booking-country-label booking-country-choice"
        aria-expanded={open}
        aria-controls={open ? 'booking-country-options' : undefined}
        data-country={country}
        onClick={() => {
          setQuery('');
          onOpenChange(!open);
        }}
      >
        <span id="booking-country-choice" className="country-choice">
          {selected && (
            <span className="country-flag" aria-hidden="true">
              {flag(selected.code)}
            </span>
          )}
          <span>{selected ? selected.name : t('chooseCountry')}</span>
          {selected && <bdi className="country-dial">{selected.dial}</bdi>}
        </span>
        <ChevronDown size={19} aria-hidden="true" />
      </button>
      {open && (
        <div className="country-options" id="booking-country-options">
          <div className="country-search">
            <Search size={17} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              aria-label={t('searchCountries')}
              placeholder={t('searchCountries')}
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (matches.length === 1) onSelect(matches[0]!.code);
                }
              }}
            />
          </div>
          <div className="country-options-list">
            {matches.length === 0 && <p role="status">{t('noCountries')}</p>}
            {groups
              .filter(({ items }) => items.length)
              .map(({ label, items }) => (
                <div key={label} role="group" aria-label={t(label)}>
                  <p className="country-group">{t(label)}</p>
                  {items.map(({ code, dial, name }) => (
                    <button
                      key={code}
                      type="button"
                      className="country-option"
                      aria-pressed={code === country}
                      data-country-option={code}
                      onClick={() => onSelect(code)}
                    >
                      <span className="country-flag" aria-hidden="true">
                        {flag(code)}
                      </span>
                      <span className="country-name">{name}</span>
                      <bdi className="country-dial">{dial}</bdi>
                      <Check
                        className="country-check"
                        size={17}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
