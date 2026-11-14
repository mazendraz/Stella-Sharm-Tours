import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/env';
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/*/request/', '/*/my-trip', '/*/preview'],
    },
    sitemap: siteOrigin + '/sitemap.xml',
  };
}
