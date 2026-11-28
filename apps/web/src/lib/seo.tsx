import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getSite } from './api';
import { siteOrigin } from './env';

const brand = 'Stella Sharm Tours';

/**
 * Open Graph wants language_TERRITORY. Core languages use the markets the
 * business serves; other languages fall back to the bare language code, which
 * crawlers accept, rather than a guessed territory.
 */
const ogLocales: Record<string, string> = {
  en: 'en_GB',
  it: 'it_IT',
  es: 'es_ES',
  fr: 'fr_FR',
  de: 'de_DE',
  ru: 'ru_RU',
  tr: 'tr_TR',
  ar: 'ar_EG',
};
export const ogLocale = (code: string) => ogLocales[code] ?? code;

/** Keep descriptions inside what results pages show, on a word boundary. */
export function clip(text: string | undefined | null, max = 170) {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)) + '…';
}

export async function indexableLocales(locale: string): Promise<string[]> {
  try {
    return (await getSite(locale)).locales
      .filter((l) => l.indexable)
      .map((l) => l.code);
  } catch {
    return [];
  }
}

export async function metadataFor(
  locale: string,
  path: string,
  title?: string,
  description?: string | null,
  image?: string,
): Promise<Metadata> {
  const locales = await indexableLocales(locale);
  const url = siteOrigin + '/' + locale + path;
  const summary = clip(description);
  return {
    // A title that already names the brand (the home page) is kept as is.
    // Otherwise the brand is appended only while the whole title stays short
    // enough to show in results; Google shows the site name separately.
    title: title
      ? title.includes(brand) || title.length + brand.length + 3 > 65
        ? title
        : title + ' | ' + brand
      : brand,
    ...(summary ? { description: summary } : {}),
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(
          locales.map((l) => [l, siteOrigin + '/' + l + path]),
        ),
        'x-default': siteOrigin + '/en' + path,
      },
    },
    openGraph: {
      type: 'website',
      siteName: brand,
      title: title ?? brand,
      url,
      locale: ogLocale(locale),
      alternateLocale: locales.filter((l) => l !== locale).map(ogLocale),
      ...(summary ? { description: summary } : {}),
      images: [image ?? siteOrigin + '/brand/og.jpg'],
    },
    robots: locales.includes(locale)
      ? {
          index: true,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        }
      : { index: false, follow: true },
  };
}
export async function JsonLd({ value }: { value: unknown }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <script
      nonce={nonce}
      // Browsers hide nonce values from the DOM after parsing, so React sees
      // nonce="" on hydration. The server value is the one that counts.
      suppressHydrationWarning
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replace(/</g, '\\u003c'),
      }}
    />
  );
}
