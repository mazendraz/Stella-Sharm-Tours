import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { locales } from '@stella/shared';
import { isPushEndpoint, pushSubscriptionSchema } from '../../../api/src/push';
import { content } from './content';
describe('admin authored languages and push boundaries', () => {
  it('keeps the original resolved label from a historical booking price snapshot', () => {
    expect(content({ text: 'Adulte', lang: 'fr', origin: 'human' }, 'en')).toBe(
      'Adulte',
    );
    expect(content(null, 'en')).toBe('');
  });
  it('keeps every authored dashboard key in all seven dictionaries without blank values', async () => {
    const source = {
      ...JSON.parse(await readFile('data/i18n/admin-ui.json', 'utf8')),
      ...JSON.parse(await readFile('data/i18n/admin-fields.json', 'utf8')),
    };
    for (const [index, locale] of locales.entries()) {
      const dictionary = JSON.parse(
        await readFile(`apps/admin/messages/${locale}.json`, 'utf8'),
      );
      expect(Object.keys(dictionary).sort()).toEqual(
        Object.keys(source).sort(),
      );
      for (const [key, values] of Object.entries(source)) {
        expect(dictionary[key]).toBe((values as string[])[index]);
        expect(String(dictionary[key]).trim().length).toBeGreaterThan(0);
      }
    }
  });
  it('rejects arbitrary/loopback push destinations and malformed subscriptions', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/test',
      'https://127.0.0.1/private',
      'https://localhost/push',
      'https://fcm.googleapis.com.attacker.test/push',
      'https://fcm.googleapis.com@attacker.test/push',
      'https://fcm.googleapis.com:8443/push',
    ])
      expect(isPushEndpoint(endpoint)).toBe(false);
    expect(
      isPushEndpoint('https://fcm.googleapis.com/fcm/send/synthetic'),
    ).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { auth: 'bad', p256dh: 'bad' },
      }).success,
    ).toBe(false);
  });
});
