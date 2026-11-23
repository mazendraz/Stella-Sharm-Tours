import { describe, expect, it } from 'vitest';
import { rateLimitAddress } from './ip';

describe('rateLimitAddress', () => {
  it('keeps IPv4 and unwraps IPv4-mapped IPv6', () => {
    expect(rateLimitAddress('203.0.113.9')).toBe('203.0.113.9');
    expect(rateLimitAddress('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });
  it('groups every address of one IPv6 /64 together', () => {
    const a = rateLimitAddress('2001:db8:aa:1::1');
    expect(a).toBe('2001:db8:aa:1::/64');
    expect(rateLimitAddress('2001:0db8:00aa:0001:ffff:1:2:3')).toBe(a);
    expect(rateLimitAddress('2001:db8:aa:2::1')).not.toBe(a);
    expect(rateLimitAddress('::1')).toBe('0:0:0:0::/64');
    expect(rateLimitAddress('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });
  it('passes through values that are not addresses', () => {
    expect(rateLimitAddress('unknown')).toBe('unknown');
  });
});
