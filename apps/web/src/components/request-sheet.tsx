'use client';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import type { FormEvent } from 'react';
import type { ShellSite } from '@stella/shared/card-trip';
import {
  bookingSchema,
  minBookingDate,
  maxBookingDate,
  confirmationSchema,
  quoteChangedSchema,
  quoteSchema,
  requiresPrivateRequest,
  stayDays,
  type Quote,
  type QuoteInput,
} from '@stella/shared/booking';
import { lastPlannedDay, planDays } from '@stella/shared/days';
import { normalizeBookingPhone } from '@stella/shared/phone';
import { money, track } from '@/lib/links';
import { bookingSubmissionId, bookingTabSeed } from '@/lib/booking-submission';
import { Panel, Stepper } from './primitives';
import { useTripStore } from './store';
import { Content } from './text';
import { DateRange } from './date-range';
import { countries, popular } from './countries';
import { CountryPicker } from './country-picker';
import { RequestSummaryCard } from './request-summary';
import type { RequestSummary } from '@/lib/request-summary';
import { useApiOrigin } from './runtime-config';
import { useCurrency } from './currency';
export default function RequestSheet({
  site,
}: {
  site: Pick<ShellSite, 'pickup_areas' | 'booking_min_days_ahead'> | null;
}) {
  const currency = useCurrency();
  const apiOrigin = useApiOrigin();
  const t = useTranslations(),
    locale = useLocale(),
    router = useRouter();
  const state = useTripStore((s) => s.request),
    rest = useTripStore((s) => s.rest),
    form = useRef<HTMLFormElement>(null),
    dateField = useRef<HTMLFieldSetElement>(null);
  const [adults, setAdults] = useState(state?.adults ?? 1),
    [children, setChildren] = useState(0),
    [pickedFormat, setFormat] = useState<'group' | 'private'>(
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
    [countryOpen, setCountryOpen] = useState(false),
    [phoneInput, setPhoneInput] = useState(''),
    [area, setArea] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [failure, setFailure] = useState<
      'requestError' | 'requestRateLimited' | null
    >(null),
    [priceId, setPriceId] = useState(''),
    [hours, setHours] = useState(1);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [quoteResult, setQuoteResult] = useState<{
    key: string;
    date: string;
    value: Quote | null;
    revised?: boolean;
  } | null>(null);
  const [success, setSuccess] = useState<
    import('@stella/shared/booking').Confirmation | null
  >(null);
  const [summary, setSummary] = useState<RequestSummary | null>(null);
  const opened = useRef(Date.now()),
    tabSeed = useRef<string | null>(null),
    abort = useRef<AbortController | null>(null),
    quoteNotice = useRef<HTMLParagraphElement>(null);
  const privateRequired = requiresPrivateRequest(state?.trips ?? []);
  const format = privateRequired ? 'private' : pickedFormat;
  const quoteInput: QuoteInput | null =
    state && date
      ? {
          items: state.trips.map((trip) => ({
            trip_slug: trip.slug,
            ...(state.trips.length === 1 && priceId
              ? { price_id: priceId }
              : {}),
            ...(state.trips.length === 1 && hours > 1 ? { hours } : {}),
          })),
          start_date: date,
          rest_days: rest,
          ...(state.preserveOrder ? { preserve_order: true } : {}),
          adults,
          children,
          format,
          locale,
        }
      : null;
  const quoteBody = quoteInput ? JSON.stringify(quoteInput) : '';
  const quoteKey = quoteBody + '/' + quoteAttempt;
  const currentQuote = quoteResult?.key === quoteKey ? quoteResult : null;
  const quote = currentQuote?.value;
  const quoteChanged = currentQuote?.revised === true;
  const phone = normalizeBookingPhone(phoneInput, country);
  useEffect(() => {
    if (!quoteBody) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(new URL('/v1/requests/quote', apiOrigin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: quoteBody,
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('quote');
        const value = quoteSchema.parse(await response.json());
        if (!controller.signal.aborted)
          setQuoteResult({ key: quoteKey, date, value });
      } catch {
        if (!controller.signal.aborted)
          setQuoteResult({ key: quoteKey, date, value: null });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiOrigin, date, quoteBody, quoteKey]);
  useEffect(() => {
    if (quoteChanged) quoteNotice.current?.focus();
  }, [quoteChanged, quote?.quote_id]);
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
  const quotedItem =
    single && quoteResult?.date === date
      ? quoteResult.value?.items[0]
      : undefined;
  const activePriceId =
    priceId &&
    !quoteChanged &&
    quotedItem?.price_options.some((option) => option.id === priceId)
      ? priceId
      : (quotedItem?.selected_price_id ?? '');
  const dateLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
  const serviceLabel = (start: string, end: string) => {
    const at = (day: string) => new Date(day + 'T12:00:00Z');
    return start === end
      ? dateLabel.format(at(start))
      : dateLabel.formatRange(at(start), at(end));
  };
  const finalService = quote?.items.at(-1);
  const needed = finalService
    ? stayDays(date, finalService.service_end_date)
    : lastPlannedDay(planDays(trips, rest, state.preserveOrder));
  function clearPhoneError() {
    setErrors((current) => {
      if (!current.phone) return current;
      const next = { ...current };
      delete next.phone;
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (abort.current || !ready) return;
    const data = new FormData(event.currentTarget);
    const submittedPhone = normalizeBookingPhone(
      String(data.get('phone') ?? ''),
      country,
    );
    const ages = String(data.get('child_ages') ?? '').trim();
    const parsed = bookingSchema.safeParse({
      ...quoteInput,
      mode: single ? 'single' : 'multi',
      items: (
        quoteInput?.items ?? trips.map((trip) => ({ trip_slug: trip.slug }))
      ).map(({ trip_slug, ...selection }) => ({
        trip_slug,
        ...selection,
        ...(single && priceId
          ? {
              price_id: quote?.items[0]?.price_options.some(
                (option) => option.id === priceId,
              )
                ? priceId
                : undefined,
            }
          : {}),
      })),
      start_date: date,
      quote_id: quote?.quote_id,
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
      phone: submittedPhone,
      email: String(data.get('email') ?? ''),
      notes: String(data.get('notes') ?? ''),
      locale,
      currency,
      hp: String(data.get('website') ?? ''),
      t: opened.current,
    });
    if (!parsed.success) {
      const mapped = Object.fromEntries(
        parsed.error.issues.map((i) => [
          String(i.path[0]),
          t(i.path[0] === 'phone' ? 'phoneInvalid' : 'invalid'),
        ]),
      );
      setErrors(mapped);
      const first = Object.keys(mapped)[0];
      requestAnimationFrame(() => {
        if (first === 'start_date' || first === 'end_date') {
          const dates = dateField.current;
          const enabled = '.range-day:not(:disabled)';
          (
            dates?.querySelector<HTMLButtonElement>(
              enabled + '[aria-pressed=true]',
            ) ?? dates?.querySelector<HTMLButtonElement>(enabled)
          )?.focus();
          return;
        }
        if (first === 'pickup_area') {
          form.current
            ?.querySelector<HTMLElement>('#booking-pickup button')
            ?.focus();
          return;
        }
        const element = form.current?.querySelector<HTMLElement>(
          '[name="' + first + '"]',
        );
        element?.focus();
      });
      return;
    }
    if (!quote) return;
    const lastService = quote.items
      .map((item) => item.service_end_date)
      .sort()
      .at(-1);
    if (end && lastService && end < lastService) {
      setErrors({ end_date: t('planNeeds', { days: needed }) });
      requestAnimationFrame(() =>
        dateField.current
          ?.querySelector<HTMLButtonElement>('.range-day:not(:disabled)')
          ?.focus(),
      );
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      tabSeed.current ??= bookingTabSeed();
      const submissionId = await bookingSubmissionId(
        parsed.data,
        tabSeed.current,
      );
      if (controller.signal.aborted) return;
      const response = await fetch(new URL('/v1/requests', apiOrigin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, submission_id: submissionId }),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null);
        const revised = quoteChangedSchema.safeParse(problem);
        if (revised.success) {
          setQuoteResult((current) =>
            current?.key === quoteKey
              ? { ...current, value: revised.data.quote, revised: true }
              : current,
          );
          return;
        }
        if (problem?.error?.code === 'PICKUP_AREA_INVALID') {
          setErrors({ pickup_area: t('invalid') });
          setArea('');
          router.refresh();
          form.current
            ?.querySelector<HTMLElement>('#booking-pickup button')
            ?.focus();
        } else {
          setFailure(
            response.status === 429 ? 'requestRateLimited' : 'requestError',
          );
        }
        track('request_submit_error');
        return;
      }
      const confirmed = confirmationSchema.parse(await response.json());
      const titles = new Map(trips.map((trip) => [trip.slug, trip.title.text]));
      const sent: RequestSummary = {
        name: parsed.data.name,
        start: parsed.data.start_date,
        end: parsed.data.end_date ?? lastService ?? parsed.data.start_date,
        adults: parsed.data.adults,
        children: parsed.data.children,
        format: parsed.data.format,
        area: parsed.data.pickup_area,
        hotel: parsed.data.hotel ?? '',
        items: quote.items.map((item) => ({
          title: titles.get(item.trip_slug) ?? item.trip_slug,
          start: item.service_date,
          end: item.service_end_date,
          amount: item.amount_eur,
        })),
        known: quote.known_eur,
        estimate: quote.estimate_eur,
      };
      setSummary(sent);
      try {
        sessionStorage.setItem(
          'stella.confirmation.' + confirmed.ref,
          JSON.stringify({
            ...confirmed,
            summary: sent,
            expires: Date.now() + 30 * 60 * 1000,
          }),
        );
      } catch {
        /* The confirmation remains displayed before navigation. */
      }
      track('request_submit_ok');
      useTripStore.getState().completeRequest(
        confirmed.ref,
        trips.map((trip) => trip.slug),
      );
      setSuccess(confirmed);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      track('request_submit_error');
      setFailure('requestError');
    } finally {
      abort.current = null;
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
          name === 'name' ? 'name' : name === 'email' ? 'email' : 'off'
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
      onEscapeKeyDown={(event) => {
        if (!countryOpen) return;
        event.preventDefault();
        setCountryOpen(false);
      }}
    >
      <div className="request-body">
        {success ? (
          <div className="confirmation">
            <span className="confirmation-badge" aria-hidden="true">
              <Check size={26} strokeWidth={2.4} />
            </span>
            <h2>{t('sent')}</h2>
            <p>{t('sentSub')}</p>
            {summary ? (
              <RequestSummaryCard reference={success.ref} summary={summary} />
            ) : (
              <pre>{success.message}</pre>
            )}
            <div className="confirmation-actions">
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
          </div>
        ) : (
          <>
            <p className="kicker">{t('request')}</p>
            <h2>{single ? <Content value={trip.title} /> : t('myTrip')}</h2>
            <p className="small-text">{t('noPayment')}</p>
            <form ref={form} onSubmit={submit} noValidate>
              <fieldset>
                <legend>{t('format')}</legend>
                {privateRequired ? (
                  <div>
                    <strong>{t('private')}</strong>
                    <p className="small-text">{t('privateRequired')}</p>
                  </div>
                ) : (
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
                )}
              </fieldset>
              <DateRange
                ref={dateField}
                start={date}
                end={end}
                min={minBookingDate(undefined, site?.booking_min_days_ahead)}
                max={maxBookingDate()}
                needed={needed}
                error={errors.start_date ?? errors.end_date}
                onChange={(a, b) => {
                  if (a !== date) setPriceId('');
                  setDate(a);
                  setEnd(b);
                  if (errors.start_date || errors.end_date) {
                    setErrors(
                      ({ start_date: _start, end_date: _end, ...rest }) => rest,
                    );
                  }
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
              {quotedItem && quotedItem.price_options.length > 1 && (
                <fieldset className="price-options">
                  <legend>{t('priceOption')}</legend>
                  <div className="price-option-list">
                    {quotedItem.price_options.map((p) => {
                      const active = p.id === activePriceId;
                      return (
                        <button
                          type="button"
                          key={p.id}
                          className={'price-option' + (active ? ' active' : '')}
                          data-price-id={p.id}
                          aria-pressed={active}
                          onClick={() => setPriceId(p.id)}
                        >
                          <span
                            className="price-option-mark"
                            aria-hidden="true"
                          />
                          <span className="price-option-label">
                            {p.label?.text ??
                              t(p.unit === 'group' ? 'groupUnit' : p.unit)}
                          </span>
                          <strong>
                            {p.amount_eur === null ? (
                              t('onRequest')
                            ) : (
                              <bdi>{money(p.amount_eur, locale, currency)}</bdi>
                            )}
                          </strong>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              {quotedItem?.price_options.some(
                (p) => p.id === activePriceId && p.unit === 'hour',
              ) && (
                <Stepper
                  label={t('hours')}
                  min={1}
                  max={24}
                  value={hours}
                  onChange={setHours}
                />
              )}
              <fieldset
                id="booking-pickup"
                aria-describedby={
                  errors.pickup_area ? 'pickup-error' : undefined
                }
              >
                <legend>{t('area')}</legend>
                <div className="pickup-chips">
                  {(site?.pickup_areas ?? []).map((a) => (
                    <button
                      type="button"
                      className={'chip ' + (area === a ? 'active' : '')}
                      aria-pressed={area === a}
                      key={a}
                      onClick={() => {
                        setArea(a);
                        setErrors((current) => ({
                          ...current,
                          pickup_area: '',
                        }));
                      }}
                    >
                      {a === 'Other' ? t('other') : a}
                    </button>
                  ))}
                </div>
                {!site?.pickup_areas.length && <p>{t('unavailableSub')}</p>}
                {errors.pickup_area && (
                  <p className="field-error" id="pickup-error">
                    {errors.pickup_area}
                  </p>
                )}
              </fieldset>
              {field('hotel', t('hotel'))}
              {field('name', t('name'), 'text', true)}
              <CountryPicker
                country={country}
                open={countryOpen}
                onOpenChange={setCountryOpen}
                onSelect={(code) => {
                  setCountry(code);
                  setCountryOpen(false);
                  clearPhoneError();
                }}
              />
              <div className="field">
                <label htmlFor="booking-phone">{t('phone')}</label>
                <input
                  id="booking-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  dir="ltr"
                  maxLength={48}
                  required
                  value={phoneInput}
                  onChange={(event) => {
                    setPhoneInput(event.target.value);
                    clearPhoneError();
                  }}
                  aria-invalid={!!errors.phone}
                  aria-describedby={
                    errors.phone
                      ? 'error-phone booking-phone-hint'
                      : 'booking-phone-hint'
                  }
                />
                <p
                  className="small-text"
                  id="booking-phone-hint"
                  aria-live="polite"
                >
                  {phone ? (
                    <>
                      {t('phonePreview')}{' '}
                      <strong>
                        <bdi dir="ltr">{phone}</bdi>
                      </strong>
                    </>
                  ) : (
                    t('phoneHint')
                  )}
                </p>
                {errors.phone && (
                  <p className="field-error" id="error-phone">
                    {errors.phone}
                  </p>
                )}
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
              {quote && (
                <ul className="quote-items">
                  {quote.items.map((item) => (
                    <li key={item.trip_slug}>
                      <span>
                        <Content
                          value={
                            trips.find((trip) => trip.slug === item.trip_slug)
                              ?.title ?? null
                          }
                        />
                        <small>
                          <bdi>
                            {serviceLabel(
                              item.service_date,
                              item.service_end_date,
                            )}
                          </bdi>
                        </small>
                      </span>
                      <bdi>
                        {item.amount_eur === null
                          ? t('onRequest')
                          : money(item.amount_eur, locale, currency)}
                      </bdi>
                    </li>
                  ))}
                </ul>
              )}
              <div
                className="estimate-summary"
                aria-live="polite"
                aria-atomic="true"
              >
                {quote?.estimate_eur === null && quote.known_eur > 0 && (
                  <div className="estimate-subtotal">
                    <span>{t('pricedTripsSubtotal')}</span>
                    <bdi>{money(quote.known_eur, locale, currency)}</bdi>
                  </div>
                )}
                <div className="estimate">
                  <span>{t('estimate')}</span>
                  {quote ? (
                    <strong>
                      {quote.estimate_eur === null ? (
                        t('onRequest')
                      ) : (
                        <bdi>{money(quote.estimate_eur, locale, currency)}</bdi>
                      )}
                    </strong>
                  ) : (
                    <span>
                      {t(
                        !date
                          ? 'quoteChooseDate'
                          : currentQuote
                            ? 'quoteUnavailable'
                            : 'quoteLoading',
                      )}
                    </span>
                  )}
                </div>
              </div>
              {date && currentQuote?.value === null && (
                <button
                  type="button"
                  className="button line"
                  onClick={() => setQuoteAttempt((n) => n + 1)}
                >
                  {t('retry')}
                </button>
              )}
              {quoteChanged && (
                <p ref={quoteNotice} tabIndex={-1} role="alert">
                  {t('quoteChanged')}
                </p>
              )}
              <p className="small-text">{t('childrenAsk')}</p>
              {failure && (
                <p role="alert" className="field-error">
                  {t(failure)}
                </p>
              )}
              <button
                className="button ink wide"
                disabled={busy || !ready || (!!date && !quote)}
              >
                {t(busy ? 'sending' : 'sendRequest')}
              </button>
            </form>
          </>
        )}
      </div>
    </Panel>
  );
}
