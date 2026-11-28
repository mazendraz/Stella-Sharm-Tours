/**
 * What the guest is looking at, read from the URL, so the floating WhatsApp
 * button can prefill a message about that page (trip, collection, My trip,
 * a sent request, FAQ) instead of a blank chat.
 */
export type WhatsAppPage =
  | { kind: 'trip'; slug: string }
  | { kind: 'collection'; slug: string }
  | { kind: 'myTrip' }
  | { kind: 'request'; ref: string }
  | { kind: 'faq' }
  | { kind: 'general' };

const slugPattern = /^[a-z0-9-]{1,120}$/;
const refPattern = /^STL-[A-Z0-9]{3,30}$/;

export function whatsappPage(path: string): WhatsAppPage {
  // "/en/t/ras-mohammed" → ["en", "t", "ras-mohammed"]
  const [, section, value, extra] = path
    .split(/[?#]/)[0]!
    .split('/')
    .filter(Boolean);
  if (section === 't' && value && slugPattern.test(value))
    return { kind: 'trip', slug: value };
  if (section === 'c' && value && slugPattern.test(value))
    return { kind: 'collection', slug: value };
  if (section === 'my-trip' && !value) return { kind: 'myTrip' };
  if (
    section === 'request' &&
    value === 'done' &&
    extra &&
    refPattern.test(extra)
  )
    return { kind: 'request', ref: extra };
  if (section === 'faq') return { kind: 'faq' };
  return { kind: 'general' };
}

type Translate = (key: string, values?: Record<string, string>) => string;

/**
 * The prefilled text in the page language. Trip and collection messages end
 * with the page link so the team sees exactly which page the guest means.
 * Only public page facts go in: never names, phone numbers or other guest data.
 */
export function whatsappMessage(
  page: WhatsAppPage,
  t: Translate,
  facts: { title?: string | null; trips?: string[]; url?: string | null },
): string {
  const withLink = (text: string) =>
    facts.url ? text + '\n' + facts.url : text;
  switch (page.kind) {
    case 'trip':
      return withLink(
        facts.title
          ? t('waMsgTrip', { title: facts.title })
          : t('waMsgGeneral'),
      );
    case 'collection':
      return withLink(
        facts.title
          ? t('waMsgCollection', { title: facts.title })
          : t('waMsgGeneral'),
      );
    case 'myTrip':
      return facts.trips?.length
        ? t('waMsgMyTrip', { trips: facts.trips.join(', ') })
        : t('waMsgGeneral');
    case 'request':
      return t('waMsgRequest', { ref: page.ref });
    case 'faq':
      return t('waMsgFaq');
    case 'general':
      return t('waMsgGeneral');
  }
}
