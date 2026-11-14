'use client';
import { locales, type Locale } from '@stella/shared';
import { useAdmin } from '../lib/admin-context';

const names: Record<Locale, string> = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
  tr: 'Türkçe',
};

/** Language picker for the sign-in screen (inside the app it lives in the account menu). */
export function LanguageSelect() {
  const { locale, setLocale, t } = useAdmin();
  return (
    <label className="language-select">
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {names[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
