/**
 * Which WhatsApp line a visitor is sent to, by site language (owner,
 * 2026-11-26): Italian, Russian and Turkish speakers go to the second line
 * (settings `contacts.whatsapp_secondary`); English, French, Spanish, German
 * and every other language go to the main line (`whatsapp_primary`).
 * If the second line is empty in the admin, everyone gets the main line.
 * The numbers themselves stay in the database; only the routing lives here.
 */
const secondaryLineLocales: ReadonlySet<string> = new Set(['it', 'ru', 'tr']);

export type WhatsAppContacts = {
  whatsapp_primary?: string | null | undefined;
  whatsapp_secondary?: string | null | undefined;
};

export function whatsappNumberFor(
  locale: string,
  contacts: WhatsAppContacts | null | undefined,
): string | null {
  const base = locale.toLowerCase().split('-')[0] ?? '';
  const secondary = contacts?.whatsapp_secondary || null;
  const primary = contacts?.whatsapp_primary || null;
  return secondaryLineLocales.has(base) && secondary ? secondary : primary;
}
