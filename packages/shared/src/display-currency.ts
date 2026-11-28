/**
 * Display currency (owner, 2026-11-26). Prices are one number in the database;
 * only the currency sign shown next to it changes, never the amount:
 * a €25 trip shows as £25 or $25.
 *
 * - English pages follow the device's region from `Accept-Language`:
 *   en-GB → GBP, en-US → USD, any other English → EUR.
 * - Every other language (core and machine-translated) shows EUR.
 *
 * A booking request stores the currency the customer saw, so staff quote the
 * same sign back.
 */
export const displayCurrencies = ['EUR', 'GBP', 'USD'] as const;
export type DisplayCurrency = (typeof displayCurrencies)[number];

export const isDisplayCurrency = (value: unknown): value is DisplayCurrency =>
  typeof value === 'string' &&
  (displayCurrencies as readonly string[]).includes(value);

const englishRegions: Record<string, DisplayCurrency> = {
  GB: 'GBP',
  UK: 'GBP',
  US: 'USD',
};

export function displayCurrencyFor(
  locale: string,
  acceptLanguage: string | null | undefined,
): DisplayCurrency {
  if (locale.toLowerCase().split('-')[0] !== 'en') return 'EUR';
  // The visitor's most preferred English variant decides (q-values honoured).
  const english = (acceptLanguage ?? '')
    .slice(0, 1000)
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const quality = q ? Number(q.slice(2)) : 1;
      return {
        tag: tag.trim(),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((p) => p.quality > 0 && p.tag.toLowerCase().split('-')[0] === 'en')
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .find((p) => p.tag.includes('-'));
  const region = english?.tag.split('-').at(-1)?.toUpperCase() ?? '';
  return englishRegions[region] ?? 'EUR';
}

/** Whole-unit price in the display currency: 25 → "€25", "£25" or "$25". */
export function formatPrice(
  amount: number,
  locale: string,
  currency: DisplayCurrency = 'EUR',
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
