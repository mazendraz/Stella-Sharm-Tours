import { isCoreLocale } from '../index';
export type TranslationRow = {
  text: string;
  locale: string;
  origin: 'human' | 'machine';
  sourceHash?: string;
};
export function resolveText(
  value: Record<string, string | undefined> | null | undefined,
  locale: string,
  rows: TranslationRow[] = [],
) {
  if (!value) return null;
  if (isCoreLocale(locale) && value[locale]?.trim())
    return { text: value[locale]!, lang: locale, fallback: false };
  const row = rows
    .filter(
      (r) =>
        r.locale === locale &&
        r.text.trim() &&
        (!isCoreLocale(locale) || r.origin === 'human'),
    )
    .sort(
      (a, b) => Number(b.origin === 'human') - Number(a.origin === 'human'),
    )[0];
  if (row) return { text: row.text, lang: locale, fallback: false };
  return { text: value.en ?? '', lang: 'en', fallback: locale !== 'en' };
}
