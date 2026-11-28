import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getContentList } from '@/lib/api';
import { Content } from '@/components/text';

/**
 * Published guides, destination and activity pages that list this trip as
 * related (the reverse of a guide's "Trips in this guide"). The API returns
 * published, non-archived pages only, so drafts never appear; nothing renders
 * when no page links here or the content API is unavailable.
 */
export async function TripGuides({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const pages = (await getContentList(locale).catch(() => [])).filter((p) =>
    p.related_trips.includes(slug),
  );
  if (!pages.length) return null;
  const t = await getTranslations();
  return (
    <section className="trip-guides wrap" aria-labelledby="trip-guides-h">
      <h2 id="trip-guides-h">{t('tripGuides')}</h2>
      <ul className="guide-links">
        {pages.slice(0, 4).map((page) => (
          <li key={page.slug}>
            <Link href={'/' + locale + '/guides/' + page.slug}>
              <Content value={page.title} />
            </Link>
            {page.summary && (
              <p>
                <Content value={page.summary} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
