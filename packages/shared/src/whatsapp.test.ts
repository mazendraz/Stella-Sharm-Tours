import { expect, it } from 'vitest';
import { whatsappNumberFor } from './whatsapp';

const contacts = {
  whatsapp_primary: '+201069012881',
  whatsapp_secondary: '+201008605904',
};

it('sends EN, FR, ES and DE visitors to the main line', () => {
  for (const locale of ['en', 'fr', 'es', 'de'])
    expect(whatsappNumberFor(locale, contacts)).toBe('+201069012881');
});

it('sends IT, RU and TR visitors to the second line', () => {
  for (const locale of ['it', 'ru', 'tr', 'IT', 'ru-RU'])
    expect(whatsappNumberFor(locale, contacts)).toBe('+201008605904');
});

it('uses the main line for machine-translated languages', () => {
  for (const locale of ['ar', 'pl', 'zh', 'nl'])
    expect(whatsappNumberFor(locale, contacts)).toBe('+201069012881');
});

it('falls back to the main line when the second line is empty', () => {
  for (const secondary of [null, '', undefined])
    expect(
      whatsappNumberFor('it', { ...contacts, whatsapp_secondary: secondary }),
    ).toBe('+201069012881');
  expect(whatsappNumberFor('en', null)).toBeNull();
});
