import { describe, expect, it } from 'vitest';
import { collectionEditSchema, searchKeywordsSchema, seoSchema } from './admin';

describe('searchKeywordsSchema', () => {
  it('accepts per-language lists and an extra list', () => {
    expect(
      searchKeywordsSchema.parse({
        en: [' snorkel '],
        it: ['snorkeling'],
        extra: ['سنوركل'],
      }),
    ).toEqual({ en: ['snorkel'], it: ['snorkeling'], extra: ['سنوركل'] });
  });
  it('rejects unknown languages', () => {
    expect(searchKeywordsSchema.safeParse({ pl: ['x'] }).success).toBe(false);
  });
  it('rejects blank and over-long keywords', () => {
    expect(searchKeywordsSchema.safeParse({ en: ['  '] }).success).toBe(false);
    expect(
      searchKeywordsSchema.safeParse({ en: ['x'.repeat(61)] }).success,
    ).toBe(false);
  });
  it('rejects more than 30 keywords in one list', () => {
    const words = Array.from({ length: 31 }, (_, i) => 'w' + i);
    expect(searchKeywordsSchema.safeParse({ de: words }).success).toBe(false);
  });
  it('rejects case-insensitive duplicates', () => {
    expect(
      searchKeywordsSchema.safeParse({ en: ['Quad', 'quad'] }).success,
    ).toBe(false);
  });
  it('is part of the trip search section and the collection edit', () => {
    expect(seoSchema.parse({ searchKeywords: { en: ['a'] } })).toEqual({
      searchKeywords: { en: ['a'] },
    });
    expect(
      collectionEditSchema.parse({ searchKeywords: null }).searchKeywords,
    ).toBeNull();
  });
});
