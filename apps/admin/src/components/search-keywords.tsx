'use client';
/**
 * "Search keywords" editor: words visitors might type to find a trip or
 * collection on the public search. One list per core language (follows the
 * editor's language bar) plus "Other languages & spellings" (Arabic,
 * transliterations, typos). Never shown on the site.
 */
import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { searchKeywordsSchema } from '@stella/shared/admin';
import type { SearchKeywords } from '@stella/shared/search';
import { useAdmin } from '../lib/admin-context';
import { useEditLang } from './ui/field';

const MAX_WORDS = 30,
  MAX_LENGTH = 60;
type List = keyof SearchKeywords;

/** Editor state from the stored column (tolerates null/garbage). */
export function keywordsFrom(value: unknown): SearchKeywords {
  const parsed = searchKeywordsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}
/** Value to save: empty lists dropped, null when nothing is left. */
export function keywordsOut(value: SearchKeywords): SearchKeywords | null {
  const kept = Object.fromEntries(
    Object.entries(value).filter(([, words]) => words && words.length),
  ) as SearchKeywords;
  return Object.keys(kept).length ? kept : null;
}

function KeywordList({
  label,
  words,
  onChange,
  dir,
}: {
  label: string;
  words: string[];
  onChange: (words: string[]) => void;
  dir?: 'auto';
}) {
  const { t } = useAdmin(),
    id = useId(),
    [draft, setDraft] = useState(''),
    [error, setError] = useState(false);
  const add = () => {
    const word = draft.trim();
    if (!word) return;
    const duplicate = words.some(
      (w) => w.toLocaleLowerCase() === word.toLocaleLowerCase(),
    );
    if (duplicate || word.length > MAX_LENGTH || words.length >= MAX_WORDS) {
      setError(true);
      return;
    }
    setError(false);
    onChange([...words, word]);
    setDraft('');
  };
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
      </div>
      {words.length > 0 && (
        <ul className="chip-list">
          {words.map((word) => (
            <li key={word} className="chip removable" dir={dir}>
              {word}
              <button
                type="button"
                className="chip-x"
                aria-label={t('searchKeywordRemove', { word })}
                onClick={() => onChange(words.filter((w) => w !== word))}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="inline-add">
        <input
          id={id}
          value={draft}
          dir={dir}
          maxLength={MAX_LENGTH + 1}
          aria-invalid={error || undefined}
          aria-describedby={error ? id + '-error' : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !draft && words.length)
              onChange(words.slice(0, -1));
          }}
        />
        <button type="button" className="btn" onClick={add}>
          {t('searchKeywordAdd')}
        </button>
      </div>
      {error && (
        <p className="field-error" id={id + '-error'} role="alert">
          {t('searchKeywordsLimit')}
        </p>
      )}
    </div>
  );
}

export function SearchKeywordsField({
  value,
  onChange,
}: {
  value: SearchKeywords;
  onChange: (value: SearchKeywords) => void;
}) {
  const { t } = useAdmin(),
    lang = useEditLang();
  const set = (list: List) => (words: string[]) =>
    onChange({ ...value, [list]: words });
  return (
    <section className="search-keywords" aria-label={t('searchKeywords')}>
      <h3>{t('searchKeywords')}</h3>
      <p className="muted">{t('searchKeywordsHelp')}</p>
      <KeywordList
        key={lang}
        label={t('searchKeywords') + ' · ' + lang.toUpperCase()}
        words={value[lang] ?? []}
        onChange={set(lang)}
      />
      <KeywordList
        label={t('searchKeywordsOther')}
        words={value.extra ?? []}
        onChange={set('extra')}
        dir="auto"
      />
    </section>
  );
}
