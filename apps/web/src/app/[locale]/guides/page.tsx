import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getContentList, getSite } from '@/lib/api';
import { metadataFor, JsonLd } from '@/lib/seo';
import { siteOrigin } from '@/lib/env';
import { Content } from '@/components/text';
import Link from 'next/link';
import { breadcrumbs, graph, webPage } from '@/lib/structured-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations();
  return metadataFor(locale, '/guides', t('guides'), t('seoGuidesDescription'));
}

export default async function GuidesIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    [t, pages, site] = await Promise.all([
      getTranslations(),
      getContentList(locale),
      getSite(locale),
    ]);
  // No empty index page: it appears once something is published.
  if (!pages.length) notFound();
  const url = siteOrigin + '/' + locale + '/guides',
    kinds = ['destination', 'guide', 'activity'] as const;
  return (
    <main id="main" className="wrap content-page guides-index">
      <h1>{t('guides')}</h1>
      <p className="lead">{t('guidesIntro')}</p>
      {kinds.map((kind) => {
        const list = pages.filter((p) => p.kind === kind);
        return list.length ? (
          <section key={kind} aria-labelledby={'kind-' + kind}>
            <h2 id={'kind-' + kind}>{t('guideKinds_' + kind)}</h2>
            <ul className="guide-links">
              {list.map((page) => (
                <li key={page.slug}>
                  <Link href={'/' + locale + '/guides/' + page.slug}>
                    <Content value={page.title} />
                  </Link>
                  {page.summary && (
                    <p>
                      <Content value={page.summary} />
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
      <JsonLd
        value={graph([
          webPage('CollectionPage', url, siteOrigin, locale, t('guides'), {
            breadcrumb: { '@id': url + '#breadcrumb' },
          }),
          breadcrumbs(url, [
            { name: site.name, url: siteOrigin + '/' + locale },
            { name: t('guides'), url },
          ]),
        ])}
      />
    </main>
  );
}
