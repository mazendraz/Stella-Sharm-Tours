import type { ReactNode, CSSProperties } from 'react';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { RuntimeConfig } from '@/components/runtime-config';
import { ErrorTracking } from '@/components/error-tracking';
import Script from 'next/script';
import { analyticsConfig } from '@stella/shared/analytics';
import {
  body as bodyFont,
  display,
  cyrillic as forum,
  arabic,
} from '@/lib/font-main';
import './globals.css';
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = (await headers()).get('x-stella-locale') ?? 'en';
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const analytics = analyticsConfig(
    env.NEXT_PUBLIC_SITE_URL,
    process.env.UMAMI_SCRIPT_URL,
    process.env.UMAMI_WEBSITE_ID,
  );
  const rtl = ['ar', 'he', 'fa', 'ur'].includes(locale);
  const body = bodyFont.style.fontFamily;
  const heading = (['ru', 'uk'].includes(locale) ? forum : display).style
    .fontFamily;
  const script =
    locale === 'ar'
      ? arabic.style.fontFamily + ',' + body
      : locale === 'zh'
        ? "'Noto Sans SC Variable'," + body
        : undefined;
  return (
    <html
      lang={locale}
      dir={rtl ? 'rtl' : 'ltr'}
      style={
        {
          '--font-body': body,
          '--font-display': heading,
          ...(script ? { '--font-script': script } : {}),
        } as CSSProperties
      }
    >
      <head>
        <link rel="apple-touch-icon" href="/brand/icon-180.png" />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/brand/icon-192.png"
        />
        {process.env.MEDIA_PUBLIC_URL && (
          <link
            rel="preconnect"
            href={new URL(process.env.MEDIA_PUBLIC_URL).origin}
          />
        )}
        {locale === 'zh' && (
          <link rel="stylesheet" href="/fonts/chinese/index.css" />
        )}
      </head>
      <body>
        {analytics && (
          <>
            <Script
              src="/analytics-guard.js"
              strategy="beforeInteractive"
              nonce={nonce}
            />
            <Script
              src={analytics.script}
              data-website-id={analytics.website}
              data-before-send="stellaAnalytics"
              data-exclude-search="true"
              data-exclude-hash="true"
              data-do-not-track="true"
              strategy="afterInteractive"
              nonce={nonce}
            />
          </>
        )}
        <ErrorTracking enabled={Boolean(process.env.SENTRY_DSN)} />
        <RuntimeConfig apiOrigin={env.NEXT_PUBLIC_API_URL}>
          {children}
        </RuntimeConfig>
      </body>
    </html>
  );
}
