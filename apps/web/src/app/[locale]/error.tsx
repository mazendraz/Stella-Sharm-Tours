'use client';
import { useTranslations } from 'next-intl';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations();
  return (
    <main className="wrap empty-state" id="main">
      <h1>{t('unavailable')}</h1>
      <p>{t('unavailableSub')}</p>
      <button className="button ink" onClick={reset}>
        {t('retry')}
      </button>
    </main>
  );
}
