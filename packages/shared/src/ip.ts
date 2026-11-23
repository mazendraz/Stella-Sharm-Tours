import { isIP } from 'node:net';

function hextets(address: string): string[] {
  let value = address.split('%')[0]!.toLowerCase();
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted) {
    const [a, b, c, d] = dotted[1]!.split('.').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    value =
      value.slice(0, -dotted[1]!.length) +
      ((a << 8) | b).toString(16) +
      ':' +
      ((c << 8) | d).toString(16);
  }
  const [head, tail] = value.split('::');
  const start = head ? head.split(':') : [];
  if (tail === undefined) return start;
  const end = tail ? tail.split(':') : [];
  return [
    ...start,
    ...Array<string>(8 - start.length - end.length).fill('0'),
    ...end,
  ];
}

/**
 * The address used for rate limits and privacy hashes. IPv4 is kept as-is.
 * IPv6 is reduced to its /64 prefix: one subscriber normally controls a whole
 * /64, so per-address keys would let a single client rotate past every limit.
 */
export function rateLimitAddress(value: string): string {
  const address = value.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped && isIP(mapped[1]!) === 4) return mapped[1]!;
  if (isIP(address.split('%')[0]!) !== 6) return address;
  return (
    hextets(address)
      .slice(0, 4)
      .map((part) => part.replace(/^0+(?=.)/, ''))
      .join(':') + '::/64'
  );
}
