import type { DisplayCurrency } from '../display-currency';
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

export function bookingEstimate(
  amount: number | null,
  known: number,
  locale: string,
  currency: DisplayCurrency = 'EUR',
) {
  const labels: Record<string, readonly [string, string, string]> = {
    en: ['Estimated total', 'On request', 'Subtotal for tours with prices'],
    it: [
      'Totale stimato',
      'Su richiesta',
      'Subtotale delle escursioni con prezzo',
    ],
    es: [
      'Total estimado',
      'Bajo petición',
      'Subtotal de las excursiones con precio',
    ],
    fr: ['Total estimé', 'Sur demande', 'Sous-total des excursions avec tarif'],
    de: [
      'Geschätzter Gesamtpreis',
      'Auf Anfrage',
      'Zwischensumme der Ausflüge mit Preis',
    ],
    ru: [
      'Ориентировочная стоимость',
      'По запросу',
      'Сумма по экскурсиям с указанной ценой',
    ],
    tr: [
      'Tahmini toplam',
      'Talep üzerine',
      'Fiyatı belli turların ara toplamı',
    ],
  };
  const [label, onRequest, subtotal] = labels[locale] ?? labels.en!;
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  if (amount !== null) return label + ': ' + money.format(amount);
  return [
    known > 0 ? subtotal + ': ' + money.format(known) : '',
    label + ': ' + onRequest,
  ]
    .filter(Boolean)
    .join('\n');
}
