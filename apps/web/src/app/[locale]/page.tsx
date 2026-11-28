import { Suspense } from 'react';
import { HomeTripStories } from '@/components/home-trip-stories';
import { eligibleSlides } from '@stella/shared/hero';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { cardTrip, navCollection } from '@stella/shared/card-trip';
import type { Slide } from '@stella/shared/public-contract';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowUpRight, Car, UserRound, Clock, Route } from 'lucide-react';
import { getSite, getCollections } from '@/lib/api';
import { StoryHero } from '@/components/story-hero';
import { TripCard, CollectionCards } from '@/components/cards';
import { Content } from '@/components/text';
import { Reveal } from '@/components/reveal';
import { BuildWidget, PrivateTracker } from '@/components/home-widgets';
import { whatsapp } from '@/lib/links';
import { metadataFor, JsonLd } from '@/lib/seo';
import { Unavailable } from '@/components/unavailable';
import { siteOrigin } from '@/lib/env';
import { graph, orgId, webPage } from '@/lib/structured-data';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return metadataFor(locale, '', t('seoHomeTitle'), t('seoHomeDescription'));
}
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations();
  let site, collections;
  try {
    [site, collections] = await Promise.all([
      getSite(locale),
      getCollections(locale),
    ]);
  } catch {
    return <Unavailable />;
  }
  const wa = whatsapp(site.contacts.whatsapp_primary),
    first = collections[0];
  const slides = eligibleSlides(site.hero_slides);
  const fallback: Slide | null = first
    ? {
        id: 'fallback',
        title: first.headline,
        kicker: first.name,
        subline: first.subline,
        cta_label: { text: t('seeTrips'), lang: locale },
        href: '/c/' + first.slug,
        cover: first.cover,
        duration_s: 6,
        device: 'all',
        starts_at: null,
        ends_at: null,
      }
    : null;
  const icons = [Car, UserRound, Clock, Route];
  return (
    <>
      <main id="main">
        <StoryHero slides={slides} whatsappUrl={wa} fallback={fallback} />
        <div className="content-sheet">
          <div className="wrap">
            <section
              className="private-block section"
              aria-labelledby="private-heading"
            >
              <PrivateTracker />
              <div className="private-intro">
                <p className="kicker">{t('privateTitle')}</p>
                <h2 id="private-heading">
                  <Content value={site.home.private_heading} />
                </h2>
                <p>
                  <Content value={site.home.private_text} />
                </p>
                <div className="perks">
                  {site.private_perks.map((p, i) => {
                    const Icon = icons[i % icons.length] ?? Car;
                    return (
                      <div className="perk" key={i}>
                        <span>
                          <Icon size={18} />
                        </span>
                        <div>
                          <strong>
                            <Content value={p.title} />
                          </strong>
                          <small>
                            <Content value={p.sub} />
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="button-row">
                  <Link
                    className="button gold"
                    href={'/' + locale + '/c/private'}
                  >
                    {t('privateTrips')}
                    <ArrowUpRight size={18} />
                  </Link>
                  {wa && (
                    <a className="text-link" href={wa}>
                      {t('privateQuote')}
                    </a>
                  )}
                </div>
              </div>
              <div className="private-carousel">
                {site.private_trips.map((trip) => (
                  <TripCard key={trip.slug} trip={cardTrip(trip)} compact />
                ))}
              </div>
            </section>
            <Suspense fallback={null}>
              <HomeTripStories locale={locale} />
            </Suspense>
            <section className="section" id="journeys">
              <Reveal>
                <p className="kicker section-kicker">{t('journeys')}</p>
                <div className="section-heading">
                  <h2>{t('choose')}</h2>
                  <p>{t('chooseSub')}</p>
                </div>
              </Reveal>
              <CollectionCards collections={collections} />
            </section>
            {site.featured_trips.length > 0 && (
              <section className="section">
                <Reveal>
                  <div className="section-heading">
                    <h2>{t('firstDays')}</h2>
                    <p>{t('firstDaysSub')}</p>
                  </div>
                </Reveal>
                <div className="featured-grid">
                  {site.featured_trips.map((trip) => (
                    <TripCard key={trip.slug} trip={cardTrip(trip)} />
                  ))}
                </div>
              </section>
            )}
            <Reveal>
              <section className="build-block section">
                <p className="kicker">{t('myTrip')}</p>
                <h2>
                  <Content value={site.home.build_heading} />
                </h2>
                <p>
                  <Content value={site.home.build_text} />
                </p>
                <div className="build-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <BuildWidget collections={collections.map(navCollection)} />
              </section>
            </Reveal>
            {site.how_steps.length > 0 && (
              <section className="section">
                <h2>{t('how')}</h2>
                <div className="how-grid">
                  {site.how_steps.map((s, i) => (
                    <Reveal key={i}>
                      <span className="step-number">0{i + 1}</span>
                      <h3>
                        <Content value={s.title} />
                      </h3>
                      <p>
                        <Content value={s.text} />
                      </p>
                    </Reveal>
                  ))}
                </div>
                <p className="small-text">{t('noPayment')}</p>
              </section>
            )}
            <Reveal>
              <section className="contact-card section">
                <div>
                  <p className="kicker">Stella Sharm Tours</p>
                  <h2>
                    <Content value={site.home.contact_heading} />
                  </h2>
                  <p>
                    <Content value={site.home.contact_text} />
                  </p>
                </div>
                {wa && (
                  <a className="button wa" href={wa}>
                    <WhatsAppIcon size={19} />
                    {t('whatsapp')}
                  </a>
                )}
              </section>
            </Reveal>
          </div>
        </div>
      </main>
      <JsonLd
        value={graph([
          webPage(
            'WebPage',
            siteOrigin + '/' + locale,
            siteOrigin,
            locale,
            t('seoHomeTitle'),
            {
              description: t('seoHomeDescription'),
              mainEntity: { '@id': orgId(siteOrigin) },
            },
          ),
        ])}
      />
    </>
  );
}
