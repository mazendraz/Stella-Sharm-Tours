import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import content from '../../../../data/i18n/core-content.json';
import { locales } from '../index';
import { bundledCoreText, coreContentSources } from './core-content';
import { bookingGuests } from './guests';
describe('repository-authored seven-language content', () => {
  it('pins the English source order used by the translation rows', () => {
    expect(
      createHash('sha256')
        .update(JSON.stringify(coreContentSources))
        .digest('hex'),
    ).toBe(content.sourceSha256);
  });
  it('covers every source and preserves all numeric facts in all seven languages', () => {
    const numbers = (text: string) =>
      (text.match(/\d+(?:[.:]\d+)*(?:[½¾])?/g) ?? []).sort();
    for (const source of coreContentSources)
      for (const locale of locales) {
        const translated = bundledCoreText(source, locale);
        expect(translated, locale + ': ' + source).not.toBeNull();
        expect(numbers(translated!)).toEqual(numbers(source));
      }
  });
  it('returns no translation for new source copy instead of inventing content', () => {
    expect(bundledCoreText('A new staff-edited trip title', 'de')).toBeNull();
  });
  it('formats confirmation guests with correct singular/plural forms', () => {
    expect(bookingGuests(1, 0, 'en')).toBe('1 adult · 0 children');
    expect(bookingGuests(2, 1, 'it')).toBe('2 adulti · 1 bambino');
    expect(bookingGuests(1, 2, 'ru')).toBe('1 взрослый · 2 ребёнка');
    expect(bookingGuests(3, 5, 'ru')).toBe('3 взрослых · 5 детей');
    expect(bookingGuests(1, 0, 'tr')).toBe('1 yetişkin · 0 çocuk');
  });
});
