import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { parseBody } from '@stella/shared/content';
import { ApiError, getContentPage, getSite, getTrip } from '@/lib/api';
import { metadataFor, JsonLd } from '@/lib/seo';
import { siteOrigin } from '@/lib/env';
import { Content } from '@/components/text';
import Link from 'next/link';
import {
  article,
  breadcrumbs,
  faqEntities,
  graph,
  webPage,
} from '@/lib/structured-data';

async function load(slug: string, locale: string) {
  try {
    return await getContentPage(slug, locale);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params,
    page = await load(slug, locale);
  return metadataFor(
    locale,
    '/guides/' + slug,
    page.seo_title?.text ?? page.title.text,
    page.seo_description?.text ?? page.summary?.text,
    page.cover?.url,
  );
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params,
    page = await load(slug, locale),
    [t, format, site] = await Promise.all([
      getTranslations(),
      getFormatter(),
      getSite(locale),
    ]);
  // Related trips that are no longer published simply drop out.
  const trips = (
    await Promise.all(
      page.related_trips.map((s) => getTrip(s, locale).catch(() => null)),
    )
  ).filter((trip) => trip !== null);
  const url = siteOrigin + '/' + locale + '/guides/' + slug,
    home = siteOrigin + '/' + locale;
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long' });
  return (
    <main id="main" className="wrap content-page guide-page">
      <nav aria-label={t('breadcrumb')} className="breadcrumb">
        <ol>
          <li>
            <Link href={'/' + locale}>{site.name}</Link>
          </li>
          <li>
            <Link href={'/' + locale + '/guides'}>{t('guides')}</Link>
          </li>
          <li aria-current="page">
            <Content value={page.title} />
          </li>
        </ol>
      </nav>
      <p className="kicker">{t('guideKind_' + page.kind)}</p>
      <h1>
        <Content value={page.title} />
      </h1>
      {page.summary && (
        <p className="lead">
          <Content value={page.summary} />
        </p>
      )}
      <p className="guide-meta">
        {page.author &&
          t('guideBy', {
            name:
              page.author.name +
              (page.author.role ? ', ' + page.author.role : ''),
          })}
        {page.author && ' · '}
        {t('guideUpdated', { date: date(page.updated_at) })}
      </p>
      {page.body && (
        <div className="guide-body" lang={page.body.lang}>
          {parseBody(page.body.text).map((block, i) =>
            block.type === 'heading' ? (
              <h2 key={i}>{block.text}</h2>
            ) : block.type === 'list' ? (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{block.text}</p>
            ),
          )}
        </div>
      )}
      {trips.length > 0 && (
        <section aria-labelledby="guide-trips">
          <h2 id="guide-trips">{t('guideRelatedTrips')}</h2>
          <ul className="guide-links">
            {trips.map((trip) => (
              <li key={trip.slug}>
                <Link href={'/' + locale + '/t/' + trip.slug}>
                  <Content value={trip.title} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {page.faqs.length > 0 && (
        <section aria-labelledby="guide-faq">
          <h2 id="guide-faq">{t('guideQuestions')}</h2>
          {page.faqs.map((item, i) => (
            <details className="faq-item" key={i}>
              <summary>
                <Content value={item.q} />
              </summary>
              <p lang={item.a.lang}>{item.a.text}</p>
            </details>
          ))}
        </section>
      )}
      {page.related_pages.length > 0 && (
        <section aria-labelledby="guide-more">
          <h2 id="guide-more">{t('guideRelatedPages')}</h2>
          <ul className="guide-links">
            {page.related_pages.map((rel) => (
              <li key={rel.slug}>
                <Link href={'/' + locale + '/guides/' + rel.slug}>
                  <Content value={rel.title} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {page.sources.length > 0 && (
        <section aria-labelledby="guide-sources">
          <h2 id="guide-sources">{t('guideSources')}</h2>
          <ul className="guide-sources">
            {page.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="noopener noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <JsonLd
        value={graph([
          webPage('WebPage', url, siteOrigin, locale, page.title.text, {
            mainEntity: { '@id': url + '#article' },
            breadcrumb: { '@id': url + '#breadcrumb' },
            ...(page.cover ? { primaryImageOfPage: page.cover.url } : {}),
          }),
          article(page, url, siteOrigin, locale),
          breadcrumbs(url, [
            { name: site.name, url: home },
            { name: t('guides'), url: home + '/guides' },
            { name: page.title.text, url },
          ]),
          ...(page.faqs.length
            ? [
                {
                  '@type': 'FAQPage',
                  '@id': url + '#faq',
                  mainEntity: faqEntities(page.faqs),
                },
              ]
            : []),
        ])}
      />
    </main>
  );
}
