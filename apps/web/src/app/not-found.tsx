import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
export default async function NotFound() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
  return (
    <main className="wrap empty-state" id="main">
      <p className="kicker">Stella Sharm Tours</p>
      <h1>{t('notFound')}</h1>
      <Link href={'/' + locale} className="button ink">
        {t('home')}
      </Link>
    </main>
  );
}
