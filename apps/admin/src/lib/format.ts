import type { Locale } from '@stella/shared';
import { isDisplayCurrency } from '@stella/shared/display-currency';

/** The business runs in Egypt: every date/time shown to staff is Cairo time. */
export const TZ = 'Africa/Cairo';

/**
 * €1,234 when there are no cents, €1,234.50 when there are. Booking requests
 * pass the currency the customer saw (£/$/€); the amount is never converted.
 */
export function money(
  amount: number | string | null | undefined,
  locale: Locale,
  currency: string = 'EUR',
): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: isDisplayCurrency(currency) ? currency : 'EUR',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

/** API amounts are 2-decimal strings ("260.00"). */
export const amountString = (value: number | string) =>
  Number(value).toFixed(2);

const toDate = (value: string | Date) =>
  value instanceof Date ? value : new Date(value);

/** "Sun 16 Nov" for a calendar date (YYYY-MM-DD) — no timezone shift. */
export function dayLabel(isoDate: string, locale: Locale) {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y!, m! - 1, d!, 12)));
}

export function addDays(isoDate: string, days: number) {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days, 12))
    .toISOString()
    .slice(0, 10);
}

export function dateTime(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TZ,
  }).format(toDate(value));
}

export function dateOnly(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  }).format(toDate(value));
}

export function timeOnly(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: TZ,
  }).format(toDate(value));
}

/** "2 hours ago", "yesterday", "in 3 days". */
export function relative(value: string | Date, locale: Locale) {
  const diff = (toDate(value).getTime() - Date.now()) / 1000,
    abs = Math.abs(diff),
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60) return format.format(Math.round(diff), 'second');
  if (abs < 3600) return format.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return format.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return format.format(Math.round(diff / 86400), 'day');
  return dateOnly(value, locale);
}

/** Cairo wall-clock "YYYY-MM-DDTHH:mm" ↔ UTC ISO, for datetime-local inputs. */
function cairoOffsetMinutes(utc: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(utc)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return Math.round((asUtc - utc.getTime()) / 60000);
}
export function utcToCairoInput(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso),
    shifted = new Date(date.getTime() + cairoOffsetMinutes(date) * 60000);
  return shifted.toISOString().slice(0, 16);
}
export function cairoInputToUtc(local: string) {
  if (!local) return null;
  const guess = new Date(local + ':00Z');
  const offset = cairoOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60000).toISOString();
}

/** Weekday names; index 0 = Sunday (matches runDays on the public site). */
export function weekday(day: number, locale: string, style: 'long' | 'short') {
  return new Intl.DateTimeFormat(locale, {
    weekday: style,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(1970, 0, 4 + day, 12)));
}

export function languageName(code: string, displayLocale: string) {
  try {
    const name = new Intl.DisplayNames([displayLocale], {
      type: 'language',
    }).of(code);
    return name
      ? name.charAt(0).toLocaleUpperCase(displayLocale) + name.slice(1)
      : code;
  } catch {
    return code;
  }
}

/** ASCII kebab-case page address from a title. */
export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function interpolate(
  text: string,
  vars?: Record<string, string | number>,
) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
