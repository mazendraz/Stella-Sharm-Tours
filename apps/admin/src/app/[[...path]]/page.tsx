import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { locales, type Locale } from '@stella/shared';
import { AdminApp } from '../../components/admin-app';
import en from '../../../messages/en.json';
import it from '../../../messages/it.json';
import es from '../../../messages/es.json';
import fr from '../../../messages/fr.json';
import de from '../../../messages/de.json';
import ru from '../../../messages/ru.json';
import tr from '../../../messages/tr.json';

const dictionaries: Record<Locale, Record<string, string>> = {
  en,
  it,
  es,
  fr,
  de,
  ru,
  tr,
};
const sectionKey: Record<string, string> = {
  '': 'overview',
  requests: 'requests',
  trips: 'trips',
  packages: 'packages',
  collections: 'collections',
  prices: 'prices',
  homepage: 'homepage',
  hero: 'hero',
  media: 'media',
  pages: 'pages',
  translations: 'translations',
  queue: 'translations',
  languages: 'languageSettings',
  settings: 'settings',
  team: 'team',
  users: 'team',
  activity: 'activity',
  account: 'account',
  more: 'more',
};

/** "{Page} · Stella Admin" on every route, including client navigations. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}): Promise<Metadata> {
  const { path = [] } = await params,
    saved = (await cookies()).get('stella_admin_locale')?.value,
    locale: Locale = locales.includes(saved as Locale)
      ? (saved as Locale)
      : 'en',
    dict = dictionaries[locale];
  const key =
    path[0] === 'settings' && path[1] === 'languages'
      ? 'languageSettings'
      : path[0] === 'pages' && path[1] === 'faq'
        ? 'faq'
        : (sectionKey[path[0] ?? ''] ?? 'overview');
  return {
    title: (dict[key] ?? en[key as keyof typeof en]) + ' · Stella Admin',
  };
}

export default function Page() {
  return (
    <Suspense>
      <AdminApp />
    </Suspense>
  );
}
