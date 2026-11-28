import { describe, expect, it } from 'vitest';
import {
  displayCurrencyFor,
  formatPrice,
  isDisplayCurrency,
} from './display-currency';

describe('displayCurrencyFor', () => {
  it('follows the device region on English pages', () => {
    expect(displayCurrencyFor('en', 'en-GB,en;q=0.9')).toBe('GBP');
    expect(displayCurrencyFor('en', 'en-US,en;q=0.9')).toBe('USD');
    expect(displayCurrencyFor('en', 'en-us')).toBe('USD');
    expect(displayCurrencyFor('en', 'en-AU,en;q=0.9')).toBe('EUR');
    expect(displayCurrencyFor('en', 'en')).toBe('EUR');
    expect(displayCurrencyFor('en', null)).toBe('EUR');
  });

  it('uses the most preferred English variant', () => {
    expect(displayCurrencyFor('en', 'de-DE,en-GB;q=0.8,en-US;q=0.9')).toBe(
      'USD',
    );
    expect(displayCurrencyFor('en', 'it-IT,en-GB;q=0.5')).toBe('GBP');
    expect(displayCurrencyFor('en', 'en-US;q=0,en-GB;q=0.4')).toBe('GBP');
  });

  it('shows euros on every other language', () => {
    for (const locale of ['it', 'es', 'fr', 'de', 'ru', 'tr', 'ar', 'pl'])
      expect(displayCurrencyFor(locale, 'en-GB,en-US')).toBe('EUR');
  });
});

describe('formatPrice', () => {
  it('changes the sign, never the amount', () => {
    expect(formatPrice(25, 'en', 'EUR')).toBe('€25');
    expect(formatPrice(25, 'en', 'GBP')).toBe('£25');
    expect(formatPrice(25, 'en', 'USD')).toBe('$25');
  });

  it('accepts only the three display currencies', () => {
    expect(isDisplayCurrency('GBP')).toBe(true);
    expect(isDisplayCurrency('EGP')).toBe(false);
    expect(isDisplayCurrency(undefined)).toBe(false);
  });
});

describe('staff estimate', () => {
  it('quotes the request in the currency the customer saw', async () => {
    const { bookingEstimate } = await import('./i18n/guests');
    expect(bookingEstimate(50, 0, 'en', 'GBP')).toBe('Estimated total: £50');
    expect(bookingEstimate(50, 0, 'en')).toBe('Estimated total: €50');
  });
});
