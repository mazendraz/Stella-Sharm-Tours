import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

export const bookingPhoneCountries = getCountries().map(
  (country): [string, string] => [
    country,
    '+' + getCountryCallingCode(country),
  ],
);

export function normalizeBookingPhone(value: string, country?: string) {
  if (value.length > 48) return null;
  const digits = value
    .normalize('NFKC')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[\s().\p{Pd}\u200e\u200f\u061c]/gu, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  const defaultCountry =
    country && isSupportedCountry(country as CountryCode)
      ? (country as CountryCode)
      : undefined;
  const parse = (number: string) => {
    const parsed = parsePhoneNumberFromString(number, {
      ...(defaultCountry ? { defaultCountry } : {}),
      extract: false,
    });
    return parsed?.isValid() ? parsed.number : null;
  };
  if (digits.startsWith('+')) return parse(digits);
  // A pasted 00 prefix can be valid even if the selected country dials abroad
  // with a different prefix.
  const fromCountry = defaultCountry ? parse(digits) : null;
  return (
    fromCountry ??
    (digits.startsWith('00') ? parse('+' + digits.slice(2)) : null)
  );
}
