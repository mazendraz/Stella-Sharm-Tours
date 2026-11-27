import type { MetadataRoute } from 'next';

/** Never crawlable by anyone: request forms, saved trips, API, previews. */
export const privatePaths = [
  '/api/',
  '/*/request/',
  '/*/my-trip',
  '/*/preview',
];

/**
 * Crawler groups, from each vendor's documentation (checked 2026-11-27):
 * - OpenAI: OAI-SearchBot (ChatGPT search), ChatGPT-User (user-triggered),
 *   GPTBot (training).
 * - Perplexity: PerplexityBot (search index), Perplexity-User (user-triggered;
 *   Perplexity does not train foundation models).
 * - Anthropic: Claude-SearchBot (search), Claude-User (user-triggered),
 *   ClaudeBot (training).
 * - Google: Googlebot crawls for Search and AI Overviews (covered by `*`).
 *   Google-Extended is a control token, not a crawler: one rule covers Gemini
 *   training AND grounding in Gemini apps / Vertex AI, never Google Search.
 * - Bingbot (Bing, Copilot) is covered by `*`.
 *
 * A crawler that matches a named group ignores the `*` group, so every
 * allowed group repeats the private paths.
 */
export const aiSearchCrawlers = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
];
export const aiTrainingCrawlers = [
  'GPTBot',
  'ClaudeBot',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
];
export const googleExtended = 'Google-Extended';

export type CrawlerPolicy = {
  /** AI search and user-triggered fetchers. Default allow. */
  search: 'allow' | 'block';
  /** Model-training crawlers. Default allow (owner decision pending). */
  training: 'allow' | 'block';
  /** Gemini training + grounding token. Default allow. */
  googleExtended: 'allow' | 'block';
};

const choice = (value: string | undefined): 'allow' | 'block' =>
  value?.trim().toLowerCase() === 'block' ? 'block' : 'allow';

export function policyFromEnv(env: Record<string, string | undefined>) {
  return {
    search: choice(env.AI_SEARCH_CRAWLERS),
    training: choice(env.AI_TRAINING_CRAWLERS),
    googleExtended: choice(env.GOOGLE_EXTENDED),
  } satisfies CrawlerPolicy;
}

export function robotsRules(
  policy: CrawlerPolicy,
): MetadataRoute.Robots['rules'] {
  const group = (userAgent: string[], mode: 'allow' | 'block') =>
    mode === 'allow'
      ? { userAgent, allow: '/', disallow: privatePaths }
      : { userAgent, disallow: '/' };
  return [
    { userAgent: '*', allow: '/', disallow: privatePaths },
    group(aiSearchCrawlers, policy.search),
    group(aiTrainingCrawlers, policy.training),
    group([googleExtended], policy.googleExtended),
  ];
}
