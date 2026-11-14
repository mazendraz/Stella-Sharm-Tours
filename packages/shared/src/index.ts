export const locales = ['en', 'it', 'es', 'fr', 'de', 'ru', 'tr'] as const;
export type Locale = (typeof locales)[number];
export const isCoreLocale = (code: string): code is Locale =>
  (locales as readonly string[]).includes(code);
export const coreLocaleOptions = [
  { code: 'en', name: 'English', auto: false },
  { code: 'it', name: 'Italiano', auto: false },
  { code: 'es', name: 'Español', auto: false },
  { code: 'fr', name: 'Français', auto: false },
  { code: 'de', name: 'Deutsch', auto: false },
  { code: 'ru', name: 'Русский', auto: false },
  { code: 'tr', name: 'Türkçe', auto: false },
] as const;
export const phoneCountryCodes: Record<string, string> = {
  it: '+39',
  es: '+34',
  fr: '+33',
  de: '+49',
  ru: '+7',
  tr: '+90',
  pl: '+48',
  cs: '+420',
  sk: '+421',
  uk: '+380',
  ro: '+40',
  hu: '+36',
  nl: '+31',
  pt: '+351',
};
export const currency = 'EUR';
export const tripTimeZone = 'Africa/Cairo';
