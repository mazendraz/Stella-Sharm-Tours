import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  googleListingUrl,
  googleRating,
  guestQuotes,
  quotesFor,
} from './why-us-quotes';

type Source = {
  meta: {
    listingUrl: string;
    ratingAtCapture: number;
    reviewCountAtCapture: number;
  };
  reviews: {
    externalId: string;
    author: string;
    rating: number;
    text: string;
  }[];
};
const source = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../data/google-reviews.json', import.meta.url),
    ),
    'utf8',
  ),
) as Source;
const byId = new Map(source.reviews.map((r) => [r.externalId, r]));

describe('why-us guest quotes', () => {
  it('copies every quote verbatim from a real 5-star Google review', () => {
    for (const quotes of Object.values(guestQuotes)) {
      for (const q of quotes) {
        const review = byId.get(q.id);
        expect(review, q.author).toBeDefined();
        expect(q.text).toBe(review?.text);
        expect(q.author).toBe(review?.author);
        expect(review?.rating).toBe(5);
      }
    }
  });

  it('links to the Google listing from the source file', () => {
    expect(googleListingUrl).toBe(source.meta.listingUrl);
  });

  it('shows the rating and count captured from Google', () => {
    expect(googleRating.rating).toBe(source.meta.ratingAtCapture);
    expect(googleRating.count).toBe(source.meta.reviewCountAtCapture);
  });

  it('shows three quotes in every core language, English when none exist', () => {
    for (const locale of ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr']) {
      expect(quotesFor(locale)).toHaveLength(3);
    }
    expect(quotesFor('de')).toBe(guestQuotes.en);
    expect(quotesFor('pl')).toBe(guestQuotes.en);
  });
});
