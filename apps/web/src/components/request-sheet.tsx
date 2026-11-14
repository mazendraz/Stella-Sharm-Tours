'use client';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import type { ShellSite } from '@stella/shared/card-trip';
import {
  bookingSchema,
  cairoDate,
  maxBookingDate,
  confirmationSchema,
} from '@stella/shared/booking';
import { estimateTrip, estimateTrips } from '@stella/shared/price';
import { planDays } from '@stella/shared/days';
import { money, track } from '@/lib/links';
import { Panel, Stepper } from './primitives';
import { useTripStore } from './store';
import { Content } from './text';
import { DateRange } from './date-range';
import { countries, popular, flag } from './countries';
import { useApiOrigin } from './runtime-config';
export default function RequestSheet({
  site,
}: {
  site: Pick<ShellSite, 'pickup_areas'> | null;
}) {
  const apiOrigin = useApiOrigin();
  const t = useTranslations(),
    locale = useLocale(),
    router = useRouter();
  const state = useTripStore((s) => s.request),
    rest = useTripStore((s) => s.rest),
    form = useRef<HTMLFormElement>(null);
  const [adults, setAdults] = useState(state?.adults ?? 1),
    [children, setChildren] = useState(0),
    [format, setFormat] = useState<'group' | 'private'>(
      state?.format ?? 'group',
    ),
    [date, setDate] = useState(''),
    [end, setEnd] = useState(''),
    [country, setCountry] = useState(() => {
      // Visitor's region from the browser (en-GB → GB), else the site language.
      const region =
        typeof navigator !== 'undefined'
          ? navigator.language.split('-')[1]?.toUpperCase()
          : undefined;
      return countries.some(([c]) => c === region)
        ? region!
        : (popular[locale]?.[0] ?? '');
    }),
    [area, setArea] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [priceId, setPriceId] = useState(''),
    [hours, setHours] = useState(1);
  const [success, setSuccess] = useState<
    import('@stella/shared/booking').Confirmation | null
  >(null);
  const opened = useRef(Date.now()),
    abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!state) return;
    opened.current = Date.now();
    setReady(false);
    const timer = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(timer);
  }, [state]);
  if (!state) return null;
  const trips = state.trips,
    single = trips.length === 1,
    trip = trips[0];
  if (!trip) return null;
  const estimate = single
    ? estimateTrip(trip, adults, children, format, priceId || undefined, hours)
    : estimateTrips(trips, adults, children, format);
  const plan = planDays(trips, rest),
    needed = plan.length ? plan[plan.length - 1]!.day : 1;
  const names = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  })();
  const top = popular[locale] ?? [];
  // Windows has no flag emoji (it shows "US" letters instead), so skip them there.
  const flags =
    typeof navigator !== 'undefined' && !/Windows/i.test(navigator.userAgent);
  const name = (iso: string) => names?.of(iso) ?? iso;
  const label = ([iso, dial]: [string, string]) =>
    (flags ? flag(iso) + ' ' : '') + name(iso) + ' (' + dial + ')';
  const byName = [...countries].sort((a, b) =>
    name(a[0]).localeCompare(name(b[0]), locale),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready) return;
    const data = new FormData(event.currentTarget);
    const code = countries.find(([c]) => c === country)?.[1] ?? '';
    const phone = (code + String(data.get('phone') ?? '')).replace(
      /[\s()-]/g,
      '',
    );
    const ages = String(data.get('child_ages') ?? '').trim();
    const rows = plan
      .filter((row) => row.trip)
      .map((row) => ({
        trip_slug: row.trip!.slug,
        day_index: row.day,
        ...(single && priceId ? { price_id: priceId } : {}),
        ...(single && trip!.prices.some((p) => p.unit === 'hour')
          ? { hours }
          : {}),
      }));
    const parsed = bookingSchema.safeParse({
      mode: single ? 'single' : 'multi',
      items: rows,
      start_date: date,
      ...(end ? { end_date: end } : {}),
      rest_days: rest,
      adults,
      children,
      ...(ages
        ? { child_ages: ages.split(',').map((v) => Number(v.trim())) }
        : {}),
      format,
      pickup_area: area,
      hotel: String(data.get('hotel') ?? ''),
      name: String(data.get('name') ?? ''),
      phone,
      email: String(data.get('email') ?? ''),
      notes: String(data.get('notes') ?? ''),
      locale,
      hp: String(data.get('website') ?? ''),
      t: opened.current,
    });
    if (!parsed.success) {
      const mapped = Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), t('invalid')]),
      );
      setErrors(mapped);
      const first = Object.keys(mapped)[0];
      requestAnimationFrame(() => {
        const element = form.current?.querySelector<HTMLElement>(
          '[name="' + first + '"]',
        );
        element?.focus();
      });
      return;
    }
    setErrors({});
    setFailed(false);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch(new URL('/v1/requests', apiOrigin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('request');
      const confirmed = confirmationSchema.parse(await response.json());
      try {
        sessionStorage.setItem(
          'stella.confirmation.' + confirmed.ref,
          JSON.stringify({
            ...confirmed,
            expires: Date.now() + 30 * 60 * 1000,
          }),
        );
      } catch {
        /* The confirmation remains displayed before navigation. */
      }
      track('request_submit_ok');
      setSuccess(confirmed);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      track('request_submit_error');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const field = (
    name: string,
    label: string,
    type = 'text',
    required = false,
  ) => (
    <div className="field">
      <label htmlFor={'booking-' + name}>{label}</label>
      <input
        id={'booking-' + name}
        name={name}
        type={type}
        required={required}
        maxLength={name === 'name' ? 80 : name === 'email' ? 254 : 150}
        autoComplete={
          name === 'name'
            ? 'name'
            : name === 'email'
              ? 'email'
              : name === 'phone'
                ? 'tel-national'
                : 'off'
        }
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? 'error-' + name : undefined}
      />
      {errors[name] && (
        <p className="field-error" id={'error-' + name}>
          {errors[name]}
        </p>
      )}
    </div>
  );
  return (
    <Panel
      open
      onClose={() => useTripStore.getState().closeRequest()}
      title={t(success ? 'sent' : 'requestTrip')}
      returnTo={state.opener}
    >
      <div className="request-body">
        {success ? (
          <div className="confirmation">
            <p className="kicker">
              <bdi>{success.ref}</bdi>
            </p>
            <h2>{t('sent')}</h2>
            <p>{t('sentSub')}</p>
            <pre>{success.message}</pre>
            <a className="button wa" href={success.whatsapp_url}>
              <WhatsAppIcon size={19} />
              {t('openWhatsapp')}
            </a>
            <button
              className="button line"
              onClick={() => {
                useTripStore.getState().closeRequest();
                router.push('/' + locale + '/request/done/' + success.ref);
              }}
            >
              {t('close')}
            </button>
          </div>
        ) : (
          <>
            <p className="kicker">{t('request')}</p>
            <h2>{single ? <Content value={trip.title} /> : t('myTrip')}</h2>
            <p className="small-text">{t('noPayment')}</p>
            <form ref={form} onSubmit={submit} noValidate>
              <DateRange
                start={date}
                end={end}
                min={cairoDate()}
                max={maxBookingDate()}
                needed={needed}
                error={errors.start_date ?? errors.end_date}
                onChange={(a, b) => {
                  setDate(a);
                  setEnd(b);
                }}
              />
              <Stepper
                label={t('adults')}
                value={adults}
                onChange={setAdults}
                min={1}
              />
              <Stepper
                label={t('children')}
                value={children}
                onChange={setChildren}
                max={40}
              />
              {children > 0 && field('child_ages', t('childAges'))}
              {(trips.some((tr) => tr.format === 'both') || !single) && (
                <fieldset>
                  <legend>{t('format')}</legend>
                  <div className="segmented">
                    {(['group', 'private'] as const).map((m) => (
                      <button
                        type="button"
                        key={m}
                        aria-pressed={format === m}
                        className={m === format ? 'active' : ''}
                        onClick={() => setFormat(m)}
                      >
                        {t(m)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {single &&
                trip.prices.filter((p) => p.unit !== 'child').length > 1 && (
                  <div className="field">
                    <label htmlFor="booking-price">{t('priceOption')}</label>
                    <select
                      id="booking-price"
                      value={priceId}
                      onChange={(e) => setPriceId(e.target.value)}
                    >
                      {trip.prices
                        .filter((p) => p.unit !== 'child')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label?.text ??
                              t(p.unit === 'group' ? 'groupUnit' : p.unit)}{' '}
                            ·{' '}
                            {p.amount_eur === null
                              ? t('onRequest')
                              : money(p.amount_eur, locale)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              {trip.prices.some((p) => p.unit === 'hour') && (
                <Stepper
                  label={t('hours')}
                  min={1}
                  max={24}
                  value={hours}
                  onChange={setHours}
                />
              )}
              <fieldset>
                <legend>{t('area')}</legend>
                <div className="pickup-chips">
                  {(site?.pickup_areas ?? []).map((a) => (
                    <button
                      type="button"
                      className={'chip ' + (area === a ? 'active' : '')}
                      aria-pressed={area === a}
                      key={a}
                      onClick={() => setArea(a)}
                    >
                      {a === 'Other' ? t('other') : a}
                    </button>
                  ))}
                </div>
                <label className="sr-only" htmlFor="booking-area">
                  {t('area')}
                </label>
                <input
                  id="booking-area"
                  name="pickup_area"
                  value={area}
                  maxLength={100}
                  onChange={(e) => setArea(e.target.value)}
                  aria-invalid={!!errors.pickup_area}
                />
                {errors.pickup_area && (
                  <p className="field-error">{errors.pickup_area}</p>
                )}
              </fieldset>
              {field('hotel', t('hotel'))}
              {field('name', t('name'), 'text', true)}
              <div className="field">
                <label htmlFor="booking-country">{t('country')}</label>
                <select
                  id="booking-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  aria-invalid={!!errors.phone}
                >
                  <option value="">{t('chooseCountry')}</option>
                  {top.length > 0 && (
                    <optgroup label={t('popular')}>
                      {countries
                        .filter(([c]) => top.includes(c))
                        .map((c) => (
                          <option key={'top-' + c[0]} value={c[0]}>
                            {label(c)}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <optgroup label={t('allCountries')}>
                    {byName.map((c) => (
                      <option key={c[0]} value={c[0]}>
                        {label(c)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="phone-row">
                <span className="phone-prefix" aria-hidden="true">
                  {countries.find(([c]) => c === country)?.[1] ?? '+'}
                </span>
                {field('phone', t('phone'), 'tel', true)}
              </div>
              {field('email', t('email'), 'email')}
              <div className="field">
                <label htmlFor="booking-notes">{t('yourNotes')}</label>
                <textarea id="booking-notes" name="notes" maxLength={1000} />
              </div>
              <div className="honeypot" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              <div className="estimate">
                <span>{t('estimate')}</span>
                <strong>
                  <bdi>
                    {estimate.amount > 0
                      ? money(estimate.amount, locale)
                      : estimate.onRequest
                        ? ''
                        : money(0, locale)}
                  </bdi>
                  {estimate.onRequest && (
                    <small>
                      {estimate.amount > 0 ? t('plusRequest') : t('onRequest')}
                    </small>
                  )}
                </strong>
              </div>
              <p className="small-text">{t('childrenAsk')}</p>
              {failed && (
                <p role="alert" className="field-error">
                  {t('requestError')}
                </p>
              )}
              <button className="button ink wide" disabled={busy || !ready}>
                {t(busy ? 'sending' : 'sendRequest')}
              </button>
            </form>
          </>
        )}
      </div>
    </Panel>
  );
}
