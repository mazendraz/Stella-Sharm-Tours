import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
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
      ...JSON.parse(await readFile('data/i18n/admin-rebuild.json', 'utf8')),
      ...JSON.parse(await readFile('data/i18n/admin-seo.json', 'utf8')),
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
  it('defines every static key the dashboard UI asks for', async () => {
    const dictionary = JSON.parse(
      await readFile('apps/admin/messages/en.json', 'utf8'),
    ) as Record<string, string>;
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true }))
        if (entry.isDirectory()) await walk(join(dir, entry.name));
        else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
          files.push(join(dir, entry.name));
    };
    await walk('apps/admin/src');
    const missing = new Set<string>();
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const match of text.matchAll(
        /(?<![\w.])(t|tp)\(\s*'([A-Za-z0-9_.]+)'/g,
      )) {
        const key = match[2]!;
        if (key.endsWith('_')) continue;
        const ok =
          match[1] === 'tp' ? key + '.other' in dictionary : key in dictionary;
        if (!ok) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
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
