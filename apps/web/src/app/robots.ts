import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/env';
export const dynamic = 'force-dynamic';

const privatePaths = ['/api/', '/*/request/', '/*/my-trip', '/*/preview'];

/**
 * Tokens that only decide whether public pages may train AI models. Search
 * and answer engines (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot,
 * Claude-SearchBot…) are separate agents and keep the default rules either
 * way. Google-Extended also governs grounding in Gemini apps, so blocking it
 * trades some Gemini visibility for opting out of training; it never affects
 * Google Search or AI Overviews.
 *
 * Owner decision (docs/seo/EXTERNAL-ACTIONS-REQUIRED.md): set
 * AI_TRAINING_CRAWLERS=block to opt out. Unset keeps the published behaviour.
 */
const trainingCrawlers = [
  'GPTBot',
  'Google-Extended',
  'Applebot-Extended',
  'ClaudeBot',
  'CCBot',
  'meta-externalagent',
];

export default function robots(): MetadataRoute.Robots {
  const blockTraining = process.env.AI_TRAINING_CRAWLERS === 'block';
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: privatePaths },
      ...(blockTraining
        ? [{ userAgent: trainingCrawlers, disallow: '/' }]
        : []),
    ],
    sitemap: siteOrigin + '/sitemap.xml',
  };
}
