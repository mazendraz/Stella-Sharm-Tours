import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getPage, ApiError } from '@/lib/api';
import { Content } from '@/components/text';
import { Markdown } from '@/components/markdown';
import { metadataFor } from '@/lib/seo';
import { Unavailable } from '@/components/unavailable';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  if (!['terms', 'privacy', 'cancellation'].includes(key)) notFound();
  const t = await getTranslations();
  return metadataFor(locale, '/legal/' + key, t(key));
}
export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  if (!['terms', 'privacy', 'cancellation'].includes(key)) notFound();
  const t = await getTranslations();
  let page;
  try {
    page = await getPage(key, locale);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      return (
        <main className="wrap content-page" id="main">
          <h1>{t(key)}</h1>
          <p>{t('contentPending')}</p>
        </main>
      );
    return <Unavailable />;
  }
  return (
    <main id="main" className="wrap content-page">
      <h1>
        <Content value={page.title} />
      </h1>
      {page.blocks.map((b, i) => (
        <section key={i}>
          {b.heading && (
            <h2>
              <Content value={b.heading} />
            </h2>
          )}
          <div lang={b.text.lang}>
            <Markdown text={b.text.text} />
          </div>
        </section>
      ))}
    </main>
  );
}
