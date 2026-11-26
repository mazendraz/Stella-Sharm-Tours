import { describe, expect, it } from 'vitest';
import { keywordsFrom, keywordsOut } from './search-keywords';

describe('search keyword editor state', () => {
  it('reads a stored value and tolerates null or invalid data', () => {
    expect(keywordsFrom({ en: ['quad'], extra: ['كواد'] })).toEqual({
      en: ['quad'],
      extra: ['كواد'],
    });
    expect(keywordsFrom(null)).toEqual({});
    expect(keywordsFrom({ xx: 1 })).toEqual({});
  });
  it('drops empty lists and saves null when nothing is left', () => {
    expect(keywordsOut({ en: [], it: ['barca'] })).toEqual({ it: ['barca'] });
    expect(keywordsOut({ en: [], extra: [] })).toBeNull();
    expect(keywordsOut({})).toBeNull();
  });
});
