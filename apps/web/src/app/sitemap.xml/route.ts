import {
  getSite,
  getCollections,
  getCollection,
  getPage,
  ApiError,
} from '@/lib/api';
import { siteOrigin } from '@/lib/env';

export const dynamic = 'force-dynamic';

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]!,
  );

async function approvedLegalPaths() {
  const pages = await Promise.all(
    ['terms', 'privacy', 'cancellation'].map(async (key) => {
      try {
        await getPage(key, 'en');
        return '/legal/' + key;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    }),
  );
  return pages.filter((path): path is string => path !== null);
}

export async function GET() {
  try {
    const [site, collections, legal] = await Promise.all([
      getSite('en'),
      getCollections('en'),
      approvedLegalPaths(),
    ]);
    const details = await Promise.all(
      collections.map((collection) => getCollection(collection.slug, 'en')),
    );
    const paths = [
      '',
      '/contact',
      '/faq',
      ...legal,
      ...collections.map((collection) => '/c/' + collection.slug),
      ...new Set(
        details.flatMap((detail) =>
          detail.trips.map((trip) => '/t/' + trip.slug),
        ),
      ),
    ];
    const locales = site.locales
      .filter((locale) => locale.indexable)
      .map((locale) => locale.code);
    const entries = paths.flatMap((path) => {
      const href = (locale: string) =>
        escapeXml(siteOrigin + '/' + locale + path);
      const alternates = [...locales, 'x-default']
        .map(
          (locale) =>
            `<xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${href(locale === 'x-default' ? 'en' : locale)}"/>`,
        )
        .join('');
      return locales.map(
        (locale) => `<url><loc>${href(locale)}</loc>${alternates}</url>`,
      );
    });
    return new Response(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...entries,
        '</urlset>',
      ].join('\n'),
      { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
    );
  } catch {
    return new Response(null, {
      status: 503,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }
}
