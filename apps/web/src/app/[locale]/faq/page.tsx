import { getTranslations } from 'next-intl/server';
import { getFaq } from '@/lib/api';
import { Content } from '@/components/text';
import { Markdown } from '@/components/markdown';
import { metadataFor, JsonLd } from '@/lib/seo';
import { siteOrigin } from '@/lib/env';
import { faqEntities, graph, webPage } from '@/lib/structured-data';
import { Unavailable } from '@/components/unavailable';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations();
  return metadataFor(locale, '/faq', t('faq'), t('seoFaqDescription'));
}
export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations();
  let items;
  try {
    items = await getFaq(locale);
  } catch {
    return <Unavailable />;
  }
  return (
    <main id="main" className="wrap content-page">
      <p className="kicker">Stella Sharm Tours</p>
      <h1>{t('faq')}</h1>
      {items.length ? (
        items.map((item) => (
          <details className="faq-item" key={item.id}>
            <summary>
              <Content value={item.q} />
            </summary>
            <div lang={item.a.lang}>
              <Markdown text={item.a.text} />
            </div>
          </details>
        ))
      ) : (
        <p>{t('contentPending')}</p>
      )}
      {items.length > 0 && (
        // Valid FAQPage markup; Google shows FAQ rich results only for
        // authoritative government and health sites, so this is for meaning,
        // not for a rich result.
        <JsonLd
          value={graph([
            webPage(
              'FAQPage',
              siteOrigin + '/' + locale + '/faq',
              siteOrigin,
              locale,
              t('faq'),
              { mainEntity: faqEntities(items) },
            ),
          ])}
        />
      )}
    </main>
  );
}
