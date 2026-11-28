import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowUpRight, Bus, KeyRound, MapPin, Wallet } from 'lucide-react';
import { Reveal } from '@/components/reveal';
import { googleListingUrl, quotesFor } from '@/lib/why-us-quotes';
import './why-us.css';

/**
 * Home "Why Stella" section: who we are, real Google reviews in the visitor's
 * language, then the facts every trip shares. Every claim comes from the
 * catalog, DECISIONS.md, the owner (founded 2005, confirmed 2026-11-27) or
 * data/google-reviews.json. Never add years, counts or ratings that the owner
 * has not confirmed or that do not come from a data file or the DB.
 */
const facts = [
  { key: 'Pickup', Icon: Bus },
  { key: 'Private', Icon: KeyRound },
  { key: 'Pay', Icon: Wallet },
  { key: 'Local', Icon: MapPin },
] as const;

export async function WhyUs() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const quotes = quotesFor(locale);
  return (
    <section className="section why-us" aria-labelledby="why-us-heading">
      <Reveal>
        <p className="kicker section-kicker">{t('whyKicker')}</p>
        <div className="section-heading">
          <h2 id="why-us-heading">{t('whyTitle')}</h2>
          <p>{t('whySub')}</p>
        </div>
      </Reveal>
      {quotes.length > 0 && (
        <>
          {/* The Google rating and review count were a dated capture
              (2026-11-26) and are not shown until they can be kept current;
              the verbatim quotes and the link to the live listing stay. */}
          <div
            className="why-quotes"
            // A horizontally scrolling region must be reachable by keyboard
            // on phones (WCAG 2.1.1).
            role="region"
            aria-label={t('whyGuests')}
            tabIndex={0}
          >
            <ul className="why-quote-list">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Reveal className="why-quote">
                    <span className="why-stars" aria-hidden="true">
                      ★★★★★
                    </span>
                    {/* dir="auto": a quote keeps its own direction on RTL pages. */}
                    <blockquote lang={q.lang} dir="auto">
                      <p>{q.text}</p>
                    </blockquote>
                    <p className="why-author">
                      <strong dir="auto">{q.author}</strong>
                      <span>{t('whyGoogleReview')}</span>
                    </p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
          <a
            className="text-link why-all"
            href={googleListingUrl}
            target="_blank"
            rel="noopener"
          >
            {t('whyReadAll')}
            <ArrowUpRight size={16} aria-hidden="true" />
            <span className="sr-only"> {t('whyNewTab')}</span>
          </a>
        </>
      )}
      <ul className="why-grid">
        {facts.map(({ key, Icon }) => (
          <li key={key}>
            <Reveal className="why-card">
              <span className="why-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <h3>{t(`why${key}Title`)}</h3>
              <p>{t(`why${key}Text`)}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
