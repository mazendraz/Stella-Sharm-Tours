import { getTranslations } from 'next-intl/server';
import { Mail, MapPin, Phone } from 'lucide-react';
import { SocialIcon, isMapLink } from '@/components/social-icon';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { getSite } from '@/lib/api';
import { Media } from '@/components/media';
import { Content } from '@/components/text';
import { displayPhone, officeMap, whatsapp } from '@/lib/links';
import { metadataFor, JsonLd } from '@/lib/seo';
import { siteOrigin } from '@/lib/env';
import { graph, orgId, webPage } from '@/lib/structured-data';
import { whatsappNumberFor } from '@stella/shared/whatsapp';
import { Unavailable } from '@/components/unavailable';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  return metadataFor(
    locale,
    '/contact',
    t('contact'),
    t('seoContactDescription'),
  );
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
  const links = site.social.filter((s) => /^https:\/\//.test(s.url)),
    map = links.find((s) => isMapLink(s.label)),
    social = links.filter((s) => s !== map);
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
            {/* The line for this language comes first (owner, 2026-11-26). */}
            {[
              ...new Set([
                whatsappNumberFor(locale, site.contacts),
                site.contacts.whatsapp_primary,
                site.contacts.whatsapp_secondary,
              ]),
            ]
              .filter(Boolean)
              .map((phone, i) => (
                <a
                  className={'button ' + (i ? 'line wa-line' : 'wa')}
                  key={phone}
                  href={whatsapp(phone) ?? undefined}
                >
                  <WhatsAppIcon size={19} />
                  {t('whatsapp')} <bdi dir="ltr">{displayPhone(phone!)}</bdi>
                </a>
              ))}
          </div>
          {(site.contacts.phone || site.contacts.email) && (
            <ul className="contact-lines">
              {site.contacts.phone && (
                <li>
                  <a href={'tel:' + site.contacts.phone.replace(/[^\d+]/g, '')}>
                    <span className="contact-icon" aria-hidden="true">
                      <Phone size={20} />
                    </span>
                    <span className="contact-text">
                      <span className="contact-label">{t('contactCall')}</span>
                      <bdi dir="ltr">{displayPhone(site.contacts.phone)}</bdi>
                    </span>
                  </a>
                </li>
              )}
              {site.contacts.email && (
                <li>
                  <a href={'mailto:' + site.contacts.email}>
                    <span className="contact-icon" aria-hidden="true">
                      <Mail size={20} />
                    </span>
                    <span className="contact-text">
                      <span className="contact-label">{t('contactEmail')}</span>
                      <bdi dir="ltr">{site.contacts.email}</bdi>
                    </span>
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="office-card">
          <a
            className="office-map-link"
            href={officeMap.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="office-map">
              {site.map_image ? (
                <Media
                  media={site.map_image}
                  sizes="(max-width:767px) 100vw, 50vw"
                />
              ) : (
                <img
                  src={officeMap.image}
                  alt=""
                  width={1200}
                  height={700}
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="office-map-pin" aria-hidden="true">
                <MapPin size={22} strokeWidth={2.2} />
              </span>
              <span className="office-map-cta">
                <SocialIcon label="Google Maps" size={16} />
                {t('openInMaps')}
              </span>
            </span>
          </a>
          {!site.map_image && (
            <p className="office-map-credit">© OpenStreetMap contributors</p>
          )}
          <Content value={site.address} />
          {site.hours && (
            <p>
              <Content value={site.hours} />
            </p>
          )}
          {social.length > 0 && (
            <>
              <h2 className="office-heading">{t('followUs')}</h2>
              <ul className="social-links">
                {social.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      <SocialIcon label={s.label} />
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <JsonLd
        value={graph([
          webPage(
            'ContactPage',
            siteOrigin + '/' + locale + '/contact',
            siteOrigin,
            locale,
            t('contact'),
            {
              description: t('seoContactDescription'),
              mainEntity: { '@id': orgId(siteOrigin) },
            },
          ),
        ])}
      />
    </main>
  );
}
