import { getTranslations } from 'next-intl/server';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { getSite } from '@/lib/api';
import { Media } from '@/components/media';
import { Content } from '@/components/text';
import { whatsapp } from '@/lib/links';
import { metadataFor } from '@/lib/seo';
import { Unavailable } from '@/components/unavailable';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  return metadataFor(locale, '/contact', t('contact'));
}
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations();
  let site;
  try {
    site = await getSite(locale);
  } catch {
    return <Unavailable />;
  }
  return (
    <main id="main" className="wrap content-page">
      <p className="kicker">Stella Sharm Tours</p>
      <h1>{t('contact')}</h1>
      <div className="contact-layout">
        <div>
          <h2>
            <Content value={site.home.contact_heading} />
          </h2>
          <p>
            <Content value={site.home.contact_text} />
          </p>
          <div className="button-row">
            {[site.contacts.whatsapp_primary, site.contacts.whatsapp_secondary]
              .filter(Boolean)
              .map((phone, i) => (
                <a
                  className={'button ' + (i ? 'line wa-line' : 'wa')}
                  key={phone}
                  href={whatsapp(phone) ?? undefined}
                >
                  <WhatsAppIcon size={19} />
                  {t('whatsapp')} <bdi>{phone}</bdi>
                </a>
              ))}
          </div>
          {site.contacts.email && (
            <p>
              <a href={'mailto:' + site.contacts.email}>
                {site.contacts.email}
              </a>
            </p>
          )}
          {site.contacts.phone && (
            <p>
              <a href={'tel:' + site.contacts.phone}>
                <bdi>{site.contacts.phone}</bdi>
              </a>
            </p>
          )}
        </div>
        <div className="office-card">
          {site.map_image && (
            <div className="office-map">
              <Media
                media={site.map_image}
                sizes="(max-width:767px) 100vw, 50vw"
              />
            </div>
          )}
          <Content value={site.address} />
          {site.hours && (
            <p>
              <Content value={site.hours} />
            </p>
          )}
          <div className="button-row">
            {site.social
              .filter((s) => /^https:\/\//.test(s.url))
              .map((s) => (
                <a
                  className="text-link"
                  key={s.url}
                  href={s.url}
                  rel="noopener noreferrer"
                >
                  {s.label}
                </a>
              ))}
          </div>
        </div>
      </div>
    </main>
  );
}
