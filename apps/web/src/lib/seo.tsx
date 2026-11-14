import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getSite } from './api';
import { siteOrigin } from './env';
export async function metadataFor(
  locale: string,
  path: string,
  title?: string,
  description?: string,
  image?: string,
): Promise<Metadata> {
  let locales: string[] = [];
  try {
    locales = (await getSite(locale)).locales
      .filter((l) => l.indexable)
      .map((l) => l.code);
  } catch {}
  const url = siteOrigin + '/' + locale + path;
  return {
    title: title ? title + ' | Stella Sharm Tours' : 'Stella Sharm Tours',
    ...(description ? { description } : {}),
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
      title: title ?? 'Stella Sharm Tours',
      url,
      locale,
      ...(description ? { description } : {}),
      images: [image ?? siteOrigin + '/brand/og.jpg'],
    },
    robots: locales.includes(locale)
      ? { index: true, follow: true }
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
