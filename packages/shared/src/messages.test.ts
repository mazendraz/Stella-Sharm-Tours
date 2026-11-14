import { describe, it, expect } from 'vitest';
import en from '../../../apps/web/messages/en.json';
import itMessages from '../../../apps/web/messages/it.json';
import es from '../../../apps/web/messages/es.json';
import ru from '../../../apps/web/messages/ru.json';
import fr from '../../../apps/web/messages/fr.json';
import de from '../../../apps/web/messages/de.json';
import tr from '../../../apps/web/messages/tr.json';
import { locales, phoneCountryCodes } from './index';
describe('core translations', () => {
  it('has identical keys across all seven core locales', () => {
    for (const messages of [itMessages, es, fr, de, ru, tr])
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
  });
  it('keeps French, German and Turkish core with correct phone defaults and casing', () => {
    expect(locales).toEqual(['en', 'it', 'es', 'fr', 'de', 'ru', 'tr']);
    expect([
      phoneCountryCodes.fr,
      phoneCountryCodes.de,
      phoneCountryCodes.tr,
    ]).toEqual(['+33', '+49', '+90']);
    expect('iletişim'.toLocaleUpperCase('tr')).toBe('İLETİŞİM');
    expect([0, 1, 2].map((n) => new Intl.PluralRules('fr').select(n))).toEqual([
      'one',
      'one',
      'other',
    ]);
    expect([1, 2].map((n) => new Intl.PluralRules('tr').select(n))).toEqual([
      'one',
      'other',
    ]);
  });
  it('preserves the intended Slavic plural categories', () => {
    expect([1, 2, 5].map((n) => new Intl.PluralRules('ru').select(n))).toEqual([
      'one',
      'few',
      'many',
    ]);
    expect([1, 2, 5].map((n) => new Intl.PluralRules('pl').select(n))).toEqual([
      'one',
      'few',
      'many',
    ]);
    expect([1, 2, 5].map((n) => new Intl.PluralRules('cs').select(n))).toEqual([
      'one',
      'few',
      'other',
    ]);
  });
});
