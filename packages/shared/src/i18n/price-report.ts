import type { Locale } from '../index';
type Copy = {
  subject: string;
  intro: string;
  price: string;
  added: string;
  removed: string;
  onRequest: string;
  surcharge: string;
  none: string;
  details: string;
  budgetSubject: string;
  budgetBody: string;
};
/**
 * Owner-facing price report and translation-budget notice, authored together
 * in all seven core languages (audit 2026-11-24 BUG-03). "On request" and
 * "Languages" match the website and dashboard wording.
 */
export const priceReportCopy: Record<Locale, Copy> = {
  en: {
    subject: 'Stella weekly price changes',
    intro: 'Price changes in the last 7 days:',
    price: 'Price',
    added: 'added',
    removed: 'removed',
    onRequest: 'On request',
    surcharge: 'Private surcharge',
    none: 'none',
    details: 'price details changed',
    budgetSubject: 'Stella translation paused',
    budgetBody:
      'The translation budget or free tier limit has been reached. Existing translations remain available. Review Languages in the dashboard.',
  },
  it: {
    subject: 'Variazioni di prezzo settimanali Stella',
    intro: 'Variazioni di prezzo negli ultimi 7 giorni:',
    price: 'Prezzo',
    added: 'aggiunto',
    removed: 'rimosso',
    onRequest: 'Su richiesta',
    surcharge: 'Supplemento privato',
    none: 'nessuno',
    details: 'dettagli del prezzo modificati',
    budgetSubject: 'Traduzione Stella in pausa',
    budgetBody:
      'È stato raggiunto il budget di traduzione o il limite del piano gratuito. Le traduzioni esistenti restano disponibili. Controlla Lingue nel pannello.',
  },
  es: {
    subject: 'Cambios de precios semanales de Stella',
    intro: 'Cambios de precio en los últimos 7 días:',
    price: 'Precio',
    added: 'añadido',
    removed: 'eliminado',
    onRequest: 'Bajo petición',
    surcharge: 'Suplemento privado',
    none: 'ninguno',
    details: 'detalles del precio modificados',
    budgetSubject: 'Traducción de Stella en pausa',
    budgetBody:
      'Se ha alcanzado el presupuesto de traducción o el límite del plan gratuito. Las traducciones existentes siguen disponibles. Revisa Idiomas en el panel.',
  },
  fr: {
    subject: 'Changements de prix hebdomadaires Stella',
    intro: 'Changements de prix des 7 derniers jours :',
    price: 'Prix',
    added: 'ajouté',
    removed: 'supprimé',
    onRequest: 'Sur demande',
    surcharge: 'Supplément privé',
    none: 'aucun',
    details: 'détails du prix modifiés',
    budgetSubject: 'Traduction Stella en pause',
    budgetBody:
      'Le budget de traduction ou la limite de l’offre gratuite est atteint. Les traductions existantes restent disponibles. Vérifiez Langues dans le tableau de bord.',
  },
  de: {
    subject: 'Wöchentliche Preisänderungen bei Stella',
    intro: 'Preisänderungen der letzten 7 Tage:',
    price: 'Preis',
    added: 'hinzugefügt',
    removed: 'entfernt',
    onRequest: 'Auf Anfrage',
    surcharge: 'Privatzuschlag',
    none: 'keiner',
    details: 'Preisdetails geändert',
    budgetSubject: 'Stella-Übersetzung pausiert',
    budgetBody:
      'Das Übersetzungsbudget oder das Limit des kostenlosen Tarifs ist erreicht. Vorhandene Übersetzungen bleiben verfügbar. Prüfen Sie Sprachen im Dashboard.',
  },
  ru: {
    subject: 'Еженедельные изменения цен Stella',
    intro: 'Изменения цен за последние 7 дней:',
    price: 'Цена',
    added: 'добавлена',
    removed: 'удалена',
    onRequest: 'По запросу',
    surcharge: 'Надбавка за индивидуальный тур',
    none: 'нет',
    details: 'изменены параметры цены',
    budgetSubject: 'Перевод Stella приостановлен',
    budgetBody:
      'Достигнут бюджет на перевод или лимит бесплатного тарифа. Имеющиеся переводы остаются доступными. Проверьте раздел «Языки» в панели управления.',
  },
  tr: {
    subject: 'Stella haftalık fiyat değişiklikleri',
    intro: 'Son 7 gündeki fiyat değişiklikleri:',
    price: 'Fiyat',
    added: 'eklendi',
    removed: 'kaldırıldı',
    onRequest: 'Talep üzerine',
    surcharge: 'Özel tur ek ücreti',
    none: 'yok',
    details: 'fiyat ayrıntıları değişti',
    budgetSubject: 'Stella çevirisi duraklatıldı',
    budgetBody:
      'Çeviri bütçesine veya ücretsiz plan sınırına ulaşıldı. Mevcut çeviriler kullanılmaya devam ediyor. Paneldeki Diller bölümünü kontrol edin.',
  },
};

export type PriceAuditRow = {
  at: Date | string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
};
type Localized = Partial<Record<string, string>> | null | undefined;
type PriceRow = { id?: unknown; amountEur?: unknown; label?: Localized };

const text = (value: Localized, locale: Locale) =>
  value?.[locale] || value?.en || '';
const amount = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : Number(value);
function priceRows(value: unknown): PriceRow[] {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray((value as { rows?: unknown })?.rows)
      ? (value as { rows: unknown[] }).rows
      : [];
  return rows.filter(
    (row): row is PriceRow =>
      !!row &&
      typeof row === 'object' &&
      typeof (row as PriceRow).id === 'string',
  );
}
function surcharge(value: unknown): number | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const direct = value as Record<string, unknown>,
    nested = direct.values as Record<string, unknown> | undefined;
  const raw =
    'privateSurchargePct' in direct
      ? direct.privateSurchargePct
      : nested && 'privateSurchargePct' in nested
        ? nested.privateSurchargePct
        : undefined;
  return raw === undefined ? undefined : amount(raw);
}

/** Readable, localized lines for the weekly owner price report. */
export function formatPriceChanges(
  rows: readonly PriceAuditRow[],
  titles: ReadonlyMap<string, Localized>,
  locale: Locale,
): string {
  const copy = priceReportCopy[locale];
  const euro = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  });
  const money = (value: number | null) =>
    value === null ? copy.onRequest : euro.format(value);
  const lines: string[] = [copy.intro, ''];
  for (const row of rows) {
    const title = text(titles.get(row.entity_id ?? ''), locale) || copy.price;
    const when = date.format(new Date(row.at));
    if (row.entity === 'trip') {
      const from = surcharge(row.before),
        to = surcharge(row.after);
      if (to === undefined || from === to) continue;
      const pct = (value: number | null | undefined) =>
        value === null || value === undefined ? copy.none : value + ' %';
      lines.push(
        `${when} · ${title} — ${copy.surcharge}: ${pct(from)} → ${pct(to)}`,
      );
      continue;
    }
    const before = new Map(
        priceRows(row.before).map((p) => [p.id as string, p]),
      ),
      after = new Map(priceRows(row.after).map((p) => [p.id as string, p]));
    const changes: string[] = [];
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const old = before.get(id),
        next = after.get(id),
        label = text((next ?? old)?.label, locale) || copy.price;
      if (old && next) {
        const a = amount(old.amountEur),
          b = amount(next.amountEur);
        if (a !== b) changes.push(`${label}: ${money(a)} → ${money(b)}`);
      } else if (next)
        changes.push(
          `${label}: ${copy.added} (${money(amount(next.amountEur))})`,
        );
      else if (old)
        changes.push(
          `${label}: ${copy.removed} (${money(amount(old.amountEur))})`,
        );
    }
    lines.push(
      `${when} · ${title} — ${changes.length ? changes.join('; ') : copy.details}`,
    );
  }
  return lines.join('\n');
}
