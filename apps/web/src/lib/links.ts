export function internalHref(href: string, locale: string): string {
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\'))
    return '/' + locale + (href === '/' ? '' : href);
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' && url.hostname === 'wa.me') return url.href;
  } catch {}
  return '/' + locale;
}
export function whatsapp(number: string | null, message?: string) {
  if (!number) return null;
  const digits = number.replace(/\D/g, '');
  return digits.length >= 7
    ? 'https://wa.me/' +
        digits +
        (message ? '?text=' + encodeURIComponent(message) : '')
    : null;
}
export function money(amount: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}
export function track(
  event: string,
  data: Record<string, string | number | boolean> = {},
) {
  if (typeof window !== 'undefined')
    (
      window as Window & {
        umami?: { track: (e: string, d: typeof data) => void };
      }
    ).umami?.track(event, data);
}
