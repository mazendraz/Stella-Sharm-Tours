import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import localFont from 'next/font/local';
import { locales, type Locale } from '@stella/shared';
import { Provider } from '../lib/admin-context';
import { runtimeEnv } from '../lib/runtime-env';
import './globals.css';
const manrope = localFont({
  src: '../../../web/src/fonts/manrope-full.woff2',
  weight: '400 800',
  display: 'swap',
});
export const metadata = {
  title: 'Stella Sharm Tours',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-180.png' },
};
export default async function Layout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get('stella_admin_locale')?.value,
    locale: Locale = locales.includes(saved as Locale)
      ? (saved as Locale)
      : 'en';
  const apiOrigin = new URL(
    runtimeEnv(
      'PUBLIC_API_URL',
      runtimeEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000'),
    ),
  ).origin;
  return (
    <html lang={locale}>
      <body className={manrope.className}>
        <Provider
          initialLocale={locale}
          apiOrigin={apiOrigin}
          webOrigin={
            new URL(runtimeEnv('SITE_URL', 'http://localhost:3000')).origin
          }
        >
          {children}
        </Provider>
      </body>
    </html>
  );
}
