import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import en from '../../messages/en.json';
import it from '../../messages/it.json';
import es from '../../messages/es.json';
import ru from '../../messages/ru.json';
import fr from '../../messages/fr.json';
import de from '../../messages/de.json';
import tr from '../../messages/tr.json';
import { env } from '@/lib/env';
const core: Record<string, typeof en> = { en, it, es, fr, de, ru, tr };
export default getRequestConfig(async () => {
  const locale = (await headers()).get('x-stella-locale') ?? 'en';
  let messages = core[locale] ?? en;
  if (!core[locale]) {
    try {
      const r = await fetch(
        new URL(
          '/v1/public/messages?locale=' + encodeURIComponent(locale),
          env.API_INTERNAL_URL,
        ),
        {
          next: { revalidate: 60, tags: ['ui:' + locale] },
          signal: AbortSignal.timeout(3000),
        },
      );
      if (r.ok) {
        const data = await r.json();
        messages = {
          ...en,
          ...Object.fromEntries(
            Object.entries(data).filter(
              ([k, v]) => k in en && typeof v === 'string',
            ),
          ),
        };
      }
    } catch {
      /* English remains available while service is down. */
    }
  }
  return { locale, messages, timeZone: 'Africa/Cairo' };
});
