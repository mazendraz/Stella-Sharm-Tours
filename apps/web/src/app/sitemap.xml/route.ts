import {
  getSite,
  getCollections,
  getCollection,
  getPage,
  getContentList,
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
  const addImageLater: [string, string | undefined][] = [];
  try {
    const [site, collections, legal, content] = await Promise.all([
      getSite('en'),
      getCollections('en'),
      approvedLegalPaths(),
      getContentList('en'),
    ]);
    // Published guides only; lastmod is the page's real update time.
    const lastmod = new Map(
      content.map((page) => ['/guides/' + page.slug, page.updated_at]),
    );
    content.forEach((page) =>
      addImageLater.push(['/guides/' + page.slug, page.cover?.url]),
    );
    const details = await Promise.all(
      collections.map((collection) => getCollection(collection.slug, 'en')),
    );
    // Cover photo per path for the image extension (localized alt text is
    // in the pages; the sitemap only lists the image location).
    const images = new Map<string, string[]>();
    const addImage = (path: string, url: string | undefined) => {
      if (!url || !/^https?:\/\//.test(url)) return;
      const list = images.get(path) ?? [];
      if (!list.includes(url)) images.set(path, [...list, url]);
    };
    collections.forEach((c) => addImage('/c/' + c.slug, c.cover?.url));
    addImageLater.forEach(([path, url]) => addImage(path, url));
    details.forEach((detail) =>
      detail.trips.forEach((trip) => {
        addImage('/t/' + trip.slug, trip.cover?.url);
        trip.gallery
          .slice(0, 4)
          .forEach((m) => addImage('/t/' + trip.slug, m.url));
      }),
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
      ...(content.length ? ['/guides'] : []),
      ...content.map((page) => '/guides/' + page.slug),
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
      const imageTags = (images.get(path) ?? [])
        .map(
          (url) =>
            `<image:image><image:loc>${escapeXml(url)}</image:loc></image:image>`,
        )
        .join('');
      return locales.map(
        (locale) =>
          `<url><loc>${href(locale)}</loc>${lastmod.has(path) ? `<lastmod>${escapeXml(lastmod.get(path)!)}</lastmod>` : ''}${alternates}${imageTags}</url>`,
      );
    });
    return new Response(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
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
