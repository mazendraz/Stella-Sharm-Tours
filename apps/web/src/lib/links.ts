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
/**
 * Office pin (Stella Sharm Tours on Google Maps, Old Market). The static map
 * in /public/map is rendered from OpenStreetMap around this point; an admin
 * upload in Settings (map_image) replaces the picture, not the destination.
 */
const office = { lat: 27.8669735, lon: 34.293776 };
export const officeMap = {
  url:
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(office.lat + ',' + office.lon),
  image: '/map/office.webp',
};
/** "+201095989932" → "+20 109 598 9932" for display; other numbers unchanged. */
export function displayPhone(number: string) {
  const egypt = /^\+20(\d{3})(\d{3})(\d{4})$/.exec(number.replace(/\s/g, ''));
  return egypt ? `+20 ${egypt[1]} ${egypt[2]} ${egypt[3]}` : number;
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
