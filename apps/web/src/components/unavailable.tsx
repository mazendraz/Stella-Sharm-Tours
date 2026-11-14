import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
export async function Unavailable() {
  const t = await getTranslations(),
    locale = await getLocale();
  return (
    <main className="wrap empty-state" id="main">
      <p className="kicker">Stella Sharm Tours</p>
      <h1>{t('unavailable')}</h1>
      <p>{t('unavailableSub')}</p>
      <Link className="button ink" href={'/' + locale}>
        {t('retry')}
      </Link>
    </main>
  );
}
