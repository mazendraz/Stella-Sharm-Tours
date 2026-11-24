import { describe, expect, it } from 'vitest';
import { locales } from '../index';
import { formatPriceChanges, priceReportCopy } from './price-report';

const tripId = '11111111-1111-4111-8111-111111111111';
const titles = new Map([
  [tripId, { en: 'Tiran Island by Boat', it: 'Isola di Tiran in barca' }],
]);
const rows = [
  {
    at: '2026-11-20T08:00:00Z',
    entity: 'trip_prices',
    entity_id: tripId,
    before: [
      { id: 'a', amountEur: '35.00', label: null },
      { id: 'b', amountEur: '20.00', label: { en: 'Child' } },
    ],
    after: [
      { id: 'a', amountEur: 40, label: null },
      { id: 'c', amountEur: null, label: { en: 'Private boat' } },
    ],
  },
  {
    at: '2026-11-21T08:00:00Z',
    entity: 'trip',
    entity_id: tripId,
    before: { values: { privateSurchargePct: null } },
    after: { privateSurchargePct: '30' },
  },
];

describe('weekly owner price report (audit BUG-03)', () => {
  it('has every string in all seven core languages, distinct from English', () => {
    for (const locale of locales) {
      const copy = priceReportCopy[locale];
      for (const value of Object.values(copy))
        expect(value.trim()).not.toBe('');
      if (locale !== 'en') {
        expect(copy.subject).not.toBe(priceReportCopy.en.subject);
        expect(copy.budgetSubject).not.toBe(priceReportCopy.en.budgetSubject);
        expect(copy.budgetBody).not.toBe(priceReportCopy.en.budgetBody);
      }
    }
  });
  it('renders readable changes instead of raw JSON', () => {
    const body = formatPriceChanges(rows, titles, 'en');
    expect(body).not.toContain('{');
    expect(body).not.toContain('trip_prices');
    expect(body).toContain('Tiran Island by Boat');
    expect(body).toMatch(/Price: €35(\.00)? → €40/);
    expect(body).toMatch(/Child: removed \(€20/);
    expect(body).toContain('Private boat: added (On request)');
    expect(body).toContain('Private surcharge: none → 30 %');
  });
  it('localizes titles, labels and words', () => {
    const it_ = formatPriceChanges(rows, titles, 'it');
    expect(it_).toContain('Isola di Tiran in barca');
    expect(it_).toContain('Su richiesta');
    expect(it_).toContain('Supplemento privato');
    const ru = formatPriceChanges(rows, titles, 'ru');
    expect(ru).toContain('По запросу');
    expect(ru).toContain('Tiran Island by Boat'); // EN fallback for a missing title
  });
  it('skips unchanged surcharges and reports detail-only price edits', () => {
    const body = formatPriceChanges(
      [
        { ...rows[1]!, after: { privateSurchargePct: null } },
        { ...rows[0]!, after: rows[0]!.before },
      ],
      titles,
      'de',
    );
    expect(body).not.toContain('Privatzuschlag');
    expect(body).toContain('Preisdetails geändert');
  });
});
