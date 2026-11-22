import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { locales } from './index';
import { storySchema } from './story';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const assets = read('data/journeys/media.json');
const copy = read('data/journeys/copy.json');
const catalog = read('data/catalog.json');
const names = ['petra', 'cairo', 'alexandria', 'jerusalem', 'luxor', 'sinai'];
describe('journey imports', () => {
  it.each(names)(
    'validates every scene and editorial language for %s',
    (name) => {
      const journey = read('data/journeys/' + name + '.json');
      for (const slug of journey.programs)
        expect(
          catalog.trips.some((t: { slug: string }) => t.slug === slug),
        ).toBe(true);
      const scenes = journey.scenes.map(
        (s: {
          id: string;
          titleKey: string;
          captionKey: string;
          media: string;
        }) => {
          const title = copy.titles[s.titleKey],
            caption = copy.captions[s.captionKey];
          for (const locale of locales) {
            expect(title[locale]?.trim()).toBeTruthy();
            expect(caption[locale]?.trim()).toBeTruthy();
          }
          expect(assets[s.media]).toBeDefined();
          return { ...s, title, caption, mediaId: null, credit: '' };
        },
      );
      expect(storySchema.safeParse({ scenes }).success).toBe(true);
    },
  );
  it('binds documented sources to the reviewed files', () => {
    for (const [file, asset] of Object.entries(assets) as [
      string,
      {
        review: string;
        sha256: string;
        source: string;
        license: string;
        catalogAsset?: string;
      },
    ][]) {
      if (asset.review !== 'source-recorded' && !asset.catalogAsset) continue;
      if (!asset.catalogAsset) {
        expect(asset.source).toMatch(/^https?:\/\//);
        expect(asset.license).toBeTruthy();
      }
      expect(
        createHash('sha256')
          .update(readFileSync(asset.catalogAsset ?? 'assets/journeys/' + file))
          .digest('hex'),
      ).toBe(asset.sha256);
    }
  });
  it('preserves program differences and withheld clips', () => {
    const luxor = read('data/journeys/luxor.json'),
      alex = read('data/journeys/alexandria.json');
    expect(
      luxor.scenes.find((s: { id: string }) => s.id === 'kings').kind,
    ).toBe('illustrative');
    expect(
      alex.scenes.find((s: { id: string }) => s.id === 'reading-room').kind,
    ).toBe('illustrative');
    expect(read('data/journeys/cairo.json').programs).not.toContain(
      'cairo-plane-1-day',
    );
    for (const name of ['alexandria', 'cairo'])
      expect(
        JSON.stringify(read('data/journeys/' + name + '.json')),
      ).not.toMatch(/zenima|زنيمة/i);
    for (const file of ['v2-pyramids.mp4', 'dome-hd.mp4'])
      expect(assets[file].review).toBe('permission-required');
  });
});
