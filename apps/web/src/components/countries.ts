export { bookingPhoneCountries as countries } from '@stella/shared/phone';

// Most likely countries for each site language, shown first.
export const popular: Record<string, string[]> = {
  en: ['GB', 'IE', 'US', 'EG'],
  it: ['IT', 'CH'],
  es: ['ES', 'MX', 'AR'],
  fr: ['FR', 'BE', 'CH'],
  de: ['DE', 'AT', 'CH'],
  ru: ['RU', 'UA', 'BY', 'KZ'],
  tr: ['TR'],
};

export const flag = (iso: string) =>
  String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)));
