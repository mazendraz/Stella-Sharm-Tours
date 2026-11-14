import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  can,
  roles,
  permissions,
  basicsSchema,
  heroSchema,
} from '@stella/shared/admin';
import { resolveText } from '@stella/shared/i18n/resolve';
import { requestRef } from './requests';
import { seal, unseal, passwordHash } from './auth';
import { verify } from '@node-rs/argon2';
import {
  durationFacts,
  runDays,
  splitNotes,
} from '../../../packages/db/src/normalize';
import { protectText } from './translate';
import { inside, runTool } from './media';
import { liveLocales } from './catalog';
describe('authorization policy', () => {
  for (const role of roles)
    for (const action of Object.keys(
      permissions,
    ) as (keyof typeof permissions)[])
      it(`${role}: ${action}`, () => {
        const expected: Record<string, string[]> = {
          requests: ['owner', 'manager', 'sales'],
          export: ['owner', 'manager'],
          content: ['owner', 'manager', 'editor'],
          prices: ['owner', 'manager'],
          publish: ['owner', 'manager'],
          heroDraft: ['owner', 'manager', 'editor'],
          heroLive: ['owner', 'manager'],
          translations: ['owner', 'manager', 'editor'],
          languages: ['owner', 'manager'],
          settings: ['owner'],
          users: ['owner'],
          audit: ['owner', 'manager'],
        };
        expect(can(role, action)).toBe(expected[action]!.includes(role));
      });
  it('rejects publication/price escalation through content bodies', () => {
    expect(
      basicsSchema.safeParse({
        status: 'published',
        prices: [{ amountEur: 1 }],
      }).success,
    ).toBe(false);
    expect(heroSchema.safeParse({ status: 'published' }).success).toBe(false);
    expect(
      heroSchema.safeParse({ ctaTarget: 'https://attacker.example' }).success,
    ).toBe(false);
  });
});
describe('security primitives and source normalization', () => {
  it('keeps app credentials out of actual codec subprocess environments', async () => {
    for (const key of [
      'DATABASE_URL',
      'SESSION_SECRET',
      'TOTP_ENC_KEY',
      'SMTP_PASSWORD',
      'DEEPL_API_KEY',
      'NODE_OPTIONS',
    ])
      vi.stubEnv(key, 'synthetic-private-value');
    try {
      const result = JSON.parse(
        await runTool(process.execPath, [
          '-e',
          "console.log(JSON.stringify(['DATABASE_URL','SESSION_SECRET','TOTP_ENC_KEY','SMTP_PASSWORD','DEEPL_API_KEY','NODE_OPTIONS'].map(key=>Boolean(process.env[key]))))",
        ]),
      );
      expect(result).toEqual([false, false, false, false, false, false]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('uses Argon2id and verifies without storing the password', async () => {
    const password = randomBytes(24).toString('base64url'),
      encoded = await passwordHash(password);
    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verify(encoded, password)).toBe(true);
    expect(await verify(encoded, 'incorrect')).toBe(false);
  });
  it('binds encrypted TOTP to its user and rejects tampering', () => {
    const key = randomBytes(32).toString('base64'),
      enc = seal('TESTSECRET', key, 'user-a');
    expect(unseal(enc, key, 'user-a')).toBe('TESTSECRET');
    expect(() => unseal(enc, key, 'user-b')).toThrow();
    const corrupted = Buffer.from(enc);
    corrupted[20] = corrupted[20]! ^ 1;
    expect(() => unseal(corrupted, key, 'user-a')).toThrow();
  });
  it('generates unpredictable Crockford references', () => {
    const refs = Array.from({ length: 1000 }, requestRef);
    expect(new Set(refs).size).toBe(1000);
    refs.forEach((ref) => expect(ref).toMatch(/^STL-[0-9A-HJKMNP-TV-Z]{10}$/));
  });
  it('resolves human core, edited auto, stale machine and English in order', () => {
    const value = { en: 'Sea', it: 'Mare' };
    expect(
      resolveText(value, 'it', [
        { locale: 'it', origin: 'machine', text: 'wrong' },
      ])?.text,
    ).toBe('Mare');
    expect(
      resolveText(value, 'pl', [
        { locale: 'pl', origin: 'machine', text: 'machine' },
        { locale: 'pl', origin: 'human', text: 'edited' },
      ])?.text,
    ).toBe('edited');
    expect(
      resolveText(value, 'de', [
        { locale: 'de', origin: 'machine', text: 'Meer', sourceHash: 'old' },
      ])?.lang,
    ).toBe('de');
    expect(resolveText(value, 'tr')).toEqual({
      text: 'Sea',
      lang: 'en',
      fallback: true,
    });
  });
  it('normalizes only known schedule/duration facts', () => {
    expect(durationFacts('~5½ h')).toEqual({
      daysCount: 1,
      durationMinutes: 330,
      overnight: false,
    });
    expect(durationFacts('Full day').durationMinutes).toBeNull();
    expect(durationFacts('2 days · 1 night').daysCount).toBe(2);
    expect(runDays('Sunday · Wednesday · Friday')).toEqual([0, 3, 5]);
    expect(runDays('On request')).toBeNull();
    expect(
      splitNotes(['Resolved: €250, confirm', 'Timing may vary']).public,
    ).toEqual(['Timing may vary']);
  });
  it('protects names, numeric facts and ICU grammar', () => {
    const source =
      'Stella at 12:30: {count, plural, one {# trip} other {# trips}}';
    const p = protectText(source, ['Stella']);
    expect(p.text).not.toContain('12:30');
    expect(p.text).not.toContain('Stella');
    expect(p.restore('[pl] ' + p.text)).toBe('[pl] ' + source);
    expect(() => p.restore('missing')).toThrow();
    expect(() => p.restore('<script>' + p.text + '</script>')).toThrow();
    expect(p.text).toContain('trip');
    expect(() => p.restore('{injected} ' + p.text)).toThrow();
    expect(() => p.restore('100 ' + p.text)).toThrow();
  });
  it('keeps storage paths inside their configured root', () => {
    expect(() => inside('/tmp/stella', '../outside')).toThrow();
    expect(() => inside('/tmp/stella', '../../outside')).toThrow();
  });
});
describe('live public locales', () => {
  const core = ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr'];
  it('always lists the seven core locales, even with no settings', () => {
    expect(liveLocales({}).map((l) => l.code)).toEqual(core);
  });
  it('adds only covered auto locales when a provider is available', () => {
    const settings = {
      i18n: {
        auto: ['pl', 'ar', 'zh', 'it'],
        auto_live_min_coverage: 0.95,
        indexable_auto: false,
      },
      i18n_runtime: {
        providers_available: true,
        coverage: { pl: 1, ar: 0.96, zh: 0.5, it: 1 },
      },
    };
    const live = liveLocales(settings);
    expect(live.map((l) => l.code)).toEqual([...core, 'pl', 'ar']);
    const ar = live.find((l) => l.code === 'ar')!;
    expect(ar).toMatchObject({ auto: true, indexable: false, dir: 'rtl' });
    expect(live.find((l) => l.code === 'en')).toMatchObject({
      indexable: true,
    });
  });
  it('hides auto locales without a configured provider', () => {
    expect(
      liveLocales({
        i18n: { auto: ['pl'] },
        i18n_runtime: { providers_available: false, coverage: { pl: 1 } },
      }).map((l) => l.code),
    ).toEqual(core);
  });
});
