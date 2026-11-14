import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Collection } from '@stella/shared/public-contract';
import { isCoreLocale } from '@stella/shared';
import { getSite, getCollections } from '@/lib/api';
import { Shell } from '@/components/shell';
import { navCollection, shellSite } from '@stella/shared/card-trip';
export default async function LocaleLayout({
  children,
  modal,
  params,
}: {
  children: ReactNode;
  modal: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let site = null;
  let collections: Collection[] = [];
  try {
    [site, collections] = await Promise.all([
      getSite(locale),
      getCollections(locale),
    ]);
    if (!site.locales.some((l) => l.code === locale)) notFound();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('NEXT_HTTP_ERROR_FALLBACK')
    )
      throw error;
    if (!isCoreLocale(locale)) notFound();
  }
  return (
    <NextIntlClientProvider
      messages={await getMessages()}
      locale={locale}
      timeZone="Africa/Cairo"
    >
      <Shell
        site={site && shellSite(site)}
        collections={collections.map(navCollection)}
      >
        {children}
        {modal}
      </Shell>
    </NextIntlClientProvider>
  );
}
