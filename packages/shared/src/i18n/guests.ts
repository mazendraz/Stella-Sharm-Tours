export function bookingArea(area: string, locale: string) {
  return area === 'Other'
    ? ((
        {
          en: 'Other',
          it: 'Altro',
          es: 'Otro',
          fr: 'Autre',
          de: 'Sonstiges',
          ru: 'Другое',
          tr: 'Diğer',
        } as Record<string, string>
      )[locale] ?? 'Other')
    : area;
}
export function bookingGuests(
  adults: number,
  children: number,
  locale: string,
) {
  const words: Record<string, readonly [string, string, string, string]> = {
    en: ['adult', 'adults', 'child', 'children'],
    it: ['adulto', 'adulti', 'bambino', 'bambini'],
    es: ['adulto', 'adultos', 'niño', 'niños'],
    fr: ['adulte', 'adultes', 'enfant', 'enfants'],
    de: ['Erwachsener', 'Erwachsene', 'Kind', 'Kinder'],
    tr: ['yetişkin', 'yetişkin', 'çocuk', 'çocuk'],
  };
  if (locale === 'ru') {
    const form = (count: number, one: string, few: string, many: string) =>
      count % 10 === 1 && count % 100 !== 11
        ? one
        : count % 10 >= 2 &&
            count % 10 <= 4 &&
            (count % 100 < 12 || count % 100 > 14)
          ? few
          : many;
    return `${adults} ${form(adults, 'взрослый', 'взрослых', 'взрослых')} · ${children} ${form(children, 'ребёнок', 'ребёнка', 'детей')}`;
  }
  const labels = words[locale] ?? words.en!;
  return `${adults} ${labels[adults === 1 ? 0 : 1]} · ${children} ${labels[children === 1 ? 2 : 3]}`;
}
