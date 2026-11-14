import { locales, type Locale } from '@stella/shared';
import { bundledCoreText } from '@stella/shared/i18n/core-content';
export type Row = { id: string; [key: string]: unknown };
export const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? (value as Row[]) : [];
export function content(value: unknown, locale: Locale) {
  if (typeof value === 'string') return value;
  const data = obj(value);
  // Booking snapshots preserve the already-resolved label and its original locale.
  if (typeof data.text === 'string') return data.text;
  return String(
    data[locale] ??
      (typeof data.en === 'string' ? bundledCoreText(data.en, locale) : null) ??
      data.en ??
      '',
  );
}
export function localized(
  value: unknown,
  translations: Row[] = [],
  field = '',
) {
  const raw = obj(value),
    en = String(raw.en ?? '');
  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      raw[locale] ??
        translations.find((row) => row.field === field && row.locale === locale)
          ?.text ??
        (en ? bundledCoreText(en, locale) : null) ??
        '',
    ]),
  );
}
export const snake = (value: string) =>
  value.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
