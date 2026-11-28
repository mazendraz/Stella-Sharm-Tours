import { describe, expect, it } from 'vitest';
import {
  defaultSeoDescription,
  defaultSeoTitle,
  descriptionMax,
  leadPrice,
  seoLocales,
  titleMax,
  type SeoInput,
} from './seo-defaults';

const boat: SeoInput = {
  locale: 'en',
  title: 'Ras Mohammed & White Island by Boat',
  highlights: ['Yacht cruise', '2 snorkelling stops', 'White Island visit'],
  duration: 'Full day',
  departure: '07:45',
  price: { amount: 35, unit: 'person' },
  place: 'from',
};

describe('SEO defaults', () => {
  it('builds a title and description from published facts only', () => {
    expect(defaultSeoTitle(boat)).toBe(
      'Ras Mohammed & White Island by Boat from Sharm El Sheikh',
    );
    expect(defaultSeoDescription(boat)).toBe(
      'Ras Mohammed & White Island by Boat from Sharm El Sheikh: yacht cruise, 2 snorkelling stops, White Island visit. Full day, departs 07:45. From €35 per person.',
    );
  });

  it('writes Italian naturally and keeps names capitalized', () => {
    const it_ = defaultSeoDescription({
      ...boat,
      locale: 'it',
      title: 'Ras Mohammed e White Island in barca',
      highlights: [
        'Crociera in yacht',
        '2 soste per lo snorkeling',
        'Visita a White Island',
      ],
      duration: 'Intera giornata',
    });
    expect(it_).toContain('da Sharm El Sheikh: crociera in yacht');
    expect(it_).toContain('Da €35 a persona.');
  });

  it('never states a price for trips on request', () => {
    for (const locale of seoLocales) {
      const text = defaultSeoDescription({ ...boat, locale, price: null });
      expect(text).not.toMatch(/\d+\s?€|€\s?\d/);
    }
  });

  it('ignores departure labels that are not times', () => {
    const text = defaultSeoDescription({ ...boat, departure: 'On request' });
    expect(text).not.toContain('On request');
  });

  it('does not repeat Sharm when the title already names it', () => {
    expect(
      defaultSeoTitle({ ...boat, title: 'Sharm City Tour', place: 'in' }),
    ).toBe('Sharm City Tour');
  });

  it('stays within length limits in every language', () => {
    const long = {
      ...boat,
      title: 'A very long excursion title that already uses most of the room',
      highlights: Array.from({ length: 8 }, (_, i) => `Highlight number ${i}`),
    };
    for (const locale of seoLocales) {
      expect(defaultSeoTitle({ ...long, locale }).length).toBeLessThanOrEqual(
        Math.max(titleMax, long.title.length),
      );
      expect(
        defaultSeoDescription({ ...long, locale }).length,
      ).toBeLessThanOrEqual(descriptionMax);
    }
  });

  it('picks the primary or lowest adult price, never a child price', () => {
    expect(
      leadPrice([
        { amount_eur: 10, unit: 'child' },
        { amount_eur: 40, unit: 'person' },
        { amount_eur: 30, unit: 'person' },
      ]),
    ).toEqual({ amount: 30, unit: 'person' });
    expect(leadPrice([{ amount_eur: null, unit: 'person' }])).toBeNull();
  });
});
