import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '../../messages/en.json';
import itMessages from '../../messages/it.json';
import es from '../../messages/es.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import ru from '../../messages/ru.json';
import tr from '../../messages/tr.json';
import { whatsappMessage, whatsappPage } from './whatsapp-page';

describe('whatsappPage', () => {
  it('reads the page the guest is on from the URL', () => {
    expect(whatsappPage('/en/t/ras-mohammed')).toEqual({
      kind: 'trip',
      slug: 'ras-mohammed',
    });
    expect(whatsappPage('/de/c/sea-trips?x=1#top')).toEqual({
      kind: 'collection',
      slug: 'sea-trips',
    });
    expect(whatsappPage('/ru/my-trip')).toEqual({ kind: 'myTrip' });
    expect(whatsappPage('/fr/request/done/STL-AB12C')).toEqual({
      kind: 'request',
      ref: 'STL-AB12C',
    });
    expect(whatsappPage('/it/faq')).toEqual({ kind: 'faq' });
    for (const path of ['/', '/en', '/en/contact', '/tr/legal/privacy'])
      expect(whatsappPage(path)).toEqual({ kind: 'general' });
  });
  it('ignores values that are not a slug or request reference', () => {
    expect(whatsappPage('/en/t/Bad%20Slug')).toEqual({ kind: 'general' });
    expect(whatsappPage('/en/request/done/<script>')).toEqual({
      kind: 'general',
    });
  });
});

describe('whatsappMessage', () => {
  const locales = { en, it: itMessages, es, fr, de, ru, tr };
  it('writes a page-specific message in all seven core languages', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      const t = createTranslator({ locale, messages });
      const translate = (key: string, values?: Record<string, string>) =>
        t(key as never, values as never);
      const trip = whatsappMessage({ kind: 'trip', slug: 'x' }, translate, {
        title: 'Ras Mohammed',
        url: 'https://example.test/' + locale + '/t/x',
      });
      expect(trip).toContain('Ras Mohammed');
      expect(trip.endsWith('\nhttps://example.test/' + locale + '/t/x')).toBe(
        true,
      );
      expect(
        whatsappMessage({ kind: 'myTrip' }, translate, {
          trips: ['Ras Mohammed', 'Tiran'],
        }),
      ).toContain('Ras Mohammed, Tiran');
      expect(
        whatsappMessage({ kind: 'request', ref: 'STL-AB12C' }, translate, {}),
      ).toContain('STL-AB12C');
      for (const text of [
        whatsappMessage({ kind: 'faq' }, translate, {}),
        whatsappMessage({ kind: 'general' }, translate, {}),
      ]) {
        expect(text).toContain('Stella Sharm Tours');
        expect(text).not.toMatch(/[{}]/);
      }
    }
  });
  it('falls back to the general message when the title is not known yet', () => {
    const t = createTranslator({ locale: 'en', messages: en });
    expect(
      whatsappMessage(
        { kind: 'trip', slug: 'x' },
        (key, values) => t(key as never, values as never),
        { title: null, url: null },
      ),
    ).toBe(en.waMsgGeneral);
  });
});
