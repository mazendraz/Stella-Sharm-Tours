import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/env';
import { policyFromEnv, robotsRules } from '@/lib/robots-policy';
export const dynamic = 'force-dynamic';

/**
 * Search crawlers are always allowed on public pages. AI search, AI training
 * and Google-Extended are separate switches (AI_SEARCH_CRAWLERS,
 * AI_TRAINING_CRAWLERS, GOOGLE_EXTENDED = allow | block); see
 * src/lib/robots-policy.ts and docs/seo/EXTERNAL-ACTIONS-REQUIRED.md.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: robotsRules(policyFromEnv(process.env)),
    sitemap: siteOrigin + '/sitemap.xml',
  };
}
