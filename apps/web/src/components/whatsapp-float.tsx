'use client';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { WhatsAppIcon } from './whatsapp-icon';
import { useTripStore } from './store';
import { track, whatsapp } from '@/lib/links';
import { whatsappMessage, whatsappPage } from '@/lib/whatsapp-page';

/**
 * Floating WhatsApp button (bottom, inline-start = left in LTR). It lives in
 * TripNavigation so it shows on every page and inside the trip/collection
 * panels (Radix makes the page behind a panel inert). The message it prefills
 * depends on the page the guest is on.
 */
export function WhatsAppFloat({
  whatsappNumber,
}: {
  whatsappNumber?: string | null | undefined;
}) {
  const t = useTranslations(),
    path = usePathname(),
    stored = useTripStore((s) => s.whatsappNumber),
    number = whatsappNumber === undefined ? stored : whatsappNumber;
  const page = whatsappPage(path);
  const title = useTripStore((s) =>
    page.kind === 'trip'
      ? (s.cache[page.slug]?.title.text ?? null)
      : page.kind === 'collection'
        ? (s.collectionNames[page.slug]?.text ?? null)
        : null,
  );
  const ids = useTripStore((s) => s.ids),
    cache = useTripStore((s) => s.cache);
  // The absolute link is only known in the browser; read it after hydration
  // so server and client render the same first href.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(location.origin), []);
  const trips =
    page.kind === 'myTrip'
      ? ids.flatMap((id) => (cache[id] ? [cache[id].title.text] : []))
      : [];
  const url =
    origin && (page.kind === 'trip' || page.kind === 'collection')
      ? origin + path
      : null;
  const href = whatsapp(
    number,
    whatsappMessage(page, (key, values) => t(key, values), {
      title,
      trips,
      url,
    }),
  );
  if (!href) return null;
  return (
    <a
      className="wa-float"
      href={href}
      aria-label={t('waFloat')}
      title={t('waFloat')}
      onClick={() =>
        track('whatsapp_click', { source: 'float', page: page.kind })
      }
    >
      <WhatsAppIcon size={28} />
    </a>
  );
}
