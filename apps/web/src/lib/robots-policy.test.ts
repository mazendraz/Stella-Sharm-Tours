import { describe, expect, it } from 'vitest';
import {
  aiSearchCrawlers,
  aiTrainingCrawlers,
  policyFromEnv,
  privatePaths,
  robotsRules,
} from './robots-policy';

type Group = {
  userAgent: string | string[];
  allow?: unknown;
  disallow?: unknown;
};
const groups = (env: Record<string, string>) =>
  robotsRules(policyFromEnv(env)) as Group[];
const groupFor = (rules: Group[], agent: string) =>
  rules.find((r) => [r.userAgent].flat().includes(agent));

describe('robots policy', () => {
  it('allows search and AI search by default, keeping private paths closed', () => {
    const rules = groups({});
    for (const agent of ['*', ...aiSearchCrawlers]) {
      expect(groupFor(rules, agent)).toMatchObject({
        allow: '/',
        disallow: privatePaths,
      });
    }
    expect(groupFor(rules, 'Google-Extended')).toMatchObject({ allow: '/' });
  });

  it('blocks only training crawlers when training is blocked', () => {
    const rules = groups({ AI_TRAINING_CRAWLERS: 'block' });
    for (const agent of aiTrainingCrawlers)
      expect(groupFor(rules, agent)).toEqual({
        userAgent: aiTrainingCrawlers,
        disallow: '/',
      });
    expect(groupFor(rules, 'OAI-SearchBot')).toMatchObject({ allow: '/' });
    expect(groupFor(rules, 'Google-Extended')).toMatchObject({ allow: '/' });
  });

  it('treats Google-Extended as its own switch', () => {
    const rules = groups({ GOOGLE_EXTENDED: 'BLOCK' });
    expect(groupFor(rules, 'Google-Extended')).toEqual({
      userAgent: ['Google-Extended'],
      disallow: '/',
    });
    expect(groupFor(rules, 'GPTBot')).toMatchObject({ allow: '/' });
  });

  it('never names Googlebot or Bingbot, so they always follow the * group', () => {
    const named = groups({
      AI_SEARCH_CRAWLERS: 'block',
      AI_TRAINING_CRAWLERS: 'block',
      GOOGLE_EXTENDED: 'block',
    }).flatMap((r) => [r.userAgent].flat());
    expect(named).not.toContain('Googlebot');
    expect(named).not.toContain('Bingbot');
  });
});
