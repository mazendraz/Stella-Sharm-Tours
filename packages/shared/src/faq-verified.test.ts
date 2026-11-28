import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifiedFaqFile } from './faq-verified';

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const file = verifiedFaqFile.parse(
  read('../../../data/content/faq-verified.json'),
);
const guides = (
  read('../../../data/content/guides-draft.json') as {
    pages: { slug: string }[];
  }
).pages.map((p) => p.slug);

describe('re-verified FAQ answers', () => {
  it('has seven languages, no prices and no unconfirmed facts', () => {
    expect(file.items.length).toBeGreaterThan(0);
  });
  it('gives every question exactly one home that exists', () => {
    const candidates = file.items.map((i) => i.candidate);
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const item of file.items)
      expect(item.home === 'faq' || guides.includes(item.home)).toBe(true);
  });
  it('rejects a price or a [CONFIRM] marker in any language', () => {
    const item = file.items[0]!;
    for (const a of [
      { ...item.a, it: 'Costa €35.' },
      { ...item.a, fr: 'Prix [CONFIRM: montant].' },
      { ...item.a, de: undefined },
    ])
      expect(
        verifiedFaqFile.safeParse({ ...file, items: [{ ...item, a }] }).success,
      ).toBe(false);
  });
});
