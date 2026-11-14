import { expect, it } from 'vitest';
import { csvCell } from './csv';
it('neutralizes formulas hidden behind whitespace, control characters and quote breaks', () => {
  for (const value of [
    '=1+2',
    '+1',
    '-1',
    '@SUM(1,2)',
    ' =1',
    '\t=1',
    '\r=1',
    '\n=1',
    '\ufeff=1',
  ])
    expect(csvCell(value).startsWith('"\'')).toBe(true);
  expect(csvCell('=HYPERLINK("https://invalid.test")')).toBe(
    '"\'=HYPERLINK(""https://invalid.test"")"',
  );
  expect(csvCell('Normal name')).toBe('"Normal name"');
  expect(csvCell(null)).toBe('""');
});
