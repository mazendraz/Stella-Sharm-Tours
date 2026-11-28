import { getSite, getCollections, getCollection } from '@/lib/api';
import { siteOrigin } from '@/lib/env';
import { clip } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/**
 * Optional /llms.txt (llmstxt.org): a plain index of the public catalogue for
 * AI tools that look for one. It is not a ranking factor and no search engine
 * requires it. Built only from published API data, the same as the sitemap,
 * so drafts, prices on request and customer data never appear here.
 */
export async function GET() {
  try {
    const [site, collections] = await Promise.all([
      getSite('en'),
      getCollections('en'),
    ]);
    const details = await Promise.all(
      collections
        .filter((c) => c.kind === 'normal')
        .map((c) => getCollection(c.slug, 'en')),
    );
    const languages = site.locales
      .filter((l) => l.indexable)
      .map((l) => `${l.name} (${siteOrigin}/${l.code})`)
      .join(', ');
    const line = (name: string, url: string, note?: string | null) =>
      `- [${name}](${url})${note ? ': ' + clip(note, 200) : ''}`;
    const body = [
      `# ${site.name}`,
      '',
      `> Excursion and day-trip operator in Sharm El Sheikh, Egypt. Group and private tours; bookings are requests confirmed by staff, with no online payment.`,
      '',
      site.address ? `Office: ${site.address.text}` : null,
      site.contacts.phone ? `Phone: ${site.contacts.phone}` : null,
      `Languages: ${languages}`,
      '',
      '## Pages',
      line('Home', siteOrigin + '/en'),
      line('Questions and answers', siteOrigin + '/en/faq'),
      line('Contact', siteOrigin + '/en/contact'),
      ...collections.map((c) =>
        line(c.name.text, `${siteOrigin}/en/c/${c.slug}`, c.subline?.text),
      ),
      ...details.flatMap((detail) => [
        '',
        `## ${detail.collection.name.text}`,
        ...detail.trips.map((trip) =>
          line(
            trip.title.text,
            `${siteOrigin}/en/t/${trip.slug}`,
            trip.summary?.text,
          ),
        ),
      ]),
      '',
    ]
      .filter((l) => l !== null)
      .join('\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response(null, {
      status: 503,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }
}
